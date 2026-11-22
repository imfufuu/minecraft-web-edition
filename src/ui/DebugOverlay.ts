import type * as THREE from 'three';

export interface DebugStats {
  fps: number;
  frameTimeMs: number;
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  playerPos: { x: number; y: number; z: number };
  chunk: { cx: number; cz: number };
}

/**
 * Top-left translucent debug panel. Toggle with F3.
 * Samples renderer.info after each render and refreshes the DOM at ~10 Hz.
 */
export class DebugOverlay {
  private readonly el: HTMLDivElement;
  private visible = true;

  private frames = 0;
  private fps = 0;
  private frameTimeMs = 0;
  private lastDomUpdate = 0;
  private lastFrameStart = performance.now();

  private readonly extraLines: (() => string)[] = [];

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.code === 'F3') {
      e.preventDefault();
      this.toggle();
    }
  };

  constructor(parent: HTMLElement = document.body) {
    this.el = document.createElement('div');
    this.el.className = 'debug-overlay';
    this.el.textContent = 'Minecraft Web Edition\n(F3 to toggle)';
    parent.appendChild(this.el);
    window.addEventListener('keydown', this.onKeyDown);
  }

  /** Register an additional line provider (e.g. player position in later stages). */
  addLine(provider: () => string): void {
    this.extraLines.push(provider);
  }

  toggle(): void {
    this.visible = !this.visible;
    this.el.classList.toggle('hidden', !this.visible);
  }

  /** Call once at the start of every frame. */
  beginFrame(): void {
    this.lastFrameStart = performance.now();
  }

  /** Call once after rendering every frame. */
  endFrame(info: THREE.WebGLInfo, playerPos: { x: number; y: number; z: number }, chunk: { cx: number; cz: number }): void {
    const now = performance.now();
    this.frameTimeMs = now - this.lastFrameStart;

    this.frames++;

    // Refresh FPS counter every 500 ms based on real wall-clock interval.
    if (now - this.lastDomUpdate >= 500) {
      const seconds = (now - this.lastDomUpdate) / 1000;
      this.fps = this.frames / seconds;
      this.frames = 0;
      this.lastDomUpdate = now;

      if (this.visible) {
        this.renderDom({
          fps: this.fps,
          frameTimeMs: this.frameTimeMs,
          drawCalls: info.render.calls,
          triangles: info.render.triangles,
          geometries: info.memory.geometries,
          textures: info.memory.textures,
          playerPos,
          chunk,
        });
      }
    }
  }

  private renderDom(s: DebugStats): void {
    const lines = [
      'Minecraft Web Edition  [F3]',
      `FPS: ${s.fps.toFixed(0)}  Frame: ${s.frameTimeMs.toFixed(2)} ms`,
      `Draw Calls: ${s.drawCalls}  Triangles: ${s.triangles}`,
      `Geometries: ${s.geometries}  Textures: ${s.textures}`,
      `Pos: ${s.playerPos.x.toFixed(2)}, ${s.playerPos.y.toFixed(2)}, ${s.playerPos.z.toFixed(2)}`,
      `Chunk: ${s.chunk.cx}, ${s.chunk.cz}`,
    ];
    for (const p of this.extraLines) lines.push(p());
    this.el.textContent = lines.join('\n');
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    this.el.remove();
  }
}
