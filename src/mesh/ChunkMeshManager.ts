import * as THREE from 'three';
import { CHUNK_SIZE, type Chunk } from '../world/Chunk';
import type { World } from '../world/World';
import { ChunkMesher, type GeometryBuffers, type MeshBuffers } from './ChunkMesher';

/** Wraps mesher output in a BufferGeometry with bounds computed for frustum culling. */
export function buffersToGeometry(buffers: GeometryBuffers): THREE.BufferGeometry {
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

/**
 * Owns at most two THREE.Mesh per chunk (opaque + translucent water) and guarantees that
 * every replaced or removed geometry is disposed (no GPU memory leaks).
 */
export class ChunkMeshManager {
  readonly meshes = new Map<string, THREE.Mesh>();
  readonly waterMeshes = new Map<string, THREE.Mesh>();
  readonly material: THREE.Material;
  readonly waterMaterial: THREE.Material;
  private readonly scene: THREE.Scene;
  private readonly world: World;
  readonly mesher = new ChunkMesher();

  /** Running statistics for the debug overlay. */
  totalFaces = 0;
  totalWaterFaces = 0;
  /** Lifetime count of geometries disposed (debug / leak audit). */
  disposed = 0;
  private readonly facesPerChunk = new Map<string, number>();
  private readonly waterFacesPerChunk = new Map<string, number>();

  constructor(scene: THREE.Scene, world: World, material: THREE.Material, waterMaterial: THREE.Material) {
    this.scene = scene;
    this.world = world;
    this.material = material;
    this.waterMaterial = waterMaterial;
  }

  /** (Re)build the mesh of one chunk on the main thread, disposing any previous geometry first. */
  rebuild(chunk: Chunk): void {
    const buffers = this.mesher.build(chunk, this.world);
    chunk.dirty = false;
    this.install(chunk, buffers);
  }

  /** Upload pre-built buffers (e.g. from a worker) as the chunk's mesh, replacing any previous one. */
  install(chunk: Chunk, buffers: MeshBuffers): void {
    const key = chunk.key;
    this.remove(key);
    this.totalFaces += buffers.faceCount;
    this.facesPerChunk.set(key, buffers.faceCount);
    this.totalWaterFaces += buffers.water.faceCount;
    this.waterFacesPerChunk.set(key, buffers.water.faceCount);
    if (buffers.vertexCount > 0) this.meshes.set(key, this.addMesh(chunk, buffers, this.material, 0));
    if (buffers.water.vertexCount > 0) this.waterMeshes.set(key, this.addMesh(chunk, buffers.water, this.waterMaterial, 1));
  }

  private addMesh(chunk: Chunk, buffers: GeometryBuffers, material: THREE.Material, renderOrder: number): THREE.Mesh {
    const mesh = new THREE.Mesh(buffersToGeometry(buffers), material);
    mesh.position.set(chunk.cx * CHUNK_SIZE, 0, chunk.cz * CHUNK_SIZE);
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    mesh.frustumCulled = true;
    mesh.renderOrder = renderOrder; // water after all opaque geometry
    this.scene.add(mesh);
    return mesh;
  }

  /** Remove the mesh of a chunk and release its GPU buffers. */
  remove(key: string): void {
    this.totalFaces -= this.facesPerChunk.get(key) ?? 0;
    this.facesPerChunk.delete(key);
    this.totalWaterFaces -= this.waterFacesPerChunk.get(key) ?? 0;
    this.waterFacesPerChunk.delete(key);
    this.removeFrom(this.meshes, key);
    this.removeFrom(this.waterMeshes, key);
  }

  private removeFrom(map: Map<string, THREE.Mesh>, key: string): void {
    const existing = map.get(key);
    if (!existing) return;
    this.scene.remove(existing);
    existing.geometry.dispose(); // never skip: frees the vertex/index buffers on the GPU
    map.delete(key);
    this.disposed++;
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
    for (const key of [...new Set([...this.meshes.keys(), ...this.waterMeshes.keys()])]) this.remove(key);
    this.facesPerChunk.clear();
    this.waterFacesPerChunk.clear();
    this.totalFaces = 0;
    this.totalWaterFaces = 0;
  }
}
