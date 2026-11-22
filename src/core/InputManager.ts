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
  private readonly mouseButtons = new Set<number>();
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
    this.mouseButtons.clear();
  };

  private readonly onMouseMove = (e: MouseEvent): void => {
    // Locked mode: only movementX/Y are meaningful (clientX/Y stay frozen).
    if (this.mode === 'locked') {
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    }
  };

  // Fallback mode uses Pointer Events with manual clientX/Y deltas: works for mouse,
  // touch and trackpads alike and does not depend on movementX (0 in some browsers
  // when the pointer is not locked).
  private dragPointerId: number | null = null;
  private dragLastX = 0;
  private dragLastY = 0;
  private dragStartX = 0;
  private dragStartY = 0;
  private dragStartTime = 0;
  private dragButton = 0;
  private dragMoved = false;
  private longPressTimer = 0;

  private readonly onPointerDown = (e: PointerEvent): void => {
    if (this.mode !== 'fallback') return;
    if (this.dragPointerId !== null) return;
    this.dragPointerId = e.pointerId;
    this.dragLastX = e.clientX;
    this.dragLastY = e.clientY;
    this.dragStartX = e.clientX;
    this.dragStartY = e.clientY;
    this.dragStartTime = performance.now();
    this.dragButton = e.button;
    this.dragMoved = false;
    // Touch long-press (no movement) acts as a right click (place).
    if (e.pointerType === 'touch') {
      this.longPressTimer = window.setTimeout(() => {
        this.longPressTimer = 0;
        if (this.dragPointerId === e.pointerId && !this.dragMoved) {
          this.dragMoved = true; // consume: no tap on release
          for (const fn of this.clickListeners) fn(2);
        }
      }, 500);
    }
    try {
      this.element.setPointerCapture(e.pointerId);
    } catch {
      /* capture is best-effort */
    }
  };

  private readonly onPointerMove = (e: PointerEvent): void => {
    if (this.mode !== 'fallback' || e.pointerId !== this.dragPointerId) return;
    this.mouseDX += e.clientX - this.dragLastX;
    this.mouseDY += e.clientY - this.dragLastY;
    this.dragLastX = e.clientX;
    this.dragLastY = e.clientY;
    if (Math.abs(e.clientX - this.dragStartX) > 4 || Math.abs(e.clientY - this.dragStartY) > 4) this.dragMoved = true;
  };

  private readonly onPointerUp = (e: PointerEvent): void => {
    if (e.pointerId !== this.dragPointerId) return;
    this.dragPointerId = null;
    if (this.longPressTimer !== 0) {
      window.clearTimeout(this.longPressTimer);
      this.longPressTimer = 0;
    }
    // Short tap without movement = click (left: dig, right: place).
    if (!this.dragMoved && performance.now() - this.dragStartTime < 300 && e.type === 'pointerup') {
      for (const fn of this.clickListeners) fn(this.dragButton);
    }
    try {
      this.element.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  private readonly onMouseDown = (e: MouseEvent): void => {
    if (!this.active) {
      this.requestLock();
      return;
    }
    e.preventDefault();
    // In fallback mode the left button is also the drag-to-look button, so clicks
    // are detected as short taps on pointerup instead (see onPointerUp).
    if (this.mode === 'locked') {
      this.mouseButtons.add(e.button);
      for (const fn of this.clickListeners) fn(e.button);
    }
  };

  private readonly onMouseUp = (e: MouseEvent): void => {
    this.mouseButtons.delete(e.button);
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
    window.addEventListener('mouseup', this.onMouseUp);
    element.addEventListener('pointerdown', this.onPointerDown);
    element.addEventListener('pointermove', this.onPointerMove);
    element.addEventListener('pointerup', this.onPointerUp);
    element.addEventListener('pointercancel', this.onPointerUp);
    element.style.touchAction = 'none';
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

  /** Whether the Pointer Lock API exists at all in this browser. */
  static get pointerLockSupported(): boolean {
    return typeof HTMLElement !== 'undefined' && typeof HTMLElement.prototype.requestPointerLock === 'function';
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

  /** Mouse button currently held (0 left, 1 middle, 2 right). Only tracked in locked mode. */
  isMouseDown(button: number): boolean {
    return this.mouseButtons.has(button);
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
    this.mouseButtons.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.dragPointerId = null;
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
    window.removeEventListener('mouseup', this.onMouseUp);
    this.element.removeEventListener('pointerdown', this.onPointerDown);
    this.element.removeEventListener('pointermove', this.onPointerMove);
    this.element.removeEventListener('pointerup', this.onPointerUp);
    this.element.removeEventListener('pointercancel', this.onPointerUp);
    this.element.removeEventListener('wheel', this.onWheel);
    this.element.removeEventListener('contextmenu', this.onContextMenu);
    document.removeEventListener('pointerlockchange', this.onLockChange);
    document.removeEventListener('pointerlockerror', this.onLockError);
  }
}
