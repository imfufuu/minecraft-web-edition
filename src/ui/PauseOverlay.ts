/**
 * Full-screen hint shown whenever the pointer is not locked.
 * Clicking anywhere requests pointer lock via the supplied callback.
 */
export class PauseOverlay {
  private readonly el: HTMLDivElement;

  constructor(onClick: () => void, parent: HTMLElement = document.body) {
    this.el = document.createElement('div');
    this.el.className = 'pause-overlay';
    this.el.innerHTML = `
      <div class="pause-card">
        <h1>Minecraft Web Edition</h1>
        <p class="pause-cta">点击画面开始 / Click to play</p>
        <ul>
          <li><b>鼠标</b> 环顾 &nbsp;·&nbsp; <b>W A S D</b> 移动</li>
          <li><b>Space</b> 上升 &nbsp;·&nbsp; <b>Shift</b> 下降 &nbsp;·&nbsp; <b>Ctrl</b> 冲刺</li>
          <li><b>F3</b> 调试面板 &nbsp;·&nbsp; <b>ESC</b> 释放鼠标</li>
        </ul>
      </div>`;
    this.el.addEventListener('click', onClick);
    parent.appendChild(this.el);
  }

  setVisible(visible: boolean): void {
    this.el.classList.toggle('hidden', !visible);
  }

  dispose(): void {
    this.el.remove();
  }
}
