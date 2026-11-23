/** 1-byte block identifiers stored in Chunk.data (Uint8Array). 0 is always AIR. */
export const BlockId = {
  AIR: 0,
  GRASS: 1,
  DIRT: 2,
  STONE: 3,
  BEDROCK: 4,
  SAND: 5,
  OAK_LOG: 6,
  LEAVES: 7,
  PLANKS: 8,
  BRICK: 9,
  COBBLESTONE: 10,
} as const;

export type BlockId = (typeof BlockId)[keyof typeof BlockId];

export function isSolid(id: number): boolean {
  return id !== BlockId.AIR;
}
