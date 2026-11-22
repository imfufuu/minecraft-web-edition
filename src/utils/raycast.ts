import type * as THREE from 'three';
import { isSolid } from '../blocks/BlockTypes';
import type { BlockSource } from '../mesh/ChunkMesher';

export interface VoxelHit {
  /** Integer coordinates of the solid block that was hit. */
  x: number;
  y: number;
  z: number;
  /** Unit normal of the face that was entered (points out of the block, towards the ray origin). */
  nx: number;
  ny: number;
  nz: number;
  /** Distance along the ray to the hit point. */
  distance: number;
  /** World-space hit point on the face. */
  px: number;
  py: number;
  pz: number;
}

/**
 * Voxel ray traversal (Amanatides & Woo DDA). Exact for axis-aligned unit cells,
 * independent of mesh geometry, and returns block coordinates + face normal directly.
 * Returns null if nothing solid is hit within `maxDistance` or if the origin is inside a solid block.
 */
export function raycastVoxels(
  world: BlockSource,
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  maxDistance: number,
): VoxelHit | null {
  let x = Math.floor(ox);
  let y = Math.floor(oy);
  let z = Math.floor(oz);

  if (isSolid(world.getBlock(x, y, z))) return null;

  const stepX = dx > 0 ? 1 : dx < 0 ? -1 : 0;
  const stepY = dy > 0 ? 1 : dy < 0 ? -1 : 0;
  const stepZ = dz > 0 ? 1 : dz < 0 ? -1 : 0;

  const tDeltaX = stepX !== 0 ? Math.abs(1 / dx) : Infinity;
  const tDeltaY = stepY !== 0 ? Math.abs(1 / dy) : Infinity;
  const tDeltaZ = stepZ !== 0 ? Math.abs(1 / dz) : Infinity;

  let tMaxX = stepX > 0 ? (x + 1 - ox) * tDeltaX : stepX < 0 ? (ox - x) * tDeltaX : Infinity;
  let tMaxY = stepY > 0 ? (y + 1 - oy) * tDeltaY : stepY < 0 ? (oy - y) * tDeltaY : Infinity;
  let tMaxZ = stepZ > 0 ? (z + 1 - oz) * tDeltaZ : stepZ < 0 ? (oz - z) * tDeltaZ : Infinity;

  let nx = 0;
  let ny = 0;
  let nz = 0;
  let t = 0;

  // Hard iteration cap: a ray of length L crosses at most ~3L+3 cells.
  const maxSteps = Math.ceil(maxDistance * 3) + 3;
  for (let i = 0; i < maxSteps; i++) {
    if (tMaxX < tMaxY && tMaxX < tMaxZ) {
      t = tMaxX;
      x += stepX;
      tMaxX += tDeltaX;
      nx = -stepX;
      ny = 0;
      nz = 0;
    } else if (tMaxY < tMaxZ) {
      t = tMaxY;
      y += stepY;
      tMaxY += tDeltaY;
      nx = 0;
      ny = -stepY;
      nz = 0;
    } else {
      t = tMaxZ;
      z += stepZ;
      tMaxZ += tDeltaZ;
      nx = 0;
      ny = 0;
      nz = -stepZ;
    }
    if (t > maxDistance) return null;
    if (isSolid(world.getBlock(x, y, z))) {
      return { x, y, z, nx, ny, nz, distance: t, px: ox + dx * t, py: oy + dy * t, pz: oz + dz * t };
    }
  }
  return null;
}

export interface BlockCoords {
  x: number;
  y: number;
  z: number;
}

/**
 * Convert a surface hit point + outward face normal into the hit block ("target")
 * and the adjacent air block where a new block would go ("place").
 * (Reference formula; the DDA above yields the same result without epsilons.)
 */
export function getTargetAndPlaceBlockCoords(
  hitPoint: THREE.Vector3 | { x: number; y: number; z: number },
  faceNormal: THREE.Vector3 | { x: number; y: number; z: number },
): { target: BlockCoords; place: BlockCoords } {
  const EPS = 0.001;
  return {
    target: {
      x: Math.floor(hitPoint.x - faceNormal.x * EPS),
      y: Math.floor(hitPoint.y - faceNormal.y * EPS),
      z: Math.floor(hitPoint.z - faceNormal.z * EPS),
    },
    place: {
      x: Math.floor(hitPoint.x + faceNormal.x * EPS),
      y: Math.floor(hitPoint.y + faceNormal.y * EPS),
      z: Math.floor(hitPoint.z + faceNormal.z * EPS),
    },
  };
}
