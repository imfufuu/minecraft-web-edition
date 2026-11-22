import * as THREE from 'three';

export type FrameCallback = (dt: number, elapsed: number) => void;

/** Maximum simulated frame interval. Prevents physics explosions after tab switches. */
export const MAX_DELTA = 0.1;

/**
 * requestAnimationFrame-driven main loop with delta clamping.
 * Calls `update` callbacks first, then the `render` callback.
 */
export class Loop {
  private readonly clock = new THREE.Clock(false);
  private readonly updates: FrameCallback[] = [];
  private renderFn: (() => void) | null = null;
  private rafId = 0;
  private running = false;

  private readonly tick = (): void => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.tick);

    const dt = Math.min(this.clock.getDelta(), MAX_DELTA);
    const elapsed = this.clock.elapsedTime;

    for (const fn of this.updates) fn(dt, elapsed);
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
    this.clock.start();
    this.rafId = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
    this.clock.stop();
  }
}
