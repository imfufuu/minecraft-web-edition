import * as THREE from 'three';
import type { InputManager } from '../core/InputManager';
import { isLiquid } from '../blocks/BlockTypes';
import type { BlockSource } from '../mesh/ChunkMesher';
import { type AABB, sweepAxis } from './PhysicsAABB';

export const PLAYER_WIDTH = 0.6;
export const PLAYER_HEIGHT = 1.8;
export const PLAYER_EYE_HEIGHT = 1.62;

const GRAVITY = 28;
const TERMINAL_VELOCITY = 50;
const JUMP_VELOCITY = 8.5;
const WALK_SPEED = 4.3;
const SPRINT_MULTIPLIER = 1.6;
const FLY_SPEED = 10;
const FLY_VERTICAL_SPEED = 8;
const FLY_SPRINT_MULTIPLIER = 2.5;
const VOID_Y = -30;
/** Swimming: slower walk, capped sink speed, Space swims upward. */
const WATER_SPEED_MULTIPLIER = 0.55;
const WATER_SINK_SPEED = 2.5;
const WATER_SWIM_UP_SPEED = 4;
const WATER_GRAVITY = 8;
/** Largest per-axis step we allow in one substep so snapping stays exact (< 1 block). */
const MAX_STEP = 0.5;

export type MovementMode = 'survival' | 'fly';

/**
 * The player entity: an axis-aligned box (0.6 × 1.8 × 0.6) whose feet are at
 * `position`. The camera sits PLAYER_EYE_HEIGHT above the feet.
 *
 * Survival mode: gravity, jumping and axis-separated voxel collision (Y, then X, then Z).
 * Fly mode: free movement without collision (debug / creative placeholder).
 */
export class Player {
  readonly position = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();
  readonly spawn = new THREE.Vector3();
  onGround = false;
  /** True while the player's lower body is inside water. */
  inWater = false;
  mode: MovementMode = 'survival';

  private readonly input: InputManager;
  private readonly world: BlockSource;
  /**
   * Streaming hook: returns false while the column under (x, z) has no loaded chunk yet.
   * Survival physics pauses in that case instead of falling through unloaded terrain.
   */
  groundReady: (x: number, z: number) => boolean = () => true;
  private toggleLatch = false;
  private readonly forward = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly wish = new THREE.Vector3();
  private readonly box: AABB = { minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0 };

  constructor(input: InputManager, world: BlockSource) {
    this.input = input;
    this.world = world;
  }

  setSpawn(x: number, y: number, z: number): void {
    this.spawn.set(x, y, z);
    this.respawn();
  }

  respawn(): void {
    this.position.copy(this.spawn);
    this.velocity.set(0, 0, 0);
    this.onGround = false;
  }

  /** Current collision box in world space (feet at position.y). */
  getAABB(out: AABB = this.box): AABB {
    const hw = PLAYER_WIDTH / 2;
    out.minX = this.position.x - hw;
    out.maxX = this.position.x + hw;
    out.minY = this.position.y;
    out.maxY = this.position.y + PLAYER_HEIGHT;
    out.minZ = this.position.z - hw;
    out.maxZ = this.position.z + hw;
    return out;
  }

  /** Eye position for the camera. */
  getEyePosition(out: THREE.Vector3): THREE.Vector3 {
    return out.set(this.position.x, this.position.y + PLAYER_EYE_HEIGHT, this.position.z);
  }

  update(dt: number, yaw: number): void {
    this.handleModeToggle();
    this.computeWishDirection(yaw);

    if (this.mode === 'fly') this.updateFly(dt);
    else if (this.groundReady(this.position.x, this.position.z)) this.updateSurvival(dt);
    else this.velocity.set(0, 0, 0); // waiting for the chunk below to stream in

    if (this.position.y < VOID_Y) this.respawn();
  }

  private handleModeToggle(): void {
    const pressed = this.input.active && this.input.isDown('KeyF');
    if (pressed && !this.toggleLatch) {
      this.mode = this.mode === 'fly' ? 'survival' : 'fly';
      this.velocity.set(0, 0, 0);
      this.onGround = false;
    }
    this.toggleLatch = pressed;
  }

  /** Horizontal wish direction (|wish| <= 1) from WASD and/or the analog joystick, derived from yaw only. */
  private computeWishDirection(yaw: number): void {
    const sinY = Math.sin(yaw);
    const cosY = Math.cos(yaw);
    this.forward.set(-sinY, 0, -cosY);
    this.right.set(cosY, 0, -sinY);
    this.wish.set(0, 0, 0);
    if (!this.input.active) return;
    if (this.input.isDown('KeyW')) this.wish.add(this.forward);
    if (this.input.isDown('KeyS')) this.wish.sub(this.forward);
    if (this.input.isDown('KeyD')) this.wish.add(this.right);
    if (this.input.isDown('KeyA')) this.wish.sub(this.right);
    const axis = this.input.getMoveAxis();
    this.wish.addScaledVector(this.forward, axis.y).addScaledVector(this.right, axis.x);
    const len = this.wish.length();
    if (len > 1) this.wish.multiplyScalar(1 / len);
  }

  private isSprinting(): boolean {
    return this.input.isDown('ControlLeft') || this.input.isDown('ControlRight');
  }

  private updateFly(dt: number): void {
    const speed = FLY_SPEED * (this.isSprinting() ? FLY_SPRINT_MULTIPLIER : 1);
    this.position.addScaledVector(this.wish, speed * dt);
    let vertical = 0;
    if (this.input.isDown('Space')) vertical += 1;
    if (this.input.isDown('ShiftLeft') || this.input.isDown('ShiftRight')) vertical -= 1;
    this.position.y += vertical * FLY_VERTICAL_SPEED * dt;
    this.velocity.set(0, 0, 0);
    this.onGround = false;
  }

  private updateSurvival(dt: number): void {
    // Horizontal velocity is set directly (no inertia) for crisp Minecraft-like control.
    // Water test at waist height (feet + 0.9): entering water from above switches to swimming.
    const p = this.position;
    this.inWater = isLiquid(this.world.getBlock(Math.floor(p.x), Math.floor(p.y + 0.9), Math.floor(p.z)));

    const speed = WALK_SPEED * (this.isSprinting() ? SPRINT_MULTIPLIER : 1) * (this.inWater ? WATER_SPEED_MULTIPLIER : 1);
    this.velocity.x = this.wish.x * speed;
    this.velocity.z = this.wish.z * speed;

    if (this.inWater) {
      // Buoyancy model: weak gravity, capped sink speed, Space paddles upward (lets you climb out onto a 1-block shore).
      if (this.input.isDown('Space')) this.velocity.y = WATER_SWIM_UP_SPEED;
      else this.velocity.y = Math.max(this.velocity.y - WATER_GRAVITY * dt, -WATER_SINK_SPEED);
    } else {
      if (this.onGround && this.input.isDown('Space')) {
        this.velocity.y = JUMP_VELOCITY;
        this.onGround = false;
      }
      // Gravity with terminal velocity.
      this.velocity.y -= GRAVITY * dt;
      if (this.velocity.y < -TERMINAL_VELOCITY) this.velocity.y = -TERMINAL_VELOCITY;
    }

    // Sub-step so no single axis move exceeds MAX_STEP (keeps face snapping exact).
    const dx = this.velocity.x * dt;
    const dy = this.velocity.y * dt;
    const dz = this.velocity.z * dt;
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) / MAX_STEP));
    const sx = dx / steps;
    const sy = dy / steps;
    const sz = dz / steps;

    let groundedThisFrame = false;
    for (let i = 0; i < steps; i++) {
      const box = this.getAABB();

      // --- Y axis ---
      const ry = sweepAxis(this.world, box, 'y', sy);
      if (ry.hit) {
        if (sy < 0) groundedThisFrame = true;
        this.velocity.y = 0;
      }
      // --- X axis ---
      const rx = sweepAxis(this.world, box, 'x', sx);
      if (rx.hit) this.velocity.x = 0;
      // --- Z axis ---
      const rz = sweepAxis(this.world, box, 'z', sz);
      if (rz.hit) this.velocity.z = 0;

      // Write the resolved box back to the position (feet = box.min, centre = box mid).
      this.position.set((box.minX + box.maxX) / 2, box.minY, (box.minZ + box.maxZ) / 2);

      if (ry.hit && sy !== 0 && rx.hit && rz.hit) break; // fully blocked, no point iterating
    }

    this.onGround = groundedThisFrame;
  }
}
