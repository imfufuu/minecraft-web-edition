import * as THREE from 'three';
import { BlockId, isSolid } from '../blocks/BlockTypes';
import { getFaceTile } from '../blocks/BlockRegistry';
import { CHUNK_HEIGHT, CHUNK_SIZE, type Chunk } from '../world/Chunk';
import { FACES } from './FaceData';
import { AO_CURVE, FACE_SHADE, QUAD_INDICES, QUAD_INDICES_FLIPPED, shouldFlipQuad, vertexAO } from './Lighting';
import { getTileUV } from './TextureAtlas';

/** Raw CPU-side buffers produced by the mesher. */
export interface MeshBuffers {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  colors: Float32Array;
  indices: Uint32Array;
  vertexCount: number;
  faceCount: number;
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

/**
 * Builds a single merged geometry for one chunk.
 *
 * Culling: a face is emitted only when the neighbouring voxel is not solid. Neighbours
 * inside the chunk are read from the chunk array; neighbours across a chunk border
 * (including the diagonal samples needed for AO) are resolved through `world.getBlock`.
 *
 * Lighting (P8): vertex colour = FACE_SHADE[face] × AO_CURVE[ao], where ao is derived
 * from the three blocks touching each corner on the outside of the face. Quads whose
 * default diagonal would create an anisotropic artefact are split along the other diagonal.
 */
export class ChunkMesher {
  readonly options: MesherOptions;

  // Growable scratch arrays reused across builds to avoid GC churn.
  private positions: number[] = [];
  private normals: number[] = [];
  private uvs: number[] = [];
  private colors: number[] = [];
  private indices: number[] = [];
  private readonly ao: [number, number, number, number] = [3, 3, 3, 3];

  constructor(options: Partial<MesherOptions> = {}) {
    this.options = { ao: options.ao ?? true, shading: options.shading ?? true };
  }

  build(chunk: Chunk, world?: BlockSource): MeshBuffers {
    this.positions.length = 0;
    this.normals.length = 0;
    this.uvs.length = 0;
    this.colors.length = 0;
    this.indices.length = 0;

    const originX = chunk.cx * CHUNK_SIZE;
    const originZ = chunk.cz * CHUNK_SIZE;
    const useAO = this.options.ao;
    const useShade = this.options.shading;
    let vertexCount = 0;
    let faceCount = 0;

    /** Solid test for any chunk-local coordinate, falling back to the world across x/z borders. */
    const solidAt = (lx: number, ly: number, lz: number): boolean => {
      if (ly < 0 || ly >= CHUNK_HEIGHT) return false;
      if (lx >= 0 && lx < CHUNK_SIZE && lz >= 0 && lz < CHUNK_SIZE) return isSolid(chunk.getBlock(lx, ly, lz));
      if (!world) return false;
      return isSolid(world.getBlock(originX + lx, ly, originZ + lz));
    };

    for (let y = 0; y < CHUNK_HEIGHT; y++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        for (let x = 0; x < CHUNK_SIZE; x++) {
          const id = chunk.getBlock(x, y, z);
          if (id === BlockId.AIR) continue;

          for (const face of FACES) {
            const [dx, dy, dz] = face.dir;
            if (solidAt(x + dx, y + dy, z + dz)) continue;

            const [fnx, fny, fnz] = face.normal;
            const uv = getTileUV(getFaceTile(id, face.name));
            const shade = useShade ? FACE_SHADE[face.name] : 1;

            // --- per-corner AO ---
            if (useAO) {
              // Cell just outside the face; AO samples live in that layer.
              const ox = x + dx;
              const oy = y + dy;
              const oz = z + dz;
              for (let c = 0; c < 4; c++) {
                const corner = face.corners[c];
                // Tangent offsets: for each axis that is not the normal axis, step towards the corner.
                const sx = dx !== 0 ? 0 : corner[0] === 1 ? 1 : -1;
                const sy = dy !== 0 ? 0 : corner[1] === 1 ? 1 : -1;
                const sz = dz !== 0 ? 0 : corner[2] === 1 ? 1 : -1;
                // The two tangent axes are the two non-zero entries of (sx, sy, sz).
                let s1: boolean;
                let s2: boolean;
                if (dx !== 0) {
                  s1 = solidAt(ox, oy + sy, oz);
                  s2 = solidAt(ox, oy, oz + sz);
                } else if (dy !== 0) {
                  s1 = solidAt(ox + sx, oy, oz);
                  s2 = solidAt(ox, oy, oz + sz);
                } else {
                  s1 = solidAt(ox + sx, oy, oz);
                  s2 = solidAt(ox, oy + sy, oz);
                }
                const cn = solidAt(ox + sx, oy + sy, oz + sz);
                this.ao[c] = vertexAO(s1, s2, cn);
              }
            } else {
              this.ao[0] = this.ao[1] = this.ao[2] = this.ao[3] = 3;
            }

            // --- vertices ---
            // Corner order per face: 0 = bottom-left, 1 = bottom-right, 2 = top-left, 3 = top-right (seen from outside).
            for (let c = 0; c < 4; c++) {
              const [cx, cy, cz] = face.corners[c];
              this.positions.push(x + cx, y + cy, z + cz);
              this.normals.push(fnx, fny, fnz);
              this.uvs.push(c === 1 || c === 3 ? uv.u1 : uv.u0, c >= 2 ? uv.v1 : uv.v0);
              const light = shade * AO_CURVE[this.ao[c]];
              this.colors.push(light, light, light);
            }

            // --- indices (flip the diagonal when needed to avoid anisotropic AO) ---
            const idx = shouldFlipQuad(this.ao[0], this.ao[1], this.ao[2], this.ao[3]) ? QUAD_INDICES_FLIPPED : QUAD_INDICES;
            for (let i = 0; i < 6; i++) this.indices.push(vertexCount + idx[i]);
            vertexCount += 4;
            faceCount++;
          }
        }
      }
    }

    return {
      positions: new Float32Array(this.positions),
      normals: new Float32Array(this.normals),
      uvs: new Float32Array(this.uvs),
      colors: new Float32Array(this.colors),
      indices: new Uint32Array(this.indices),
      vertexCount,
      faceCount,
    };
  }

  /** Wraps mesher output in a BufferGeometry with bounds computed for frustum culling. */
  static toGeometry(buffers: MeshBuffers): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(buffers.positions, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(buffers.normals, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(buffers.uvs, 2));
    geometry.setAttribute('color', new THREE.BufferAttribute(buffers.colors, 3));
    geometry.setIndex(new THREE.BufferAttribute(buffers.indices, 1));
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  }
}
