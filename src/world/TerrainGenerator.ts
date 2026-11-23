import { BlockId } from '../blocks/BlockTypes';
import { SimplexNoise2D } from '../utils/noise';
import { hashSeed } from '../utils/prng';
import { CHUNK_HEIGHT, CHUNK_SIZE, type Chunk } from './Chunk';
import { TreePlacer } from './Structures';

export const SEA_LEVEL = 20;
const BASE_HEIGHT = 24;
const HEIGHT_AMPLITUDE = 14;
const NOISE_SCALE = 1 / 64;
const OCTAVES = 3;
const DIRT_DEPTH = 3;

/**
 * Seeded, fully deterministic terrain. The same seed + same (wx, wz) always
 * produces the same column, independent of chunk boundaries or generation order.
 */
export class TerrainGenerator {
  readonly seed: number;
  readonly trees: TreePlacer;
  private readonly heightNoise: SimplexNoise2D;

  constructor(seed: string | number) {
    this.seed = hashSeed(seed);
    this.heightNoise = new SimplexNoise2D(this.seed);
    this.trees = new TreePlacer(this);
  }

  /** Surface height (y of the top-most solid block) at an absolute world column. */
  heightAt(wx: number, wz: number): number {
    const n = this.heightNoise.fbm(wx * NOISE_SCALE, wz * NOISE_SCALE, OCTAVES);
    const h = Math.floor(BASE_HEIGHT + n * HEIGHT_AMPLITUDE);
    return Math.max(1, Math.min(CHUNK_HEIGHT - 1, h));
  }

  /**
   * Fill one vertical column into any flat buffer. `base` is the index of y=0 for this
   * column and `yStride` the distance between consecutive y layers — so the same routine
   * serves both the 16×16 chunk layout and the 18×18 padded layout used by workers.
   */
  fillColumn(wx: number, wz: number, data: Uint8Array, base: number, yStride: number): void {
    const h = this.heightAt(wx, wz);
    const beach = h <= SEA_LEVEL + 1;
    for (let y = 0; y <= h; y++) {
      let id: BlockId;
      if (y === 0) id = BlockId.BEDROCK;
      else if (y === h) id = beach ? BlockId.SAND : BlockId.GRASS;
      else if (y >= h - DIRT_DEPTH) id = beach ? BlockId.SAND : BlockId.DIRT;
      else id = BlockId.STONE;
      data[base + y * yStride] = id;
    }
  }

  /** Fill `chunk.data` in place using absolute world coordinates for every column. */
  generate(chunk: Chunk): void {
    const originX = chunk.cx * CHUNK_SIZE;
    const originZ = chunk.cz * CHUNK_SIZE;
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        this.fillColumn(originX + lx, originZ + lz, chunk.data, lx + lz * CHUNK_SIZE, CHUNK_SIZE * CHUNK_SIZE);
      }
    }
    this.trees.stamp(chunk.data, originX, originZ, CHUNK_SIZE, CHUNK_SIZE);
    chunk.dirty = true;
  }
}
