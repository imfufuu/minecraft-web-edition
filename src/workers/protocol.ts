import type { GeometryBuffers, MesherOptions } from '../mesh/ChunkMesher';

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

export interface BuildResult extends GeometryBuffers {
  type: 'built';
  id: number;
  cx: number;
  cz: number;
  /** Inner 16×H×16 chunk data (chunk layout). */
  data: Uint8Array;
  /** Translucent water geometry (may be empty). */
  water: GeometryBuffers;
  /** Wall-clock milliseconds spent in generation + meshing inside the worker. */
  workMs: number;
}

export type WorkerOutbound = BuildResult;

/** Buffers in a BuildResult that must be transferred (not copied) back to the main thread. */
export function transferablesOf(r: BuildResult): ArrayBuffer[] {
  const g = (b: GeometryBuffers): ArrayBuffer[] => [b.positions.buffer, b.normals.buffer, b.uvs.buffer, b.colors.buffer, b.indices.buffer] as ArrayBuffer[];
  return [r.data.buffer as ArrayBuffer, ...g(r), ...g(r.water)];
}
