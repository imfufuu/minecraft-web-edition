import * as THREE from 'three';
import type { InputManager } from './InputManager';

/** Pitch is clamped just short of ±90° so the view can never flip over the pole. */
const PITCH_LIMIT = Math.PI / 2 - 0.01;

export interface FirstPersonCameraOptions {
  /** Radians of rotation per pixel of mouse movement. */
  mouseSensitivity?: number;
  /** Horizontal fly speed in units / second. */
  moveSpeed?: number;
  /** Vertical fly speed (Space / Shift) in units / second. */
  verticalSpeed?: number;
  /** Multiplier applied while sprinting (Ctrl). */
  sprintMultiplier?: number;
}

/**
 * Free-fly first-person camera controller (P1).
 * Rotation uses YXZ Euler order: yaw around world Y first, then pitch around local X.
 * Movement is horizontal-only (driven by yaw), Space / Shift move vertically.
 * All motion is scaled by dt, so speed is identical at 60 Hz and 144 Hz.
 */
export class FirstPersonCamera {
  readonly camera: THREE.PerspectiveCamera;
  private readonly input: InputManager;

  yaw = 0;
  pitch = 0;

  readonly mouseSensitivity: number;
  readonly moveSpeed: number;
  readonly verticalSpeed: number;
  readonly sprintMultiplier: number;

  /** Scratch vectors (allocated once, reused every frame). */
  private readonly forward = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly move = new THREE.Vector3();

  constructor(camera: THREE.PerspectiveCamera, input: InputManager, opts: FirstPersonCameraOptions = {}) {
    this.camera = camera;
    this.input = input;
    this.mouseSensitivity = opts.mouseSensitivity ?? 0.0022;
    this.moveSpeed = opts.moveSpeed ?? 8;
    this.verticalSpeed = opts.verticalSpeed ?? 8;
    this.sprintMultiplier = opts.sprintMultiplier ?? 2.5;

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

  update(dt: number): void {
    this.updateLook();
    this.updateMove(dt);
  }

  private updateLook(): void {
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

  private updateMove(dt: number): void {
    if (!this.input.active) return;
    const input = this.input;

    // Horizontal basis derived from yaw only, so looking up/down never changes walk speed.
    const sinY = Math.sin(this.yaw);
    const cosY = Math.cos(this.yaw);
    this.forward.set(-sinY, 0, -cosY);
    this.right.set(cosY, 0, -sinY);

    this.move.set(0, 0, 0);
    if (input.isDown('KeyW')) this.move.add(this.forward);
    if (input.isDown('KeyS')) this.move.sub(this.forward);
    if (input.isDown('KeyD')) this.move.add(this.right);
    if (input.isDown('KeyA')) this.move.sub(this.right);

    if (this.move.lengthSq() > 0) {
      const sprint = input.isDown('ControlLeft') || input.isDown('ControlRight') ? this.sprintMultiplier : 1;
      this.move.normalize().multiplyScalar(this.moveSpeed * sprint * dt);
      this.camera.position.add(this.move);
    }

    let vertical = 0;
    if (input.isDown('Space')) vertical += 1;
    if (input.isDown('ShiftLeft') || input.isDown('ShiftRight')) vertical -= 1;
    if (vertical !== 0) this.camera.position.y += vertical * this.verticalSpeed * dt;
  }
}
