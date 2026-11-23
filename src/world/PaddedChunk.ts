import { BlockId } from '../blocks/BlockTypes';
import { Chunk, CHUNK_HEIGHT, CHUNK_SIZE, CHUNK_VOLUME } from './Chunk';
import type { TerrainGenerator } from './TerrainGenerator';
import type { BlockSource } from '../mesh/ChunkMesher';

/** Padded column: the 16×16 chunk plus a 1-block ring of its neighbours (18×H×18). */
export const PADDED_SIZE = CHUNK_SIZE + 2;
export const PADDED_VOLUME = PADDED_SIZE * CHUNK_HEIGHT * PADDED_SIZE;

/** Flat index into a padded volume; (px, pz) in [0, 18). */
export function paddedIndex(px: number, py: number, pz: number): number {
  return px + pz * PADDED_SIZE + py * PADDED_SIZE * PADDED_SIZE;
}

/**
 * Generate a padded 18×H×18 volume for chunk (cx, cz). The ring columns use the same
 * deterministic `generator` so a chunk can be meshed (with cross-chunk culling and AO)
 * without the neighbouring chunks existing anywhere.
 */
export function generatePaddedChunk(generator: TerrainGenerator, cx: number, cz: number, out?: Uint8Array): Uint8Array {
  const data = out ?? new Uint8Array(PADDED_VOLUME);
  if (data.length !== PADDED_VOLUME) throw new Error(`padded buffer must have length ${PADDED_VOLUME}`);
  data.fill(BlockId.AIR);
  const originX = cx * CHUNK_SIZE - 1;
  const originZ = cz * CHUNK_SIZE - 1;
  for (let pz = 0; pz < PADDED_SIZE; pz++) {
    for (let px = 0; px < PADDED_SIZE; px++) {
      generator.fillColumn(originX + px, originZ + pz, data, px + pz * PADDED_SIZE, PADDED_SIZE * PADDED_SIZE);
    }
  }
  generator.trees.stamp(data, originX, originZ, PADDED_SIZE, PADDED_SIZE);
  return data;
}

/** Copy the inner 16×H×16 block of a padded volume into chunk layout (x + z*16 + y*256). */
export function extractInner(padded: Uint8Array, out?: Uint8Array): Uint8Array {
  const data = out ?? new Uint8Array(CHUNK_VOLUME);
  let i = 0;
  for (let y = 0; y < CHUNK_HEIGHT; y++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      const row = paddedIndex(1, y, z + 1);
      data.set(padded.subarray(row, row + CHUNK_SIZE), i);
      i += CHUNK_SIZE;
    }
  }
  return data;
}

/**
 * Apply a sparse chunk diff (local index -> id) belonging to chunk (dcx, dcz) onto the padded
 * volume of chunk (cx, cz). Entries that fall outside the padded window are ignored.
 */
export function applyDiffToPadded(padded: Uint8Array, cx: number, cz: number, dcx: number, dcz: number, indices: ArrayLike<number>, ids: ArrayLike<number>): number {
  const offX = (dcx - cx) * CHUNK_SIZE + 1;
  const offZ = (dcz - cz) * CHUNK_SIZE + 1;
  let applied = 0;
  for (let i = 0; i < indices.length; i++) {
    const idx = indices[i];
    const lx = idx % CHUNK_SIZE;
    const lz = Math.floor(idx / CHUNK_SIZE) % CHUNK_SIZE;
    const ly = Math.floor(idx / (CHUNK_SIZE * CHUNK_SIZE));
    const px = lx + offX;
    const pz = lz + offZ;
    if (px < 0 || px >= PADDED_SIZE || pz < 0 || pz >= PADDED_SIZE) continue;
    padded[paddedIndex(px, ly, pz)] = ids[i];
    applied++;
  }
  return applied;
}

/** A BlockSource backed by a padded volume: lets `ChunkMesher.build` run without a World. */
export class PaddedBlockSource implements BlockSource {
  private readonly padded: Uint8Array;
  private readonly originX: number;
  private readonly originZ: number;

  constructor(padded: Uint8Array, cx: number, cz: number) {
    this.padded = padded;
    this.originX = cx * CHUNK_SIZE - 1;
    this.originZ = cz * CHUNK_SIZE - 1;
  }

  getBlock(wx: number, wy: number, wz: number): number {
    if (wy < 0 || wy >= CHUNK_HEIGHT) return BlockId.AIR;
    const px = wx - this.originX;
    const pz = wz - this.originZ;
    if (px < 0 || px >= PADDED_SIZE || pz < 0 || pz >= PADDED_SIZE) return BlockId.AIR;
    return this.padded[paddedIndex(px, wy, pz)];
  }

  /** Build a Chunk object from the inner block of the padded volume. */
  toChunk(cx: number, cz: number): Chunk {
    return new Chunk(cx, cz, extractInner(this.padded));
  }
}
