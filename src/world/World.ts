import { BlockId } from '../blocks/BlockTypes';
import { worldToChunkCoords } from '../utils/math';
import { Chunk, CHUNK_HEIGHT, CHUNK_SIZE } from './Chunk';
import type { TerrainGenerator } from './TerrainGenerator';

/**
 * Owns all loaded chunks, keyed by "cx,cz". Translates absolute world
 * coordinates into (chunk, local) coordinates with correct negative handling.
 */
export class World {
  readonly chunks = new Map<string, Chunk>();
  readonly generator: TerrainGenerator;

  constructor(generator: TerrainGenerator) {
    this.generator = generator;
  }

  getChunk(cx: number, cz: number): Chunk | undefined {
    return this.chunks.get(Chunk.keyOf(cx, cz));
  }

  hasChunk(cx: number, cz: number): boolean {
    return this.chunks.has(Chunk.keyOf(cx, cz));
  }

  /** Returns the existing chunk or generates a fresh one from the seed. */
  getOrCreateChunk(cx: number, cz: number): Chunk {
    const key = Chunk.keyOf(cx, cz);
    let chunk = this.chunks.get(key);
    if (!chunk) {
      chunk = new Chunk(cx, cz);
      this.generator.generate(chunk);
      this.chunks.set(key, chunk);
    }
    return chunk;
  }

  /** Block at absolute world coordinates. Unloaded chunks and out-of-height reads return AIR. */
  getBlock(wx: number, wy: number, wz: number): number {
    if (wy < 0 || wy >= CHUNK_HEIGHT) return BlockId.AIR;
    const { cx, cz, lx, ly, lz } = worldToChunkCoords(wx, wy, wz);
    const chunk = this.chunks.get(Chunk.keyOf(cx, cz));
    if (!chunk) return BlockId.AIR;
    return chunk.getBlock(lx, ly, lz);
  }

  /**
   * Sets a block at absolute world coordinates. Returns false if the chunk is not loaded or unchanged.
   * Border edits also flag the adjacent chunk(s) dirty, because their boundary faces depend on this block.
   */
  setBlock(wx: number, wy: number, wz: number, id: number): boolean {
    if (wy < 0 || wy >= CHUNK_HEIGHT) return false;
    const { cx, cz, lx, ly, lz } = worldToChunkCoords(wx, wy, wz);
    const chunk = this.chunks.get(Chunk.keyOf(cx, cz));
    if (!chunk) return false;
    if (!chunk.setBlock(lx, ly, lz, id)) return false;

    if (lx === 0) this.markDirty(cx - 1, cz);
    else if (lx === CHUNK_SIZE - 1) this.markDirty(cx + 1, cz);
    if (lz === 0) this.markDirty(cx, cz - 1);
    else if (lz === CHUNK_SIZE - 1) this.markDirty(cx, cz + 1);
    return true;
  }

  private markDirty(cx: number, cz: number): void {
    const c = this.chunks.get(Chunk.keyOf(cx, cz));
    if (c) c.dirty = true;
  }

  /** Generate every chunk in the inclusive square [minC, maxC]². */
  generateArea(minC: number, maxC: number): void {
    for (let cz = minC; cz <= maxC; cz++) {
      for (let cx = minC; cx <= maxC; cx++) {
        this.getOrCreateChunk(cx, cz);
      }
    }
  }
}
