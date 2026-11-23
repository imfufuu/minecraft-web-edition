import * as THREE from 'three';
import { hash2D } from '../utils/prng';
import { Tile, TILE_COUNT } from './TileIds';
import { ATLAS_SIZE, ATLAS_TILES_PER_ROW, TILE_SIZE } from './AtlasLayout';

export { ATLAS_SIZE, ATLAS_TILES_PER_ROW, TILE_SIZE, UV_INSET, getTileUV, type TileUV } from './AtlasLayout';

type RGB = readonly [number, number, number];

/** Deterministic per-pixel random in [0, 1). `salt` lets one pixel draw several independent values. */
type Rnd = (x: number, y: number, salt?: number) => number;

const clamp255 = (v: number): number => (v < 0 ? 0 : v > 255 ? 255 : v | 0);
const vary = (c: RGB, amount: number, r: number): RGB => {
  const d = (r * 2 - 1) * amount;
  return [clamp255(c[0] + d), clamp255(c[1] + d), clamp255(c[2] + d)];
};

const GRASS: RGB = [106, 170, 64];
const DIRT: RGB = [134, 96, 67];
const STONE: RGB = [125, 125, 125];
const BEDROCK: RGB = [62, 62, 62];
const SAND: RGB = [219, 207, 163];
const BARK: RGB = [102, 81, 51];
const WOOD_LIGHT: RGB = [168, 136, 84];
const WOOD_DARK: RGB = [128, 100, 58];
const LEAF: RGB = [58, 138, 42];
const LEAF_DARK: RGB = [34, 92, 26];
const PLANK: RGB = [162, 131, 79];
const PLANK_LINE: RGB = [110, 86, 48];
const BRICK: RGB = [152, 72, 56];
const MORTAR: RGB = [176, 170, 162];
const WATER: RGB = [52, 96, 212];
const WATER_LIGHT: RGB = [84, 132, 232];

/** Pixel painter for one tile: (x, y) in [0, 16) with y = 0 at the TOP of the tile. */
type Painter = (x: number, y: number, rnd: Rnd) => RGB;

const painters: Record<Tile, Painter> = {
  [Tile.GRASS_TOP]: (x, y, rnd) => vary(GRASS, 14, rnd(x, y)),
  [Tile.GRASS_SIDE]: (x, y, rnd) => {
    const edge = 2 + Math.floor(rnd(x, 0, 1) * 3); // jagged grass fringe, 2–4 px
    if (y < edge) return vary(GRASS, 12, rnd(x, y));
    return vary(DIRT, 14, rnd(x, y));
  },
  [Tile.DIRT]: (x, y, rnd) => vary(DIRT, 16, rnd(x, y)),
  [Tile.STONE]: (x, y, rnd) => {
    const speck = rnd(x, y, 2) < 0.08;
    return vary(speck ? [100, 100, 100] : STONE, 9, rnd(x, y));
  },
  [Tile.BEDROCK]: (x, y, rnd) => vary(BEDROCK, 30, rnd(x, y)),
  [Tile.SAND]: (x, y, rnd) => vary(SAND, 9, rnd(x, y)),
  [Tile.LOG_SIDE]: (x, y, rnd) => {
    const stripe = (rnd(x, 0, 3) * 2 - 1) * 16; // per-column bark stripe
    const c = vary(BARK, 6, rnd(x, y));
    return [clamp255(c[0] + stripe), clamp255(c[1] + stripe), clamp255(c[2] + stripe * 0.7)];
  },
  [Tile.LOG_TOP]: (x, y, rnd) => {
    const dx = x - 7.5;
    const dy = y - 7.5;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d > 6.6) return vary(BARK, 10, rnd(x, y));
    const ring = Math.floor(d * 1.1) % 2 === 0;
    return vary(ring ? WOOD_LIGHT : WOOD_DARK, 8, rnd(x, y));
  },
  [Tile.LEAVES]: (x, y, rnd) => (rnd(x, y, 4) < 0.18 ? vary(LEAF_DARK, 14, rnd(x, y)) : vary(LEAF, 20, rnd(x, y))),
  [Tile.PLANKS]: (x, y, rnd) => {
    const board = Math.floor(y / 4);
    const seam = (x + board * 5) % 16 === 0;
    if (y % 4 === 0 || seam) return vary(PLANK_LINE, 8, rnd(x, y));
    return vary(PLANK, 10, rnd(x, y));
  },
  [Tile.BRICK]: (x, y, rnd) => {
    const row = Math.floor(y / 4);
    const offset = row % 2 === 0 ? 0 : 4;
    const mortar = y % 4 === 0 || (x + offset) % 8 === 0;
    return mortar ? vary(MORTAR, 8, rnd(x, y)) : vary(BRICK, 12, rnd(x, y));
  },
  [Tile.COBBLESTONE]: (x, y, rnd) => {
    const cx = Math.floor(x / 4);
    const cy = Math.floor(y / 4);
    const cell = rnd(cx, cy, 5) * 2 - 1;
    const border = x % 4 === 0 || y % 4 === 0;
    const base: RGB = border ? [88, 88, 88] : [122 + cell * 22, 122 + cell * 22, 122 + cell * 22];
    return vary(base, 10, rnd(x, y));
  },
  [Tile.WATER]: (x, y, rnd) => {
    // Soft diagonal ripples; alpha is applied by the material, not the texture.
    const ripple = Math.sin((x + y * 0.5) * 0.9 + rnd(0, Math.floor(y / 4), 6) * 2) > 0.55;
    return vary(ripple ? WATER_LIGHT : WATER, 8, rnd(x, y));
  },
};

/**
 * Paint the whole atlas into an RGBA buffer, deterministically from `seed`.
 * Buffer rows are stored bottom-up (row 0 = v 0) so it can be uploaded directly
 * as a DataTexture (flipY = false) while painters think in top-down tile coordinates.
 */
export function paintAtlas(seed = 1337): Uint8ClampedArray {
  const data = new Uint8ClampedArray(ATLAS_SIZE * ATLAS_SIZE * 4);
  for (let tile = 0; tile < TILE_COUNT; tile++) {
    const painter = painters[tile as Tile];
    const tx = (tile % ATLAS_TILES_PER_ROW) * TILE_SIZE;
    const ty = Math.floor(tile / ATLAS_TILES_PER_ROW) * TILE_SIZE;
    const rnd: Rnd = (x, y, salt = 0) => hash2D(seed + salt * 7919 + tile * 104729, x, y);
    for (let y = 0; y < TILE_SIZE; y++) {
      for (let x = 0; x < TILE_SIZE; x++) {
        const [r, g, b] = painter(x, y, rnd);
        const px = tx + x;
        const pyTopDown = ty + y;
        const pyBottomUp = ATLAS_SIZE - 1 - pyTopDown;
        const i = (pyBottomUp * ATLAS_SIZE + px) * 4;
        data[i] = r;
        data[i + 1] = g;
        data[i + 2] = b;
        data[i + 3] = 255;
      }
    }
  }
  return data;
}

/** Atlas texture + (in browsers) a canvas copy for UI thumbnails. */
export class TextureAtlas {
  readonly data: Uint8ClampedArray;
  readonly texture: THREE.DataTexture;
  /** Top-down canvas copy of the atlas, or null when 2D canvas is unavailable (headless). */
  readonly canvas: HTMLCanvasElement | null;

  constructor(seed = 1337) {
    this.data = paintAtlas(seed);
    this.texture = new THREE.DataTexture(this.data, ATLAS_SIZE, ATLAS_SIZE, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.minFilter = THREE.NearestFilter;
    this.texture.generateMipmaps = false;
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.flipY = false;
    this.texture.needsUpdate = true;
    this.canvas = this.buildCanvas();
  }

  private buildCanvas(): HTMLCanvasElement | null {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = ATLAS_SIZE;
    canvas.height = ATLAS_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx || typeof ImageData === 'undefined') return null;
    // Flip rows back to top-down for the canvas.
    const topDown = new Uint8ClampedArray(this.data.length);
    const rowBytes = ATLAS_SIZE * 4;
    for (let y = 0; y < ATLAS_SIZE; y++) {
      topDown.set(this.data.subarray(y * rowBytes, (y + 1) * rowBytes), (ATLAS_SIZE - 1 - y) * rowBytes);
    }
    ctx.putImageData(new ImageData(topDown, ATLAS_SIZE, ATLAS_SIZE), 0, 0);
    return canvas;
  }

  /** Draw a tile scaled into a target canvas (pixel-perfect, no smoothing). */
  drawTile(tile: number, target: HTMLCanvasElement): void {
    if (!this.canvas) return;
    const ctx = target.getContext('2d');
    if (!ctx) return;
    const sx = (tile % ATLAS_TILES_PER_ROW) * TILE_SIZE;
    const sy = Math.floor(tile / ATLAS_TILES_PER_ROW) * TILE_SIZE;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, target.width, target.height);
    ctx.drawImage(this.canvas, sx, sy, TILE_SIZE, TILE_SIZE, 0, 0, target.width, target.height);
  }

  dispose(): void {
    this.texture.dispose();
  }
}
