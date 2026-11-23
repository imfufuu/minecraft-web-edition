import { BlockId } from '../blocks/BlockTypes';

/** Biome ids (not stored in chunk data; derived from climate noise on demand). */
export const Biome = {
  OCEAN: 0,
  BEACH: 1,
  PLAINS: 2,
  FOREST: 3,
  DESERT: 4,
  SAVANNA: 5,
  SNOWY: 6,
  MOUNTAINS: 7,
} as const;
export type Biome = (typeof Biome)[keyof typeof Biome];

export interface BiomeDef {
  readonly id: Biome;
  readonly name: string;
  /** Tree candidate probability per column (0 = no trees). */
  readonly treeChance: number;
  /** Cactus probability per column (deserts only). */
  readonly cactusChance: number;
  /** Surface block at y = h. Mountains decide by altitude. */
  readonly top: BlockId;
  /** Filler block for the few layers under the surface. */
  readonly filler: BlockId;
  readonly fillerDepth: number;
}

const def = (id: Biome, name: string, top: BlockId, filler: BlockId, treeChance: number, cactusChance = 0, fillerDepth = 3): BiomeDef => ({
  id,
  name,
  top,
  filler,
  treeChance,
  cactusChance,
  fillerDepth,
});

export const BIOMES: readonly BiomeDef[] = [
  def(Biome.OCEAN, 'Ocean', BlockId.SAND, BlockId.SAND, 0, 0, 2),
  def(Biome.BEACH, 'Beach', BlockId.SAND, BlockId.SAND, 0),
  def(Biome.PLAINS, 'Plains', BlockId.GRASS, BlockId.DIRT, 1 / 450),
  def(Biome.FOREST, 'Forest', BlockId.GRASS, BlockId.DIRT, 1 / 55),
  def(Biome.DESERT, 'Desert', BlockId.SAND, BlockId.SAND, 0, 1 / 90, 4),
  def(Biome.SAVANNA, 'Savanna', BlockId.GRASS, BlockId.DIRT, 1 / 700),
  def(Biome.SNOWY, 'Snowy Tundra', BlockId.SNOW, BlockId.DIRT, 1 / 260),
  def(Biome.MOUNTAINS, 'Mountains', BlockId.STONE, BlockId.STONE, 1 / 320, 0, 0),
];

/** Largest tree chance of any biome — cheap pre-filter before the climate lookup. */
export const MAX_TREE_CHANCE = Math.max(...BIOMES.map((b) => b.treeChance));

/** Mountains: bare stone above this altitude, snow-capped above SNOW_LINE. */
export const MOUNTAIN_STONE_LINE = 38;
export const SNOW_LINE = 48;

export interface ColumnInfo {
  /** Surface height (y of the top-most solid block). */
  h: number;
  biome: BiomeDef;
  temperature: number;
  humidity: number;
  /** 0 = flat lowland … 1 = full mountain. */
  mountain: number;
}

/** Block at the surface of a column (mountains vary with altitude). */
export function surfaceBlockFor(col: ColumnInfo): BlockId {
  if (col.biome.id === Biome.MOUNTAINS) {
    if (col.h >= SNOW_LINE) return BlockId.SNOW;
    if (col.h >= MOUNTAIN_STONE_LINE) return BlockId.STONE;
    return BlockId.GRASS;
  }
  return col.biome.top;
}

export function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}
