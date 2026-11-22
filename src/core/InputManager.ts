/**
 * Centralised keyboard / mouse / pointer-lock state.
 * Consumers poll `isDown(code)` and `consumeMouseDelta()` once per frame;
 * no game logic lives here.
 *
 * Two capture modes:
 *  - "locked":   real Pointer Lock (preferred).
 *  - "fallback": Pointer Lock is unavailable (e.g. cross-origin iframe without
 *                allow="pointer-lock"). The game is still active; dragging with a
 *                mouse button held rotates the view. ESC returns to the menu.
 */
export type CaptureMode = 'none' | 'locked' | 'fallback';

const LOCK_TIMEOUT_MS = 400;

export class InputManager {
  private readonly keys = new Set<string>();
  private mouseDX = 0;
  private mouseDY = 0;
  private wheelDelta = 0;
  private mode: CaptureMode = 'none';
  private lockTimer = 0;
  private lockAttempts = 0;
  private readonly element: HTMLElement;
  private readonly modeListeners: ((mode: CaptureMode) => void)[] = [];
  private readonly clickListeners: ((button: number) => void)[] = [];

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.code === 'Escape' && this.mode === 'fallback') {
      this.release();
      return;
    }
    // Keep F-keys / dev tools usable; everything else is game input while active.
    if (this.active && !e.code.startsWith('F')) e.preventDefault();
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
    if (this.mode === 'locked') {
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    } else if (this.mode === 'fallback' && e.buttons !== 0) {
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    }
  };

  private readonly onMouseDown = (e: MouseEvent): void => {
    if (!this.active) {
      this.requestLock();
      return;
    }
    e.preventDefault();
    for (const fn of this.clickListeners) fn(e.button);
  };

  private readonly onWheel = (e: WheelEvent): void => {
    if (!this.active) return;
    e.preventDefault();
    this.wheelDelta += Math.sign(e.deltaY);
  };

  private readonly onContextMenu = (e: Event): void => e.preventDefault();

  private readonly onLockChange = (): void => {
    const locked = document.pointerLockElement === this.element;
    this.clearLockTimer();
    if (locked) {
      this.setMode('locked');
    } else if (this.mode === 'locked') {
      // User pressed ESC (browser releases the lock) -> back to menu.
      this.setMode('none');
    }
  };

  private readonly onLockError = (): void => {
    this.clearLockTimer();
    this.enterFallback();
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

  /** Real pointer lock engaged. */
  get locked(): boolean {
    return this.mode === 'locked';
  }

  /** Game input should be processed (locked OR fallback drag mode). */
  get active(): boolean {
    return this.mode !== 'none';
  }

  get captureMode(): CaptureMode {
    return this.mode;
  }

  /**
   * Try to engage pointer lock. If the browser refuses (permission policy in an
   * embedded iframe, unsupported API, …) we transparently switch to fallback mode
   * so the game remains playable.
   */
  requestLock(): void {
    if (this.active) return;
    this.lockAttempts++;

    if (typeof this.element.requestPointerLock !== 'function') {
      this.enterFallback();
      return;
    }

    try {
      const result = this.element.requestPointerLock() as unknown;
      if (result instanceof Promise) {
        result.catch(() => {
          this.clearLockTimer();
          this.enterFallback();
        });
      }
    } catch {
      this.enterFallback();
      return;
    }

    // Some browsers neither resolve nor fire pointerlockerror when blocked by
    // permissions policy; a short timeout guarantees we never hang on the menu.
    this.clearLockTimer();
    this.lockTimer = window.setTimeout(() => {
      this.lockTimer = 0;
      if (this.mode === 'none') this.enterFallback();
    }, LOCK_TIMEOUT_MS);
  }

  /** Leave locked / fallback mode and return to the menu. */
  release(): void {
    this.clearLockTimer();
    if (document.pointerLockElement === this.element) {
      document.exitPointerLock(); // onLockChange will set mode -> none
      return;
    }
    this.setMode('none');
  }

  /** Backwards-compatible alias. */
  exitLock(): void {
    this.release();
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

  onModeChanged(fn: (mode: CaptureMode) => void): void {
    this.modeListeners.push(fn);
  }

  /** Backwards-compatible: fires with `active` whenever the mode changes. */
  onLockChanged(fn: (active: boolean) => void): void {
    this.modeListeners.push((mode) => fn(mode !== 'none'));
  }

  onClick(fn: (button: number) => void): void {
    this.clickListeners.push(fn);
  }

  private enterFallback(): void {
    if (this.mode !== 'none') return;
    this.setMode('fallback');
  }

  private setMode(mode: CaptureMode): void {
    if (this.mode === mode) return;
    this.mode = mode;
    this.keys.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
    for (const fn of this.modeListeners) fn(mode);
  }

  private clearLockTimer(): void {
    if (this.lockTimer !== 0) {
      window.clearTimeout(this.lockTimer);
      this.lockTimer = 0;
    }
  }

  dispose(): void {
    this.clearLockTimer();
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
