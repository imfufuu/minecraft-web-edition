import * as THREE from 'three';
import type { InputManager } from './InputManager';

/** Pitch is clamped just short of ±90° so the view can never flip over the pole. */
const PITCH_LIMIT = Math.PI / 2 - 0.01;

export interface FirstPersonCameraOptions {
  /** Radians of rotation per pixel of mouse movement. */
  mouseSensitivity?: number;
}

/**
 * First-person look controller.
 * Rotation uses YXZ Euler order: yaw around world Y first, then pitch around local X.
 * Position is owned by whoever calls `setEyePosition` (the Player since P5).
 */
export class FirstPersonCamera {
  readonly camera: THREE.PerspectiveCamera;
  private readonly input: InputManager;

  yaw = 0;
  pitch = 0;
  readonly mouseSensitivity: number;

  constructor(camera: THREE.PerspectiveCamera, input: InputManager, opts: FirstPersonCameraOptions = {}) {
    this.camera = camera;
    this.input = input;
    this.mouseSensitivity = opts.mouseSensitivity ?? 0.0022;

    camera.rotation.order = 'YXZ';
    this.yaw = camera.rotation.y;
    this.pitch = camera.rotation.x;
    this.applyRotation();
  }

  /** Set absolute look angles (used for spawn / restore). */
  setLook(yaw: number, pitch: number): void {
    this.yaw = yaw;
    this.pitch = THREE.MathUtils.clamp(pitch, -PITCH_LIMIT, PITCH_LIMIT);
    this.applyRotation();
  }

  setEyePosition(p: THREE.Vector3): void {
    this.camera.position.copy(p);
  }

  /** Consume accumulated mouse delta and rotate. Call once per frame before moving the player. */
  update(): void {
    const { dx, dy } = this.input.consumeMouseDelta();
    if (dx === 0 && dy === 0) return;

    this.yaw -= dx * this.mouseSensitivity;
    this.pitch -= dy * this.mouseSensitivity;
    this.pitch = THREE.MathUtils.clamp(this.pitch, -PITCH_LIMIT, PITCH_LIMIT);

    // Keep yaw in [-π, π] so it never grows without bound.
    if (this.yaw > Math.PI) this.yaw -= Math.PI * 2;
    else if (this.yaw < -Math.PI) this.yaw += Math.PI * 2;

    this.applyRotation();
  }

  private applyRotation(): void {
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }
}
