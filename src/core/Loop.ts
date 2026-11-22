export type FrameCallback = (dt: number, elapsed: number) => void;

/** Maximum simulated frame interval. Prevents physics explosions after tab switches. */
export const MAX_DELTA = 0.1;

/**
 * requestAnimationFrame-driven main loop with delta clamping.
 * Calls `update` callbacks first, then the `render` callback.
 * Uses performance.now() directly (THREE.Clock is deprecated in r187+).
 */
export class Loop {
  private readonly updates: FrameCallback[] = [];
  private renderFn: (() => void) | null = null;
  private rafId = 0;
  private running = false;
  private lastTime = 0;
  private elapsed = 0;

  private readonly tick = (now: number): void => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.tick);

    const rawDt = (now - this.lastTime) / 1000;
    this.lastTime = now;
    const dt = Math.min(Math.max(rawDt, 0), MAX_DELTA);
    this.elapsed += dt;

    for (const fn of this.updates) fn(dt, this.elapsed);
    this.renderFn?.();
  };

  onUpdate(fn: FrameCallback): void {
    this.updates.push(fn);
  }

  onRender(fn: () => void): void {
    this.renderFn = fn;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }
}
