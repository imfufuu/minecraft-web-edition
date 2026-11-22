import { isSolid } from '../blocks/BlockTypes';
import type { BlockSource } from '../mesh/ChunkMesher';

export interface AABB {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

/** Small gap left between the player and a block face so float error never re-triggers a collision. */
export const SKIN = 1e-4;
/** Shrink used when converting a max bound to the last overlapped integer cell. */
const CELL_EPS = 1e-5;

export function aabbIntersects(a: AABB, b: AABB): boolean {
  return a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY && a.minZ < b.maxZ && a.maxZ > b.minZ;
}

/** True if any solid voxel overlaps the box. Only visits the integer cells the box actually covers. */
export function boxCollides(world: BlockSource, box: AABB): boolean {
  const x0 = Math.floor(box.minX);
  const x1 = Math.floor(box.maxX - CELL_EPS);
  const y0 = Math.floor(box.minY);
  const y1 = Math.floor(box.maxY - CELL_EPS);
  const z0 = Math.floor(box.minZ);
  const z1 = Math.floor(box.maxZ - CELL_EPS);
  for (let y = y0; y <= y1; y++) {
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        if (isSolid(world.getBlock(x, y, z))) return true;
      }
    }
  }
  return false;
}

export type Axis = 'x' | 'y' | 'z';

export interface AxisMoveResult {
  /** Displacement actually applied along the axis. */
  moved: number;
  /** True if the move was stopped by a solid block. */
  hit: boolean;
}

/**
 * Move `box` by `delta` along one axis. If the destination overlaps a solid block,
 * the box is snapped flush against the blocking face (plus SKIN) and `hit` is true.
 *
 * Snapping uses the integer cell boundary that the leading face crossed, which is
 * exact for voxel grids as long as |delta| < 1 (guaranteed by delta clamping +
 * terminal velocity, see Player).
 */
export function sweepAxis(world: BlockSource, box: AABB, axis: Axis, delta: number): AxisMoveResult {
  if (delta === 0) return { moved: 0, hit: false };

  const minKey: 'minX' | 'minY' | 'minZ' = axis === 'x' ? 'minX' : axis === 'y' ? 'minY' : 'minZ';
  const maxKey: 'maxX' | 'maxY' | 'maxZ' = axis === 'x' ? 'maxX' : axis === 'y' ? 'maxY' : 'maxZ';
  const size = box[maxKey] - box[minKey];

  box[minKey] += delta;
  box[maxKey] += delta;
  if (!boxCollides(world, box)) return { moved: delta, hit: false };

  // Collision: snap to the face of the cell we entered.
  if (delta > 0) {
    const leading = box[maxKey];
    const snapped = Math.floor(leading - CELL_EPS) - SKIN; // flush against the block's min face
    const moved = delta - (leading - snapped);
    box[maxKey] = snapped;
    box[minKey] = snapped - size;
    return { moved, hit: true };
  } else {
    const leading = box[minKey];
    const snapped = Math.floor(leading) + 1 + SKIN; // flush against the block's max face
    const moved = delta + (snapped - leading);
    box[minKey] = snapped;
    box[maxKey] = snapped + size;
    return { moved, hit: true };
  }
}
