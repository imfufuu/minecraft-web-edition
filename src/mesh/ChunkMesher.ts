import { BlockId, isLiquid, isOpaque } from '../blocks/BlockTypes';
import { getFaceTile } from '../blocks/BlockRegistry';
import { CHUNK_HEIGHT, CHUNK_SIZE, type Chunk } from '../world/Chunk';
import { FACES } from './FaceData';
import { AO_CURVE, FACE_SHADE, QUAD_INDICES, QUAD_INDICES_FLIPPED, shouldFlipQuad, vertexAO } from './Lighting';
import { getTileUV } from './AtlasLayout';

/** Raw CPU-side buffers for one geometry (one draw call). */
export interface GeometryBuffers {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  colors: Float32Array;
  indices: Uint32Array;
  vertexCount: number;
  faceCount: number;
}

/** Mesher output: the opaque geometry (top-level fields) plus a separate translucent water geometry. */
export interface MeshBuffers extends GeometryBuffers {
  water: GeometryBuffers;
}

/** Minimal world view the mesher needs: absolute-coordinate block lookup. */
export interface BlockSource {
  getBlock(wx: number, wy: number, wz: number): number;
}

export interface MesherOptions {
  /** Per-vertex ambient occlusion (default true). */
  ao: boolean;
  /** Directional face shading (default true). */
  shading: boolean;
}

/** How far the water surface sits below the top of its block. */
export const WATER_SURFACE_DROP = 0.125;

/** Growable scratch arrays for one geometry, reused across builds to avoid GC churn. */
class GeometryWriter {
  positions: number[] = [];
  normals: number[] = [];
  uvs: number[] = [];
  colors: number[] = [];
  indices: number[] = [];
  vertexCount = 0;
  faceCount = 0;

  reset(): void {
    this.positions.length = 0;
    this.normals.length = 0;
    this.uvs.length = 0;
    this.colors.length = 0;
    this.indices.length = 0;
    this.vertexCount = 0;
    this.faceCount = 0;
  }

  finish(): GeometryBuffers {
    return {
      positions: new Float32Array(this.positions),
      normals: new Float32Array(this.normals),
      uvs: new Float32Array(this.uvs),
      colors: new Float32Array(this.colors),
      indices: new Uint32Array(this.indices),
      vertexCount: this.vertexCount,
      faceCount: this.faceCount,
    };
  }
}

/**
 * Builds the merged geometry for one chunk.
 *
 * Culling: an opaque face is emitted only when the neighbouring voxel is not opaque (air or
 * water). Neighbours inside the chunk are read from the chunk array; neighbours across a
 * chunk border (including the diagonal samples needed for AO) are resolved through `world`.
 *
 * Lighting (P8): vertex colour = FACE_SHADE[face] × AO_CURVE[ao], where ao is derived
 * from the three blocks touching each corner on the outside of the face. Quads whose
 * default diagonal would create an anisotropic artefact are split along the other diagonal.
 *
 * Water (P11-b): emitted into a second geometry; a water face appears only against AIR
 * (never between two water blocks, never against opaque blocks), its top is lowered by
 * WATER_SURFACE_DROP, and it gets flat lighting (no AO) so the surface reads as one sheet.
 */
export class ChunkMesher {
  readonly options: MesherOptions;
  private readonly opaque = new GeometryWriter();
  private readonly water = new GeometryWriter();
  private readonly ao: [number, number, number, number] = [3, 3, 3, 3];

  constructor(options: Partial<MesherOptions> = {}) {
    this.options = { ao: options.ao ?? true, shading: options.shading ?? true };
  }

  build(chunk: Chunk, world?: BlockSource): MeshBuffers {
    this.opaque.reset();
    this.water.reset();

    const originX = chunk.cx * CHUNK_SIZE;
    const originZ = chunk.cz * CHUNK_SIZE;
    const useAO = this.options.ao;
    const useShade = this.options.shading;

    /** Block id at any chunk-local coordinate, falling back to the world across x/z borders. */
    const blockAt = (lx: number, ly: number, lz: number): number => {
      if (ly < 0 || ly >= CHUNK_HEIGHT) return BlockId.AIR;
      if (lx >= 0 && lx < CHUNK_SIZE && lz >= 0 && lz < CHUNK_SIZE) return chunk.getBlock(lx, ly, lz);
      if (!world) return BlockId.AIR;
      return world.getBlock(originX + lx, ly, originZ + lz);
    };
    const opaqueAt = (lx: number, ly: number, lz: number): boolean => isOpaque(blockAt(lx, ly, lz));

    for (let y = 0; y < CHUNK_HEIGHT; y++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        for (let x = 0; x < CHUNK_SIZE; x++) {
          const id = chunk.getBlock(x, y, z);
          if (id === BlockId.AIR) continue;
          const liquid = isLiquid(id);
          const out = liquid ? this.water : this.opaque;
          // A water block whose upper neighbour is not water carries the lowered surface.
          const surface = liquid && !isLiquid(blockAt(x, y + 1, z));

          for (const face of FACES) {
            const [dx, dy, dz] = face.dir;
            const n = blockAt(x + dx, y + dy, z + dz);
            if (liquid) {
              if (n !== BlockId.AIR) continue; // water only shows against air
            } else if (isOpaque(n)) continue;

            const [fnx, fny, fnz] = face.normal;
            const uv = getTileUV(getFaceTile(id, face.name));
            const shade = useShade ? FACE_SHADE[face.name] : 1;

            // --- per-corner AO (opaque only) ---
            if (useAO && !liquid) {
              const ox = x + dx;
              const oy = y + dy;
              const oz = z + dz;
              for (let c = 0; c < 4; c++) {
                const corner = face.corners[c];
                const sx = dx !== 0 ? 0 : corner[0] === 1 ? 1 : -1;
                const sy = dy !== 0 ? 0 : corner[1] === 1 ? 1 : -1;
                const sz = dz !== 0 ? 0 : corner[2] === 1 ? 1 : -1;
                let s1: boolean;
                let s2: boolean;
                if (dx !== 0) {
                  s1 = opaqueAt(ox, oy + sy, oz);
                  s2 = opaqueAt(ox, oy, oz + sz);
                } else if (dy !== 0) {
                  s1 = opaqueAt(ox + sx, oy, oz);
                  s2 = opaqueAt(ox, oy, oz + sz);
                } else {
                  s1 = opaqueAt(ox + sx, oy, oz);
                  s2 = opaqueAt(ox, oy + sy, oz);
                }
                const cn = opaqueAt(ox + sx, oy + sy, oz + sz);
                this.ao[c] = vertexAO(s1, s2, cn);
              }
            } else {
              this.ao[0] = this.ao[1] = this.ao[2] = this.ao[3] = 3;
            }

            // --- vertices (corner order: 0 = bottom-left, 1 = bottom-right, 2 = top-left, 3 = top-right) ---
            for (let c = 0; c < 4; c++) {
              const [cx, cy, cz] = face.corners[c];
              const vy = surface && cy === 1 ? y + 1 - WATER_SURFACE_DROP : y + cy;
              out.positions.push(x + cx, vy, z + cz);
              out.normals.push(fnx, fny, fnz);
              out.uvs.push(c === 1 || c === 3 ? uv.u1 : uv.u0, c >= 2 ? uv.v1 : uv.v0);
              const light = shade * AO_CURVE[this.ao[c]];
              out.colors.push(light, light, light);
            }

            // --- indices (flip the diagonal when needed to avoid anisotropic AO) ---
            const idx = shouldFlipQuad(this.ao[0], this.ao[1], this.ao[2], this.ao[3]) ? QUAD_INDICES_FLIPPED : QUAD_INDICES;
            for (let i = 0; i < 6; i++) out.indices.push(out.vertexCount + idx[i]);
            out.vertexCount += 4;
            out.faceCount++;
          }
        }
      }
    }

    return { ...this.opaque.finish(), water: this.water.finish() };
  }
}
