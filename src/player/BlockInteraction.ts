import * as THREE from 'three';
import { BlockId } from '../blocks/BlockTypes';
import type { InputManager } from '../core/InputManager';
import { CHUNK_HEIGHT } from '../world/Chunk';
import type { World } from '../world/World';
import { raycastVoxels, type VoxelHit } from '../utils/raycast';
import { aabbIntersects, type AABB } from './PhysicsAABB';
import type { Player } from './Player';

export const REACH_DISTANCE = 6;
/** Minimum time between repeated actions while a button is held. */
const REPEAT_MS = 250;

/**
 * Aims from the camera, highlights the targeted block and performs dig / place.
 * Chunk mesh rebuilds happen via the chunk dirty flags (consumed by ChunkMeshManager).
 */
export class BlockInteraction {
  /** Block id placed on right click (hotbar will drive this in P7). */
  selectedBlock: number = BlockId.STONE;
  /** Most recent raycast result, or null when nothing is in reach. */
  hit: VoxelHit | null = null;

  readonly highlight: THREE.LineSegments;

  private readonly world: World;
  private readonly player: Player;
  private readonly camera: THREE.Camera;
  private readonly input: InputManager;
  private readonly dir = new THREE.Vector3();
  private readonly placeBox: AABB = { minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0 };
  private nextRepeatAt = 0;

  constructor(world: World, player: Player, camera: THREE.Camera, input: InputManager, scene: THREE.Scene) {
    this.world = world;
    this.player = player;
    this.camera = camera;
    this.input = input;

    const box = new THREE.BoxGeometry(1.002, 1.002, 1.002);
    const edges = new THREE.EdgesGeometry(box);
    box.dispose();
    this.highlight = new THREE.LineSegments(
      edges,
      new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.6, depthTest: true }),
    );
    this.highlight.visible = false;
    this.highlight.renderOrder = 1;
    scene.add(this.highlight);

    input.onClick((button) => this.onClick(button));
  }

  /** Call once per frame after the camera has been positioned. */
  update(nowMs: number): void {
    this.camera.getWorldDirection(this.dir);
    const o = this.camera.position;
    this.hit = raycastVoxels(this.world, o.x, o.y, o.z, this.dir.x, this.dir.y, this.dir.z, REACH_DISTANCE);

    if (this.hit) {
      this.highlight.visible = true;
      this.highlight.position.set(this.hit.x + 0.5, this.hit.y + 0.5, this.hit.z + 0.5);
    } else {
      this.highlight.visible = false;
    }

    // Auto-repeat while a button is held (mouse only; locked or fallback mode).
    if (this.input.active && nowMs >= this.nextRepeatAt) {
      if (this.input.isMouseDown(0)) {
        this.dig();
        this.nextRepeatAt = nowMs + REPEAT_MS;
      } else if (this.input.isMouseDown(2)) {
        this.place();
        this.nextRepeatAt = nowMs + REPEAT_MS;
      }
    }
  }

  private onClick(button: number): void {
    if (button === 0) this.dig();
    else if (button === 2) this.place();
    this.nextRepeatAt = performance.now() + REPEAT_MS * 1.5; // delay before auto-repeat kicks in
  }

  /** Remove the targeted block (bedrock is indestructible). Returns true if the world changed. */
  dig(): boolean {
    const h = this.hit;
    if (!h) return false;
    const id = this.world.getBlock(h.x, h.y, h.z);
    if (id === BlockId.AIR || id === BlockId.BEDROCK) return false;
    return this.world.setBlock(h.x, h.y, h.z, BlockId.AIR);
  }

  /** Place `selectedBlock` on the face that was hit, unless it would overlap the player. */
  place(): boolean {
    const h = this.hit;
    if (!h) return false;
    const px = h.x + h.nx;
    const py = h.y + h.ny;
    const pz = h.z + h.nz;
    if (py < 0 || py >= CHUNK_HEIGHT) return false;
    if (this.world.getBlock(px, py, pz) !== BlockId.AIR) return false;

    this.placeBox.minX = px;
    this.placeBox.minY = py;
    this.placeBox.minZ = pz;
    this.placeBox.maxX = px + 1;
    this.placeBox.maxY = py + 1;
    this.placeBox.maxZ = pz + 1;
    if (aabbIntersects(this.placeBox, this.player.getAABB())) return false;

    return this.world.setBlock(px, py, pz, this.selectedBlock);
  }

  dispose(): void {
    this.highlight.geometry.dispose();
    (this.highlight.material as THREE.Material).dispose();
    this.highlight.removeFromParent();
  }
}
