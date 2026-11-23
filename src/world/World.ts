import { BlockId } from '../blocks/BlockTypes';
import { worldToChunkCoords } from '../utils/math';
import { Chunk, CHUNK_HEIGHT, CHUNK_SIZE, chunkIndex } from './Chunk';
import type { TerrainGenerator } from './TerrainGenerator';

/**
 * Owns all loaded chunks, keyed by "cx,cz". Translates absolute world
 * coordinates into (chunk, local) coordinates with correct negative handling.
 */
/** Sparse per-chunk edits: local flat index -> block id. */
export type ChunkDiff = Map<number, number>;

export class World {
  readonly chunks = new Map<string, Chunk>();
  readonly generator: TerrainGenerator;
  /** Player-made modifications, keyed by chunk key. Only `setBlock` writes here. */
  readonly modifiedBlocks = new Map<string, ChunkDiff>();
  /** Chunk keys whose diff changed since the last save. */
  readonly unsavedDiffs = new Set<string>();
  /** Incremented on every successful setBlock (lets async builders detect stale input). */
  editVersion = 0;

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
      const diff = this.modifiedBlocks.get(key);
      if (diff) for (const [i, id] of diff) chunk.data[i] = id;
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

    // Record the edit for persistence.
    const key = chunk.key;
    let diff = this.modifiedBlocks.get(key);
    if (!diff) {
      diff = new Map();
      this.modifiedBlocks.set(key, diff);
    }
    diff.set(chunkIndex(lx, ly, lz), id);
    this.unsavedDiffs.add(key);
    this.editVersion++;

    if (lx === 0) this.markDirty(cx - 1, cz);
    else if (lx === CHUNK_SIZE - 1) this.markDirty(cx + 1, cz);
    if (lz === 0) this.markDirty(cx, cz - 1);
    else if (lz === CHUNK_SIZE - 1) this.markDirty(cx, cz + 1);
    return true;
  }

  /**
   * Install a saved diff (from storage) without recording it as a new edit.
   * Applies immediately if the chunk is loaded; otherwise it is applied on generation.
   */
  applyDiff(key: string, diff: ChunkDiff): void {
    this.modifiedBlocks.set(key, diff);
    const chunk = this.chunks.get(key);
    if (!chunk) return;
    for (const [i, id] of diff) chunk.data[i] = id;
    chunk.dirty = true;
    // Border edits affect neighbours' faces too.
    this.markDirty(chunk.cx - 1, chunk.cz);
    this.markDirty(chunk.cx + 1, chunk.cz);
    this.markDirty(chunk.cx, chunk.cz - 1);
    this.markDirty(chunk.cx, chunk.cz + 1);
  }

  /** True if any of the 4 edge-neighbours of (cx, cz) has recorded edits. */
  neighbourHasDiff(cx: number, cz: number): boolean {
    return (
      this.modifiedBlocks.has(Chunk.keyOf(cx - 1, cz)) ||
      this.modifiedBlocks.has(Chunk.keyOf(cx + 1, cz)) ||
      this.modifiedBlocks.has(Chunk.keyOf(cx, cz - 1)) ||
      this.modifiedBlocks.has(Chunk.keyOf(cx, cz + 1))
    );
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
