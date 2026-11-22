import * as THREE from 'three';
import { BLOCK_COLORS, BlockId, isSolid } from '../blocks/BlockTypes';
import { CHUNK_HEIGHT, CHUNK_SIZE, type Chunk } from '../world/Chunk';
import { FACES, FACE_INDICES } from './FaceData';

/** Raw CPU-side buffers produced by the mesher. */
export interface MeshBuffers {
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
  indices: Uint32Array;
  vertexCount: number;
  faceCount: number;
}

/** Minimal world view the mesher needs: absolute-coordinate block lookup. */
export interface BlockSource {
  getBlock(wx: number, wy: number, wz: number): number;
}

/**
 * Builds a single merged geometry for one chunk.
 * A face is emitted only when the neighbouring voxel in that direction is not solid.
 * Neighbours inside the chunk are read directly from the chunk array; neighbours
 * across a chunk border are resolved through `world.getBlock` (absolute coords),
 * so faces between two touching chunks are culled exactly like internal faces.
 * When no world is supplied (or the neighbour chunk is not loaded) border
 * neighbours read as AIR and the border face is emitted.
 */
export class ChunkMesher {
  // Growable scratch arrays reused across builds to avoid GC churn.
  private positions: number[] = [];
  private normals: number[] = [];
  private colors: number[] = [];
  private indices: number[] = [];

  build(chunk: Chunk, world?: BlockSource): MeshBuffers {
    this.positions.length = 0;
    this.normals.length = 0;
    this.colors.length = 0;
    this.indices.length = 0;

    const originX = chunk.cx * CHUNK_SIZE;
    const originZ = chunk.cz * CHUNK_SIZE;
    let vertexCount = 0;
    let faceCount = 0;

    for (let y = 0; y < CHUNK_HEIGHT; y++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        for (let x = 0; x < CHUNK_SIZE; x++) {
          const id = chunk.getBlock(x, y, z);
          if (id === BlockId.AIR) continue;

          const color = BLOCK_COLORS[id as BlockId] ?? BLOCK_COLORS[BlockId.STONE];

          for (const face of FACES) {
            const [dx, dy, dz] = face.dir;
            const nx = x + dx;
            const ny = y + dy;
            const nz = z + dz;

            let neighbour: number;
            if (nx >= 0 && nx < CHUNK_SIZE && nz >= 0 && nz < CHUNK_SIZE) {
              // Inside this chunk (Chunk.getBlock handles y out of range -> AIR).
              neighbour = chunk.getBlock(nx, ny, nz);
            } else if (world) {
              // Across a chunk border: ask the world using absolute coordinates.
              neighbour = world.getBlock(originX + nx, ny, originZ + nz);
            } else {
              neighbour = BlockId.AIR;
            }
            if (isSolid(neighbour)) continue;

            const [fnx, fny, fnz] = face.normal;
            for (const [cx, cy, cz] of face.corners) {
              this.positions.push(x + cx, y + cy, z + cz);
              this.normals.push(fnx, fny, fnz);
              this.colors.push(color[0], color[1], color[2]);
            }
            for (const i of FACE_INDICES) this.indices.push(vertexCount + i);
            vertexCount += 4;
            faceCount++;
          }
        }
      }
    }

    return {
      positions: new Float32Array(this.positions),
      normals: new Float32Array(this.normals),
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
    geometry.setAttribute('color', new THREE.BufferAttribute(buffers.colors, 3));
    geometry.setIndex(new THREE.BufferAttribute(buffers.indices, 1));
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  }
}
