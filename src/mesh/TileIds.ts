/** Indices into the 16×16-tile texture atlas (row-major, 16 tiles per row). */
export const Tile = {
  GRASS_TOP: 0,
  GRASS_SIDE: 1,
  DIRT: 2,
  STONE: 3,
  BEDROCK: 4,
  SAND: 5,
  LOG_SIDE: 6,
  LOG_TOP: 7,
  LEAVES: 8,
  PLANKS: 9,
  BRICK: 10,
  COBBLESTONE: 11,
} as const;

export type Tile = (typeof Tile)[keyof typeof Tile];
export const TILE_COUNT = 12;
