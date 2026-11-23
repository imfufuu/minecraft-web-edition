import { BlockId } from '../blocks/BlockTypes';
import { SimplexNoise2D } from '../utils/noise';
import { hashSeed } from '../utils/prng';
import { Biome, BIOMES, smoothstep, surfaceBlockFor, type ColumnInfo } from './Biomes';

export type { ColumnInfo } from './Biomes';
import { CHUNK_SIZE, type Chunk } from './Chunk';
import { TreePlacer } from './Structures';

export const SEA_LEVEL = 20;
const BASE_HEIGHT = 24;
const HEIGHT_AMPLITUDE = 14;
const NOISE_SCALE = 1 / 64;
const OCTAVES = 3;
/** Mountains add up to this much base height and amplitude. */
const MOUNTAIN_LIFT = 10;
const MOUNTAIN_AMPLITUDE = 22;
const MAX_HEIGHT = 60;
const CLIMATE_SCALE = 1 / 300;
const RUGGED_SCALE = 1 / 220;

/**
 * Seeded, fully deterministic terrain. The same seed + same (wx, wz) always
 * produces the same column, independent of chunk boundaries or generation order.
 *
 * Biomes (P11-g) come from three slow climate noises — temperature, humidity and
 * ruggedness — evaluated per column; height blends toward a taller, rougher profile
 * where ruggedness is high (mountains).
 */
export class TerrainGenerator {
  readonly seed: number;
  readonly trees: TreePlacer;
  private readonly heightNoise: SimplexNoise2D;
  private readonly tempNoise: SimplexNoise2D;
  private readonly humidNoise: SimplexNoise2D;
  private readonly ruggedNoise: SimplexNoise2D;

  constructor(seed: string | number) {
    this.seed = hashSeed(seed);
    this.heightNoise = new SimplexNoise2D(this.seed);
    this.tempNoise = new SimplexNoise2D((this.seed ^ 0x7e3a9c11) >>> 0);
    this.humidNoise = new SimplexNoise2D((this.seed ^ 0x2b1f8d57) >>> 0);
    this.ruggedNoise = new SimplexNoise2D((this.seed ^ 0x51c3e6a9) >>> 0);
    this.trees = new TreePlacer(this);
  }

  /** 0 = flat … 1 = mountain, from the ruggedness noise. */
  private mountainAt(wx: number, wz: number): number {
    const r = 0.5 + 0.5 * this.ruggedNoise.fbm(wx * RUGGED_SCALE, wz * RUGGED_SCALE, 2);
    return smoothstep(0.58, 0.8, r);
  }

  private heightFor(wx: number, wz: number, mountain: number): number {
    const n = this.heightNoise.fbm(wx * NOISE_SCALE, wz * NOISE_SCALE, OCTAVES);
    const h = Math.floor(BASE_HEIGHT + mountain * MOUNTAIN_LIFT + n * (HEIGHT_AMPLITUDE + mountain * MOUNTAIN_AMPLITUDE));
    return Math.max(1, Math.min(MAX_HEIGHT, h));
  }

  /** Surface height (y of the top-most solid block) at an absolute world column. */
  heightAt(wx: number, wz: number): number {
    return this.heightFor(wx, wz, this.mountainAt(wx, wz));
  }

  /** Height + biome + climate for one column (single evaluation of every noise). */
  columnAt(wx: number, wz: number): ColumnInfo {
    const mountain = this.mountainAt(wx, wz);
    const h = this.heightFor(wx, wz, mountain);
    const temperature = 0.5 + 0.5 * this.tempNoise.fbm(wx * CLIMATE_SCALE, wz * CLIMATE_SCALE, 2);
    const humidity = 0.5 + 0.5 * this.humidNoise.fbm(wx * CLIMATE_SCALE, wz * CLIMATE_SCALE, 2);
    let biome: Biome;
    if (h < SEA_LEVEL - 1) biome = Biome.OCEAN;
    else if (h <= SEA_LEVEL + 1) biome = Biome.BEACH;
    else if (mountain > 0.5) biome = Biome.MOUNTAINS;
    else if (temperature < 0.32) biome = Biome.SNOWY;
    else if (temperature > 0.66 && humidity < 0.42) biome = Biome.DESERT;
    else if (temperature > 0.66) biome = Biome.SAVANNA;
    else if (humidity > 0.58) biome = Biome.FOREST;
    else biome = Biome.PLAINS;
    return { h, biome: BIOMES[biome], temperature, humidity, mountain };
  }

  /**
   * Fill one vertical column into any flat buffer. `base` is the index of y=0 for this
   * column and `yStride` the distance between consecutive y layers — so the same routine
   * serves both the 16×16 chunk layout and the 18×18 padded layout used by workers.
   */
  fillColumn(wx: number, wz: number, data: Uint8Array, base: number, yStride: number): void {
    const col = this.columnAt(wx, wz);
    const h = col.h;
    const top = surfaceBlockFor(col);
    // Grassy mountain slopes still get a dirt layer; stone/snow summits sit on bare stone.
    const filler = col.biome.id === Biome.MOUNTAINS ? (top === BlockId.GRASS ? BlockId.DIRT : BlockId.STONE) : col.biome.filler;
    const fillerDepth = col.biome.id === Biome.MOUNTAINS ? (top === BlockId.GRASS ? 3 : 0) : col.biome.fillerDepth;
    for (let y = 0; y <= h; y++) {
      let id: BlockId;
      if (y === 0) id = BlockId.BEDROCK;
      else if (y === h) id = top;
      else if (y >= h - fillerDepth) id = filler;
      else id = BlockId.STONE;
      data[base + y * yStride] = id;
    }
    // Still water fills every column below sea level up to (and including) SEA_LEVEL.
    for (let y = h + 1; y <= SEA_LEVEL; y++) data[base + y * yStride] = BlockId.WATER;
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
