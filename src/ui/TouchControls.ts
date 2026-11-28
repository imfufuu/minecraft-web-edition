import type { InputManager } from '../core/InputManager';

/**
 * On-screen controls for devices without keyboard/mouse:
 *  - left-bottom analog joystick (movement),
 *  - right-bottom buttons: jump/up, down (fly), fly toggle,
 *  - top-right buttons: debug panel toggle (F3) and menu (ESC) — shown on every device.
 * Looking around is done by dragging anywhere else on the canvas (handled by InputManager).
 */
export class TouchControls {
  private readonly root: HTMLDivElement;
  private readonly stick: HTMLDivElement;
  private readonly knob: HTMLDivElement;
  private readonly flyBtn: HTMLButtonElement;
  private readonly downBtn: HTMLButtonElement;
  private readonly input: InputManager;
  private stickPointer: number | null = null;
  private stickCX = 0;
  private stickCY = 0;
  private readonly radius = 48;
  private visible = false;
  /** The always-on top-right row (F3, ☰) — exposed so later stages (e.g. C2 water visibility) can pair it with extra buttons. */
  readonly sysBtns: HTMLDivElement;

  constructor(input: InputManager, onToggleDebug: () => void, parent: HTMLElement = document.body) {
    this.input = input;

    // --- Always-visible top-right system buttons ---
    const sys = document.createElement('div');
    sys.className = 'sys-buttons';
    const dbg = this.makeButton('F3', 'sys-btn', () => onToggleDebug());
    const menu = this.makeButton('☰', 'sys-btn', () => input.openMenu());
    // Spacer with dynamic padding so pairable buttons (see setSysBtnCount) land clear of the sys row.
    const pad = document.createElement('span');
    pad.className = 'sys-btn-pad';
    pad.style.display = 'none';
    sys.append(dbg, menu, pad);
    this.sysBtns = sys;
    parent.appendChild(sys);

    // --- Touch controls (joystick + action buttons) ---
    this.root = document.createElement('div');
    this.root.className = 'touch-controls hidden';

    this.stick = document.createElement('div');
    this.stick.className = 'joystick';
    this.knob = document.createElement('div');
    this.knob.className = 'joystick-knob';
    this.stick.appendChild(this.knob);
    this.root.appendChild(this.stick);

    const actions = document.createElement('div');
    actions.className = 'touch-actions';
    const jump = this.makeHoldButton('▲', 'Space');
    this.downBtn = this.makeHoldButton('▼', 'ShiftLeft');
    this.flyBtn = this.makeButton('飞行', 'touch-btn touch-btn-small', () => this.tapKey('KeyF'));
    actions.append(jump, this.downBtn, this.flyBtn);
    this.root.appendChild(actions);
    parent.appendChild(this.root);

    this.stick.addEventListener('pointerdown', this.onStickDown);
    this.stick.addEventListener('pointermove', this.onStickMove);
    this.stick.addEventListener('pointerup', this.onStickUp);
    this.stick.addEventListener('pointercancel', this.onStickUp);
    this.stick.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** Show/hide the joystick layer (system buttons stay). */
  setVisible(visible: boolean): void {
    this.visible = visible;
    this.root.classList.toggle('hidden', !visible);
    if (!visible) this.resetStick();
  }

  /** Reflect current movement mode in the button labels. */
  setFlyMode(fly: boolean): void {
    this.flyBtn.classList.toggle('active', fly);
    this.downBtn.classList.toggle('hidden', !fly);
  }

  get isVisible(): boolean {
    return this.visible;
  }

  /** P13-fixes: get the always-on top-right sys row so later stages can pair it with extra buttons. */
  get systemButtonsRow(): HTMLDivElement {
    return this.sysBtns;
  }

  /** P13-fixes: push extra buttons (0–4) into the sys row so later stages can reach them without layout overlap. */
  setSysBtnCount(n: number): void {
    const pad = this.sysBtns.querySelector<HTMLElement>('.sys-btn-pad');
    if (!pad) return;
    pad.style.display = n > 0 ? '' : 'none';
    pad.style.paddingRight = `calc(${n} * 92px)`;
  }

  private makeButton(label: string, cls: string, onTap: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = cls;
    b.textContent = label;
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
    b.addEventListener('pointerup', (e) => {
      e.preventDefault();
      e.stopPropagation();
      onTap();
    });
    b.addEventListener('contextmenu', (e) => e.preventDefault());
    return b;
  }

  /** Button that holds a virtual key while pressed. */
  private makeHoldButton(label: string, code: string): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'touch-btn';
    b.textContent = label;
    const down = (e: PointerEvent): void => {
      e.preventDefault();
      e.stopPropagation();
      b.setPointerCapture(e.pointerId);
      b.classList.add('active');
      this.input.setVirtualKey(code, true);
    };
    const up = (e: PointerEvent): void => {
      e.preventDefault();
      e.stopPropagation();
      b.classList.remove('active');
      this.input.setVirtualKey(code, false);
    };
    b.addEventListener('pointerdown', down);
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('contextmenu', (e) => e.preventDefault());
    return b;
  }

  /** Simulate a key tap (down this frame, up on the next frame) for edge-triggered actions like F. */
  private tapKey(code: string): void {
    this.input.setVirtualKey(code, true);
    requestAnimationFrame(() => requestAnimationFrame(() => this.input.setVirtualKey(code, false)));
  }

  private readonly onStickDown = (e: PointerEvent): void => {
    if (this.stickPointer !== null) return;
    e.preventDefault();
    e.stopPropagation();
    this.stickPointer = e.pointerId;
    this.stick.setPointerCapture(e.pointerId);
    const r = this.stick.getBoundingClientRect();
    this.stickCX = r.left + r.width / 2;
    this.stickCY = r.top + r.height / 2;
    this.updateStick(e.clientX, e.clientY);
  };

  private readonly onStickMove = (e: PointerEvent): void => {
    if (e.pointerId !== this.stickPointer) return;
    e.preventDefault();
    this.updateStick(e.clientX, e.clientY);
  };

  private readonly onStickUp = (e: PointerEvent): void => {
    if (e.pointerId !== this.stickPointer) return;
    e.preventDefault();
    this.resetStick();
  };

  private updateStick(px: number, py: number): void {
    let dx = px - this.stickCX;
    let dy = py - this.stickCY;
    const len = Math.hypot(dx, dy);
    if (len > this.radius) {
      dx *= this.radius / len;
      dy *= this.radius / len;
    }
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    // Screen up (negative dy) = forward.
    this.input.setMoveAxis(dx / this.radius, -dy / this.radius);
  }

  private resetStick(): void {
    this.stickPointer = null;
    this.knob.style.transform = 'translate(0px, 0px)';
    this.input.setMoveAxis(0, 0);
  }

  dispose(): void {
    this.root.remove();
  }
}
