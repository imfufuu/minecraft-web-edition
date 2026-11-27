import { BlockId } from '../blocks/BlockTypes';

export const CHUNK_SIZE = 16;
export const CHUNK_HEIGHT = 64;
export const CHUNK_VOLUME = CHUNK_SIZE * CHUNK_HEIGHT * CHUNK_SIZE;

/** Flat index: x fastest, then z, then y (one 16×16 horizontal slice per y). */
export function chunkIndex(x: number, y: number, z: number): number {
  return x + z * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE;
}

export function inChunkBounds(x: number, y: number, z: number): boolean {
  return x >= 0 && x < CHUNK_SIZE && y >= 0 && y < CHUNK_HEIGHT && z >= 0 && z < CHUNK_SIZE;
}

/**
 * A 16×64×16 column of voxels backed by a single Uint8Array.
 * Coordinates are chunk-local; out-of-range reads return AIR.
 */
export class Chunk {
  readonly cx: number;
  readonly cz: number;
  readonly data: Uint8Array;
  /** Set to true whenever a block changes so the renderer knows to rebuild the mesh. */
  dirty = true;

  constructor(cx: number, cz: number, data?: Uint8Array) {
    this.cx = cx;
    this.cz = cz;
    if (data !== undefined && data.length !== CHUNK_VOLUME) {
      throw new Error(`Chunk data must have length ${CHUNK_VOLUME}, got ${data.length}`);
    }
    this.data = data ?? new Uint8Array(CHUNK_VOLUME);
  }

  get key(): string {
    return Chunk.keyOf(this.cx, this.cz);
  }

  static keyOf(cx: number, cz: number): string {
    return `${cx},${cz}`;
  }

  getBlock(x: number, y: number, z: number): number {
    if (!inChunkBounds(x, y, z)) return BlockId.AIR;
    return this.data[chunkIndex(x, y, z)];
  }

  /** Returns true if the value actually changed. */
  setBlock(x: number, y: number, z: number, id: number): boolean {
    if (!inChunkBounds(x, y, z)) return false;
    const i = chunkIndex(x, y, z);
    if (this.data[i] === id) return false;
    this.data[i] = id;
    this.dirty = true;
    return true;
  }
}
