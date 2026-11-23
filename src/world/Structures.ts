import { BlockId } from '../blocks/BlockTypes';
import { hash2D } from '../utils/prng';
import { CHUNK_HEIGHT } from './Chunk';
import type { TerrainGenerator } from './TerrainGenerator';
import { Biome, MAX_TREE_CHANCE, surfaceBlockFor } from './Biomes';

/** Cactus: 1–3 blocks tall on desert sand (no canopy, so no spacing rule needed). */
const CACTUS_MAX_HEIGHT = 3;
/** Minimum Chebyshev distance between two tree trunks. */
export const TREE_SPACING = 2;
/** Horizontal canopy radius — also the margin a buffer must look outside itself for foreign canopies. */
export const TREE_RADIUS = 2;
const TRUNK_MIN = 4;
const TRUNK_EXTRA = 3; // trunk ∈ [4, 6]
/** Highest block of a tree above its surface column: trunk top + 2 canopy layers. */
const TREE_MAX_HEIGHT = TRUNK_MIN + TRUNK_EXTRA - 1 + 2;

const SALT_PLACE = 0x7a3e51 | 0;
const SALT_TRUNK = 0x5a1700;
const SALT_CACTUS = 0x3cac70;

export interface Tree {
  wx: number;
  wz: number;
  /** y of the surface block the trunk stands on. */
  baseY: number;
  trunkHeight: number;
}

/**
 * Deterministic tree placement: a column is a tree iff it is a candidate (hash below its
 * biome's treeChance), stands on grass/snow, has head-room, and no other candidate within
 * TREE_SPACING has a smaller hash. Every input is a pure function of (seed, wx, wz), so
 * chunk generation order and chunk borders cannot change the result.
 */
export class TreePlacer {
  private readonly generator: TerrainGenerator;
  private readonly seed: number;

  constructor(generator: TerrainGenerator) {
    this.generator = generator;
    this.seed = generator.seed;
  }

  private candidateHash(wx: number, wz: number): number {
    return hash2D(this.seed ^ SALT_PLACE, wx, wz);
  }

  /** Is this column a tree candidate (hash below its biome's chance, on a plantable surface)? */
  private isCandidate(wx: number, wz: number, h: number): boolean {
    if (h >= MAX_TREE_CHANCE) return false;
    const col = this.generator.columnAt(wx, wz);
    if (h >= col.biome.treeChance) return false;
    const top = surfaceBlockFor(col);
    return top === BlockId.GRASS || top === BlockId.SNOW;
  }

  /** Tree at this column, or null. */
  treeAt(wx: number, wz: number): Tree | null {
    const h0 = this.candidateHash(wx, wz);
    if (!this.isCandidate(wx, wz, h0)) return null;
    for (let dz = -TREE_SPACING; dz <= TREE_SPACING; dz++) {
      for (let dx = -TREE_SPACING; dx <= TREE_SPACING; dx++) {
        if (dx === 0 && dz === 0) continue;
        const hn = this.candidateHash(wx + dx, wz + dz);
        if (hn < h0 && this.isCandidate(wx + dx, wz + dz, hn)) return null; // a stronger candidate nearby wins
      }
    }
    const baseY = this.generator.heightAt(wx, wz);
    if (baseY + TREE_MAX_HEIGHT >= CHUNK_HEIGHT) return null;
    const trunkHeight = TRUNK_MIN + Math.floor(hash2D(this.seed ^ SALT_TRUNK, wx, wz) * TRUNK_EXTRA);
    return { wx, wz, baseY, trunkHeight };
  }

  /**
   * Stamp every tree whose canopy intersects a column buffer.
   * Buffer layout: index = lx + lz * sizeX + y * sizeX * sizeZ, covering world columns
   * [originX, originX + sizeX) × [originZ, originZ + sizeZ). Serves both the 16×16 chunk
   * and the 18×18 padded layouts.
   */
  stamp(data: Uint8Array, originX: number, originZ: number, sizeX: number, sizeZ: number): number {
    const layer = sizeX * sizeZ;
    let count = 0;
    for (let wz = originZ - TREE_RADIUS; wz < originZ + sizeZ + TREE_RADIUS; wz++) {
      for (let wx = originX - TREE_RADIUS; wx < originX + sizeX + TREE_RADIUS; wx++) {
        const inside = wx >= originX && wx < originX + sizeX && wz >= originZ && wz < originZ + sizeZ;
        if (inside) this.stampCactus(data, wx, wz, originX, originZ, sizeX, layer);
        const tree = this.treeAt(wx, wz);
        if (!tree) continue;
        count++;
        const top = tree.baseY + tree.trunkHeight;
        const put = (x: number, y: number, z: number, id: number, overwrite: boolean): void => {
          const lx = x - originX;
          const lz = z - originZ;
          if (lx < 0 || lx >= sizeX || lz < 0 || lz >= sizeZ || y < 0 || y >= CHUNK_HEIGHT) return;
          const i = lx + lz * sizeX + y * layer;
          if (overwrite || data[i] === BlockId.AIR) data[i] = id;
        };
        // Canopy first (never overwrites terrain or other trees' logs), trunk last (always wins).
        for (let dz = -2; dz <= 2; dz++) {
          for (let dx = -2; dx <= 2; dx++) {
            const corner = Math.abs(dx) === 2 && Math.abs(dz) === 2;
            // Two wide layers (radius 2 minus corners) just below / at the trunk top.
            if (!corner) {
              put(wx + dx, top - 1, wz + dz, BlockId.LEAVES, false);
              put(wx + dx, top, wz + dz, BlockId.LEAVES, false);
            }
            // One radius-1 layer above the trunk, then a plus-shaped cap.
            if (Math.abs(dx) <= 1 && Math.abs(dz) <= 1) put(wx + dx, top + 1, wz + dz, BlockId.LEAVES, false);
            if (Math.abs(dx) + Math.abs(dz) <= 1) put(wx + dx, top + 2, wz + dz, BlockId.LEAVES, false);
          }
        }
        for (let y = tree.baseY + 1; y <= top; y++) put(wx, y, wz, BlockId.OAK_LOG, true);
      }
    }
    return count;
  }

  /** Cactus at a desert column: 1–3 CACTUS blocks straight up from the sand. */
  cactusHeightAt(wx: number, wz: number): number {
    const r = hash2D(this.seed ^ SALT_CACTUS, wx, wz);
    const col = this.generator.columnAt(wx, wz);
    if (col.biome.id !== Biome.DESERT || r >= col.biome.cactusChance) return 0;
    return 1 + Math.floor((r / col.biome.cactusChance) * CACTUS_MAX_HEIGHT);
  }

  private stampCactus(data: Uint8Array, wx: number, wz: number, originX: number, originZ: number, sizeX: number, layer: number): void {
    // Cheap reject first: the hash alone rules out > 98% of columns before any noise is evaluated.
    if (hash2D(this.seed ^ SALT_CACTUS, wx, wz) >= 1 / 60) return;
    const n = this.cactusHeightAt(wx, wz);
    if (n === 0) return;
    const baseY = this.generator.heightAt(wx, wz);
    const i0 = wx - originX + (wz - originZ) * sizeX;
    for (let y = baseY + 1; y <= baseY + n && y < CHUNK_HEIGHT; y++) data[i0 + y * layer] = BlockId.CACTUS;
  }
}
