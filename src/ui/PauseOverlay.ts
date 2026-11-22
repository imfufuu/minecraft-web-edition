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
          <li><b>F3</b> 调试面板 &nbsp;·&nbsp; <b>ESC</b> 释放鼠标</li>
        </ul>
        <p class="pause-status"></p>
        <p class="pause-diag"></p>
      </div>`;
    this.status = this.el.querySelector<HTMLParagraphElement>('.pause-status') as HTMLParagraphElement;
    this.diag = this.el.querySelector<HTMLParagraphElement>('.pause-diag') as HTMLParagraphElement;
    this.el.addEventListener('click', (e) => {
      e.preventDefault();
      onClick();
    });
    parent.appendChild(this.el);
  }

  setVisible(visible: boolean): void {
    this.el.classList.toggle('hidden', !visible);
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
