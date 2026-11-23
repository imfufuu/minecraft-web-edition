import { ChunkMesher, type MesherOptions } from '../mesh/ChunkMesher';
import { applyDiffToPadded, generatePaddedChunk, PADDED_VOLUME, PaddedBlockSource } from '../world/PaddedChunk';
import { TerrainGenerator } from '../world/TerrainGenerator';
import type { BuildRequest, BuildResult } from './protocol';

/**
 * Pure generation + meshing pipeline shared by the Web Worker and the synchronous
 * fallback (environments without `Worker`, e.g. tests). Holds no DOM / three.js state.
 */
export class ChunkBuilder {
  private generator: TerrainGenerator;
  private seed: string;
  private readonly mesher: ChunkMesher;
  private readonly padded = new Uint8Array(PADDED_VOLUME);

  constructor(seed: string, options: Partial<MesherOptions> = {}) {
    this.seed = seed;
    this.generator = new TerrainGenerator(seed);
    this.mesher = new ChunkMesher(options);
  }

  configure(seed: string, options: MesherOptions): void {
    if (seed !== this.seed) {
      this.seed = seed;
      this.generator = new TerrainGenerator(seed);
    }
    this.mesher.options.ao = options.ao;
    this.mesher.options.shading = options.shading;
  }

  build(req: BuildRequest): BuildResult {
    const t0 = performance.now();
    const { cx, cz } = req;
    generatePaddedChunk(this.generator, cx, cz, this.padded);
    for (const d of req.diffs) applyDiffToPadded(this.padded, cx, cz, d.cx, d.cz, d.indices, d.ids);
    const source = new PaddedBlockSource(this.padded, cx, cz);
    const chunk = source.toChunk(cx, cz);
    const m = this.mesher.build(chunk, source);
    return {
      type: 'built',
      id: req.id,
      cx,
      cz,
      data: chunk.data,
      positions: m.positions,
      normals: m.normals,
      uvs: m.uvs,
      colors: m.colors,
      indices: m.indices,
      vertexCount: m.vertexCount,
      faceCount: m.faceCount,
      water: m.water,
      workMs: performance.now() - t0,
    };
  }
}
