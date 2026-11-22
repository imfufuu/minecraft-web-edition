export * from 'three/src/Three.js';
import { Scene, Camera } from 'three/src/Three.js';
/** Headless stand-in: no GL, but same surface the app touches. */
export class WebGLRenderer {
  domElement: HTMLCanvasElement = document.createElement('canvas');
  info = { autoReset: true, render: { calls: 0, triangles: 0 }, memory: { geometries: 0, textures: 0 }, reset(): void { /* noop */ } };
  renderCount = 0;
  constructor(_opts?: unknown) {}
  setPixelRatio(_r: number): void {}
  setSize(_w: number, _h: number, _s?: boolean): void {}
  render(_scene: Scene, _camera: Camera): void { this.renderCount++; }
  dispose(): void {}
  getContext(): unknown { return {}; }
}
