import { BlockId } from './BlockTypes';
import { Tile } from '../mesh/TileIds';
import type { Face } from '../mesh/FaceData';

export interface BlockDef {
  readonly id: BlockId;
  readonly name: string;
  /** Atlas tile per face group. */
  readonly top: Tile;
  readonly bottom: Tile;
  readonly side: Tile;
  readonly breakable: boolean;
}

function def(id: BlockId, name: string, top: Tile, side: Tile = top, bottom: Tile = top, breakable = true): BlockDef {
  return { id, name, top, side, bottom, breakable };
}

/** Indexed by BlockId. AIR has a placeholder entry so lookups never return undefined. */
export const BLOCK_REGISTRY: readonly BlockDef[] = [
  def(BlockId.AIR, 'Air', Tile.STONE, Tile.STONE, Tile.STONE, false),
  def(BlockId.GRASS, 'Grass Block', Tile.GRASS_TOP, Tile.GRASS_SIDE, Tile.DIRT),
  def(BlockId.DIRT, 'Dirt', Tile.DIRT),
  def(BlockId.STONE, 'Stone', Tile.STONE),
  def(BlockId.BEDROCK, 'Bedrock', Tile.BEDROCK, Tile.BEDROCK, Tile.BEDROCK, false),
  def(BlockId.SAND, 'Sand', Tile.SAND),
  def(BlockId.OAK_LOG, 'Oak Log', Tile.LOG_TOP, Tile.LOG_SIDE, Tile.LOG_TOP),
  def(BlockId.LEAVES, 'Oak Leaves', Tile.LEAVES),
  def(BlockId.PLANKS, 'Oak Planks', Tile.PLANKS),
  def(BlockId.BRICK, 'Bricks', Tile.BRICK),
  def(BlockId.COBBLESTONE, 'Cobblestone', Tile.COBBLESTONE),
  def(BlockId.WATER, 'Water', Tile.WATER, Tile.WATER, Tile.WATER, false),
  def(BlockId.SNOW, 'Snow Block', Tile.SNOW),
  def(BlockId.CACTUS, 'Cactus', Tile.CACTUS_TOP, Tile.CACTUS_SIDE, Tile.CACTUS_TOP),
];

export function getBlockDef(id: number): BlockDef {
  return BLOCK_REGISTRY[id] ?? BLOCK_REGISTRY[BlockId.STONE];
}

/** Atlas tile for a given block face. */
export function getFaceTile(id: number, face: Face['name']): Tile {
  const d = getBlockDef(id);
  if (face === 'top') return d.top;
  if (face === 'bottom') return d.bottom;
  return d.side;
}

/** Block ids offered in the hotbar, in slot order (1–9). */
export const HOTBAR_BLOCKS: readonly BlockId[] = [
  BlockId.GRASS,
  BlockId.DIRT,
  BlockId.STONE,
  BlockId.COBBLESTONE,
  BlockId.SAND,
  BlockId.OAK_LOG,
  BlockId.PLANKS,
  BlockId.LEAVES,
  BlockId.BRICK,
];
