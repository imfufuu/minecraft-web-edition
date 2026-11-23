import type { MesherOptions } from '../mesh/ChunkMesher';

/** A sparse diff serialised for structured cloning. */
export interface DiffPayload {
  cx: number;
  cz: number;
  indices: Uint16Array;
  ids: Uint8Array;
}

export interface ConfigureMessage {
  type: 'configure';
  seed: string;
  options: MesherOptions;
}

export interface BuildRequest {
  type: 'build';
  /** Monotonic request id so stale results can be dropped. */
  id: number;
  cx: number;
  cz: number;
  /** Diffs of this chunk and any neighbours that intersect the padded ring. */
  diffs: DiffPayload[];
}

export type WorkerInbound = ConfigureMessage | BuildRequest;

export interface BuildResult {
  type: 'built';
  id: number;
  cx: number;
  cz: number;
  /** Inner 16×H×16 chunk data (chunk layout). */
  data: Uint8Array;
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  colors: Float32Array;
  indices: Uint32Array;
  vertexCount: number;
  faceCount: number;
  /** Wall-clock milliseconds spent in generation + meshing inside the worker. */
  workMs: number;
}

export type WorkerOutbound = BuildResult;

/** Buffers in a BuildResult that must be transferred (not copied) back to the main thread. */
export function transferablesOf(r: BuildResult): ArrayBuffer[] {
  return [r.data.buffer, r.positions.buffer, r.normals.buffer, r.uvs.buffer, r.colors.buffer, r.indices.buffer] as ArrayBuffer[];
}
