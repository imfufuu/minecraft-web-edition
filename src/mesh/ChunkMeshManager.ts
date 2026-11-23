import * as THREE from 'three';
import { CHUNK_SIZE, type Chunk } from '../world/Chunk';
import type { World } from '../world/World';
import { ChunkMesher } from './ChunkMesher';

/**
 * Owns exactly one THREE.Mesh per non-empty chunk and guarantees that every
 * replaced or removed geometry is disposed (no GPU memory leaks).
 */
export class ChunkMeshManager {
  readonly meshes = new Map<string, THREE.Mesh>();
  readonly material: THREE.Material;
  private readonly scene: THREE.Scene;
  private readonly world: World;
  readonly mesher = new ChunkMesher();

  /** Running statistics for the debug overlay. */
  totalFaces = 0;
  private readonly facesPerChunk = new Map<string, number>();

  constructor(scene: THREE.Scene, world: World, material: THREE.Material) {
    this.scene = scene;
    this.world = world;
    this.material = material;
  }

  /** (Re)build the mesh of one chunk, disposing any previous geometry first. */
  rebuild(chunk: Chunk): void {
    const key = chunk.key;
    const buffers = this.mesher.build(chunk, this.world);
    chunk.dirty = false;

    this.totalFaces += buffers.faceCount - (this.facesPerChunk.get(key) ?? 0);
    this.facesPerChunk.set(key, buffers.faceCount);

    this.remove(key);
    if (buffers.vertexCount === 0) return; // all-air chunk: no mesh at all

    const geometry = ChunkMesher.toGeometry(buffers);
    const mesh = new THREE.Mesh(geometry, this.material);
    mesh.position.set(chunk.cx * CHUNK_SIZE, 0, chunk.cz * CHUNK_SIZE);
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    mesh.frustumCulled = true;
    this.scene.add(mesh);
    this.meshes.set(key, mesh);
  }

  /** Remove the mesh of a chunk and release its GPU buffers. */
  remove(key: string): void {
    const existing = this.meshes.get(key);
    if (!existing) return;
    this.scene.remove(existing);
    existing.geometry.dispose(); // never skip: frees the vertex/index buffers on the GPU
    this.meshes.delete(key);
  }

  /** Rebuild every chunk flagged dirty. Returns the number of rebuilt chunks. */
  rebuildDirty(): number {
    let n = 0;
    for (const chunk of this.world.chunks.values()) {
      if (chunk.dirty) {
        this.rebuild(chunk);
        n++;
      }
    }
    return n;
  }

  /** Build all loaded chunks from scratch. */
  rebuildAll(): void {
    for (const chunk of this.world.chunks.values()) this.rebuild(chunk);
  }

  dispose(): void {
    for (const key of [...this.meshes.keys()]) this.remove(key);
    this.facesPerChunk.clear();
    this.totalFaces = 0;
  }
}
