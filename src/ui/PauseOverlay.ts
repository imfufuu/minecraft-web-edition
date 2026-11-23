/**
 * Full-screen menu shown whenever the game is not capturing input.
 * Clicking anywhere requests pointer lock via the supplied callback.
 */
export class PauseOverlay {
  private readonly el: HTMLDivElement;
  private readonly status: HTMLParagraphElement;
  private readonly diag: HTMLParagraphElement;

  constructor(onClick: () => void, parent: HTMLElement = document.body) {
    this.el = document.createElement('div');
    this.el.className = 'pause-overlay';
    this.el.innerHTML = `
      <div class="pause-card">
        <h1>Minecraft Web Edition</h1>
        <p class="pause-cta">点击画面开始 / Click to play</p>
        <ul>
          <li><b>鼠标</b> 环顾 &nbsp;·&nbsp; <b>W A S D</b> 移动</li>
          <li><b>Space</b> 跳跃 &nbsp;·&nbsp; <b>Ctrl</b> 冲刺 &nbsp;·&nbsp; <b>F</b> 切换飞行（Space/Shift 升降）</li>
          <li><b>左键</b> 挖掘 &nbsp;·&nbsp; <b>右键</b> 放置（触屏：轻点挖 / 长按放）</li>
          <li><b>F3</b> 调试面板 &nbsp;·&nbsp; <b>ESC</b> 释放鼠标</li>
        </ul>
        <p class="pause-status"></p>
        <div class="pause-actions">
          <button type="button" class="pause-btn act-save">立即保存</button>
          <button type="button" class="pause-btn act-new">新建世界</button>
          <button type="button" class="pause-btn act-fullscreen">全屏 / Fullscreen</button>
          <span class="save-info"></span>
        </div>
        <div class="pause-settings">
          <label>视角灵敏度 <input type="range" class="set-sens" min="0.3" max="3" step="0.1" /> <span class="set-sens-val"></span></label>
          <label><input type="checkbox" class="set-touch" /> 显示触屏摇杆/按钮</label>
        </div>
        <p class="pause-diag"></p>
      </div>`;
    this.status = this.el.querySelector<HTMLParagraphElement>('.pause-status') as HTMLParagraphElement;
    this.diag = this.el.querySelector<HTMLParagraphElement>('.pause-diag') as HTMLParagraphElement;
    this.el.addEventListener('click', (e) => {
      // Clicks inside the settings block must not start the game.
      if (e.target instanceof HTMLElement && e.target.closest('.pause-settings, .pause-actions')) return;
      e.preventDefault();
      onClick();
    });
    parent.appendChild(this.el);
  }

  setVisible(visible: boolean): void {
    this.el.classList.toggle('hidden', !visible);
  }

  /** Wire save / new-world buttons. */
  bindActions(opts: { onSave: () => void; onNewWorld: () => void }): void {
    const save = this.el.querySelector<HTMLButtonElement>('.act-save') as HTMLButtonElement;
    const fresh = this.el.querySelector<HTMLButtonElement>('.act-new') as HTMLButtonElement;
    save.addEventListener('click', (e) => {
      e.stopPropagation();
      opts.onSave();
    });
    fresh.addEventListener('click', (e) => {
      e.stopPropagation();
      if (window.confirm('确定要放弃当前世界并生成一个新的随机世界吗？\nDiscard this world and create a new one?')) opts.onNewWorld();
    });
  }

  /** Wire the fullscreen button; hides it when the platform has no Fullscreen API (e.g. iPhone Safari). */
  bindFullscreen(supported: boolean, onToggle: () => void): void {
    const btn = this.el.querySelector<HTMLButtonElement>('.act-fullscreen') as HTMLButtonElement;
    if (!supported) {
      btn.remove();
      return;
    }
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      onToggle();
    });
  }

  setSaveInfo(text: string): void {
    const el = this.el.querySelector<HTMLSpanElement>('.save-info') as HTMLSpanElement;
    el.textContent = text;
  }

  /** Wire the settings controls. */
  bindSettings(opts: {
    sensitivity: number;
    touchControls: boolean;
    onSensitivity: (v: number) => void;
    onTouchControls: (v: boolean) => void;
  }): void {
    const sens = this.el.querySelector<HTMLInputElement>('.set-sens') as HTMLInputElement;
    const sensVal = this.el.querySelector<HTMLSpanElement>('.set-sens-val') as HTMLSpanElement;
    const touch = this.el.querySelector<HTMLInputElement>('.set-touch') as HTMLInputElement;
    sens.value = String(opts.sensitivity);
    sensVal.textContent = `${opts.sensitivity.toFixed(1)}×`;
    touch.checked = opts.touchControls;
    sens.addEventListener('input', () => {
      const v = Number(sens.value);
      sensVal.textContent = `${v.toFixed(1)}×`;
      opts.onSensitivity(v);
    });
    touch.addEventListener('change', () => opts.onTouchControls(touch.checked));
  }

  /** Small status line under the controls (e.g. pointer-lock fallback notice). */
  setStatus(text: string): void {
    this.status.textContent = text;
    this.status.classList.toggle('hidden', text.length === 0);
  }

  /** Tiny diagnostics footer (build id, capability flags). */
  setDiagnostics(text: string): void {
    this.diag.textContent = text;
  }

  dispose(): void {
    this.el.remove();
  }
}
