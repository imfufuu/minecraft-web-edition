/** 1-byte block identifiers stored in Chunk.data (Uint8Array). 0 is always AIR. */
export const BlockId = {
  AIR: 0,
  GRASS: 1,
  DIRT: 2,
  STONE: 3,
  BEDROCK: 4,
} as const;

export type BlockId = (typeof BlockId)[keyof typeof BlockId];

/** Temporary flat vertex colours (RGB 0..1) until the procedural texture atlas lands in P7. */
export const BLOCK_COLORS: Readonly<Record<BlockId, readonly [number, number, number]>> = {
  [BlockId.AIR]: [0, 0, 0],
  [BlockId.GRASS]: [0.42, 0.68, 0.3],
  [BlockId.DIRT]: [0.52, 0.37, 0.26],
  [BlockId.STONE]: [0.5, 0.5, 0.52],
  [BlockId.BEDROCK]: [0.2, 0.2, 0.22],
};

export function isSolid(id: number): boolean {
  return id !== BlockId.AIR;
}
