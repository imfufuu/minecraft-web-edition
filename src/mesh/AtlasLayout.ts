/**
 * Atlas layout + UV maths. Deliberately free of three.js imports so the chunk worker
 * can bundle the mesher without pulling the renderer in.
 */
export const ATLAS_TILES_PER_ROW = 16;
export const TILE_SIZE = 16;
export const ATLAS_SIZE = ATLAS_TILES_PER_ROW * TILE_SIZE; // 256
/** UV inset (in texture space) to stop neighbouring tiles bleeding under NearestFilter + mipless sampling. */
export const UV_INSET = 0.001;

export interface TileUV {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

/** UV rectangle of a tile (bottom-left u0,v0 → top-right u1,v1), inset to prevent bleeding. */
export function getTileUV(tile: number): TileUV {
  const col = tile % ATLAS_TILES_PER_ROW;
  const row = Math.floor(tile / ATLAS_TILES_PER_ROW);
  const s = 1 / ATLAS_TILES_PER_ROW;
  // Buffer rows are bottom-up, so tile row 0 (painted at the top) occupies the top of UV space.
  const vTop = 1 - row * s;
  return {
    u0: col * s + UV_INSET,
    u1: (col + 1) * s - UV_INSET,
    v0: vTop - s + UV_INSET,
    v1: vTop - UV_INSET,
  };
}
