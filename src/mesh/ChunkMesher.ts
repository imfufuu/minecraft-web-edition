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

/**
 * Builds a single merged geometry for one chunk.
 * A face is emitted only when the neighbouring voxel in that direction is AIR,
 * so internal faces between touching solid blocks never produce vertices.
 */
export class ChunkMesher {
  // Growable scratch arrays reused across builds to avoid GC churn.
  private positions: number[] = [];
  private normals: number[] = [];
  private colors: number[] = [];
  private indices: number[] = [];

  build(chunk: Chunk): MeshBuffers {
    this.positions.length = 0;
    this.normals.length = 0;
    this.colors.length = 0;
    this.indices.length = 0;

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
            // Out-of-range neighbours read as AIR -> chunk boundary faces are emitted (refined in P4).
            if (isSolid(chunk.getBlock(x + dx, y + dy, z + dz))) continue;

            const [nx, ny, nz] = face.normal;
            for (const [cx, cy, cz] of face.corners) {
              this.positions.push(x + cx, y + cy, z + cz);
              this.normals.push(nx, ny, nz);
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

  /** Wraps mesher output in a BufferGeometry. Returns a geometry with 0 vertices for empty chunks. */
  static toGeometry(buffers: MeshBuffers): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(buffers.positions, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(buffers.normals, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(buffers.colors, 3));
    geometry.setIndex(new THREE.BufferAttribute(buffers.indices, 1));
    return geometry;
  }
}
