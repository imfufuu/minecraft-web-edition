/**
 * Centralised keyboard / mouse / pointer-lock state.
 * Consumers poll `isDown(code)` and `consumeMouseDelta()` once per frame;
 * no game logic lives here.
 */
export class InputManager {
  private readonly keys = new Set<string>();
  private mouseDX = 0;
  private mouseDY = 0;
  private wheelDelta = 0;
  private readonly element: HTMLElement;
  private readonly lockListeners: ((locked: boolean) => void)[] = [];
  private readonly clickListeners: ((button: number) => void)[] = [];

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    // Keep F-keys / dev tools usable; everything else is game input.
    if (this.locked && !e.code.startsWith('F')) e.preventDefault();
    this.keys.add(e.code);
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };

  private readonly onBlur = (): void => {
    // Avoid "stuck keys" when the window loses focus (alt-tab, tab switch).
    this.keys.clear();
  };

  private readonly onMouseMove = (e: MouseEvent): void => {
    if (!this.locked) return;
    this.mouseDX += e.movementX;
    this.mouseDY += e.movementY;
  };

  private readonly onMouseDown = (e: MouseEvent): void => {
    if (!this.locked) {
      this.requestLock();
      return;
    }
    e.preventDefault();
    for (const fn of this.clickListeners) fn(e.button);
  };

  private readonly onWheel = (e: WheelEvent): void => {
    if (!this.locked) return;
    e.preventDefault();
    this.wheelDelta += Math.sign(e.deltaY);
  };

  private readonly onContextMenu = (e: Event): void => e.preventDefault();

  private readonly onLockChange = (): void => {
    const locked = document.pointerLockElement === this.element;
    if (!locked) this.keys.clear();
    for (const fn of this.lockListeners) fn(locked);
  };

  private readonly onLockError = (): void => {
    for (const fn of this.lockListeners) fn(false);
  };

  constructor(element: HTMLElement) {
    this.element = element;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('mousemove', this.onMouseMove);
    element.addEventListener('mousedown', this.onMouseDown);
    element.addEventListener('wheel', this.onWheel, { passive: false });
    element.addEventListener('contextmenu', this.onContextMenu);
    document.addEventListener('pointerlockchange', this.onLockChange);
    document.addEventListener('pointerlockerror', this.onLockError);
  }

  get locked(): boolean {
    return document.pointerLockElement === this.element;
  }

  requestLock(): void {
    if (this.locked) return;
    // Some browsers return a Promise that can reject (e.g. ESC pressed too recently).
    const result = this.element.requestPointerLock() as unknown;
    if (result instanceof Promise) result.catch(() => undefined);
  }

  exitLock(): void {
    if (this.locked) document.exitPointerLock();
  }

  isDown(code: string): boolean {
    return this.keys.has(code);
  }

  /** Returns accumulated mouse delta since last call and resets it. */
  consumeMouseDelta(): { dx: number; dy: number } {
    const d = { dx: this.mouseDX, dy: this.mouseDY };
    this.mouseDX = 0;
    this.mouseDY = 0;
    return d;
  }

  /** Returns accumulated wheel steps (±1 per notch) since last call and resets. */
  consumeWheel(): number {
    const w = this.wheelDelta;
    this.wheelDelta = 0;
    return w;
  }

  onLockChanged(fn: (locked: boolean) => void): void {
    this.lockListeners.push(fn);
  }

  onClick(fn: (button: number) => void): void {
    this.clickListeners.push(fn);
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    document.removeEventListener('mousemove', this.onMouseMove);
    this.element.removeEventListener('mousedown', this.onMouseDown);
    this.element.removeEventListener('wheel', this.onWheel);
    this.element.removeEventListener('contextmenu', this.onContextMenu);
    document.removeEventListener('pointerlockchange', this.onLockChange);
    document.removeEventListener('pointerlockerror', this.onLockError);
  }
}
