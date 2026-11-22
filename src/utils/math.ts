import { CHUNK_SIZE } from '../world/Chunk';

/** Always returns a value in [0, m - 1], even for negative n (unlike the native % operator). */
export function floorMod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

export interface ChunkCoords {
  cx: number;
  cz: number;
  lx: number;
  ly: number;
  lz: number;
}

/** World (float or int) coordinates -> chunk coordinates + chunk-local integer coordinates. */
export function worldToChunkCoords(wx: number, wy: number, wz: number): ChunkCoords {
  const bx = Math.floor(wx);
  const bz = Math.floor(wz);
  return {
    cx: Math.floor(bx / CHUNK_SIZE),
    cz: Math.floor(bz / CHUNK_SIZE),
    lx: floorMod(bx, CHUNK_SIZE),
    ly: Math.floor(wy),
    lz: floorMod(bz, CHUNK_SIZE),
  };
}

/** Chunk coordinate -> world coordinate of the chunk's min corner. */
export function chunkToWorld(c: number): number {
  return c * CHUNK_SIZE;
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}
