import * as THREE from 'three';

/**
 * Thin wrapper around THREE.WebGLRenderer + PerspectiveCamera.
 * Owns the canvas, handles resize and exposes `info` for the debug overlay.
 */
export class Renderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly camera: THREE.PerspectiveCamera;
  readonly scene: THREE.Scene;
  private readonly container: HTMLElement;
  private readonly onResize = (): void => this.resize();

  constructor(container: HTMLElement) {
    this.container = container;

    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight, false);
    // Keep render.calls/triangles valid for the whole frame; we reset manually in Loop.
    this.renderer.info.autoReset = false;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      70,
      container.clientWidth / container.clientHeight,
      0.1,
      1000,
    );

    window.addEventListener('resize', this.onResize);
  }

  get info(): THREE.WebGLInfo {
    return this.renderer.info;
  }

  resize(): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  render(): void {
    this.renderer.info.reset();
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    window.removeEventListener('resize', this.onResize);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
