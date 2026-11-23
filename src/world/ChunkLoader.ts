import type { ChunkMeshManager } from '../mesh/ChunkMeshManager';
import type { MesherOptions } from '../mesh/ChunkMesher';
import { ChunkBuilder } from '../workers/chunkBuilder';
import type { BuildRequest, BuildResult, DiffPayload } from '../workers/protocol';
import { Chunk } from './Chunk';
import type { ChunkDiff, World } from './World';

export const DEFAULT_RENDER_DISTANCE = 7;
/** Chunks farther than RENDER_DISTANCE + UNLOAD_MARGIN (Chebyshev) are unloaded. */
export const UNLOAD_MARGIN = 2;
/** Max worker results turned into GPU geometry per frame (upload budget). */
export const MAX_UPLOADS_PER_FRAME = 2;
/** Max synchronous builds per frame when no Worker is available. */
const MAX_SYNC_BUILDS_PER_FRAME = 1;

export interface LoaderStats {
  mode: 'worker' | 'sync';
  workers: number;
  loaded: number;
  queued: number;
  inFlight: number;
  ready: number;
  uploadedThisFrame: number;
  unloadedTotal: number;
  /** Rolling average worker time (gen + mesh) per chunk in ms. */
  avgWorkMs: number;
  lastUploadMs: number;
}

interface PendingJob {
  id: number;
  key: string;
  editVersion: number;
}

/**
 * Streams chunks around the player.
 *
 *  - Wanted set = disc of radius RENDER_DISTANCE around the player's chunk, visited in
 *    spiral (nearest-first) order so the ground under the player appears first.
 *  - Generation + meshing run in a pool of Web Workers (padded 18×H×18 volumes, results
 *    posted back with Transferable buffers). Without `Worker` the same ChunkBuilder runs
 *    inline with a per-frame budget.
 *  - The main thread only turns finished buffers into BufferGeometry, at most
 *    MAX_UPLOADS_PER_FRAME per frame, and unloads (dispose + delete) chunks that fall
 *    outside RENDER_DISTANCE + UNLOAD_MARGIN. Player edits survive unloading because they
 *    live in `world.modifiedBlocks` and are re-applied by the builder.
 */
export class ChunkLoader {
  readonly renderDistance: number;
  readonly unloadDistance: number;
  readonly stats: LoaderStats;

  private readonly world: World;
  private readonly meshes: ChunkMeshManager;
  private readonly seed: string;
  private readonly options: MesherOptions;
  private readonly offsets: ReadonlyArray<readonly [number, number]>;

  private centerCx = Number.NaN;
  private centerCz = Number.NaN;
  private queue: string[] = []; // keys, nearest first
  private readonly queued = new Set<string>();
  private readonly inFlight = new Map<number, PendingJob>();
  private readonly ready: BuildResult[] = [];
  private nextId = 1;

  private readonly workers: Worker[] = [];
  private readonly idle: Worker[] = [];
  private syncBuilder: ChunkBuilder | null = null;
  private workSamples = 0;
  private workTotal = 0;

  constructor(world: World, meshes: ChunkMeshManager, seed: string, options: MesherOptions, renderDistance = DEFAULT_RENDER_DISTANCE, workerCount?: number) {
    this.world = world;
    this.meshes = meshes;
    this.seed = seed;
    this.options = options;
    this.renderDistance = renderDistance;
    this.unloadDistance = renderDistance + UNLOAD_MARGIN;
    this.offsets = ChunkLoader.spiralOffsets(renderDistance);

    const canWorker = typeof Worker !== 'undefined' && workerCount !== 0;
    if (canWorker) {
      const hc = typeof navigator !== 'undefined' && navigator.hardwareConcurrency ? navigator.hardwareConcurrency : 4;
      const n = workerCount ?? Math.max(1, Math.min(4, hc - 1));
      for (let i = 0; i < n; i++) {
        try {
          const w = new Worker(new URL('../workers/chunk.worker.ts', import.meta.url), { type: 'module', name: `chunk-${i}` });
          w.onmessage = (ev: MessageEvent<BuildResult>) => this.onResult(w, ev.data);
          w.onerror = (ev) => this.onWorkerError(w, ev);
          w.postMessage({ type: 'configure', seed, options: { ...options } });
          this.workers.push(w);
          this.idle.push(w);
        } catch (err) {
          console.warn('ChunkLoader: worker creation failed, falling back to sync', err);
          break;
        }
      }
    }
    if (this.workers.length === 0) this.syncBuilder = new ChunkBuilder(seed, options);

    this.stats = {
      mode: this.workers.length > 0 ? 'worker' : 'sync',
      workers: this.workers.length,
      loaded: 0,
      queued: 0,
      inFlight: 0,
      ready: 0,
      uploadedThisFrame: 0,
      unloadedTotal: 0,
      avgWorkMs: 0,
      lastUploadMs: 0,
    };
  }

  /** Offsets within a disc of radius r, sorted nearest-first (ties broken by angle → spiral). */
  static spiralOffsets(r: number): ReadonlyArray<readonly [number, number]> {
    const list: Array<readonly [number, number]> = [];
    const r2 = (r + 0.5) * (r + 0.5);
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dz * dz <= r2) list.push([dx, dz]);
    list.sort((a, b) => {
      const da = a[0] * a[0] + a[1] * a[1];
      const db = b[0] * b[0] + b[1] * b[1];
      return da !== db ? da - db : Math.atan2(a[1], a[0]) - Math.atan2(b[1], b[0]);
    });
    return list;
  }

  /** Push new mesher options to the workers (newly built chunks will use them). */
  setOptions(options: MesherOptions): void {
    this.options.ao = options.ao;
    this.options.shading = options.shading;
    for (const w of this.workers) w.postMessage({ type: 'configure', seed: this.seed, options: { ...this.options } });
    this.syncBuilder?.configure(this.seed, this.options);
  }

  /** Synchronously generate + mesh one chunk on the main thread (used for the spawn chunk). */
  loadNow(cx: number, cz: number): Chunk {
    const existing = this.world.getChunk(cx, cz);
    if (existing) return existing;
    const builder = this.syncBuilder ?? new ChunkBuilder(this.seed, this.options);
    const result = builder.build(this.makeRequest(cx, cz));
    return this.installResult(result) ?? (this.world.getChunk(cx, cz) as Chunk);
  }

  /** Per-frame driver. `cx, cz` = the chunk the player currently stands in. */
  update(cx: number, cz: number): void {
    this.stats.uploadedThisFrame = 0;
    if (cx !== this.centerCx || cz !== this.centerCz) {
      this.centerCx = cx;
      this.centerCz = cz;
      this.recenter();
    }
    this.dispatch();
    this.upload();
    this.stats.loaded = this.world.chunks.size;
    this.stats.queued = this.queue.length;
    this.stats.inFlight = this.inFlight.size;
    this.stats.ready = this.ready.length;
  }

  private recenter(): void {
    const cx = this.centerCx;
    const cz = this.centerCz;
    // 1. Unload everything too far away (meshes disposed, chunk dropped, diff kept).
    for (const chunk of [...this.world.chunks.values()]) {
      if (Math.max(Math.abs(chunk.cx - cx), Math.abs(chunk.cz - cz)) > this.unloadDistance) {
        this.meshes.remove(chunk.key);
        this.world.chunks.delete(chunk.key);
        this.stats.unloadedTotal++;
      }
    }
    // 2. Rebuild the queue nearest-first from the wanted disc.
    this.queue = [];
    this.queued.clear();
    const pendingKeys = new Set<string>();
    for (const job of this.inFlight.values()) pendingKeys.add(job.key);
    for (const r of this.ready) pendingKeys.add(Chunk.keyOf(r.cx, r.cz));
    for (const [dx, dz] of this.offsets) {
      const key = Chunk.keyOf(cx + dx, cz + dz);
      if (this.world.chunks.has(key) || pendingKeys.has(key)) continue;
      this.queue.push(key);
      this.queued.add(key);
    }
  }

  private dispatch(): void {
    if (this.syncBuilder) {
      for (let n = 0; n < MAX_SYNC_BUILDS_PER_FRAME && this.queue.length > 0; n++) {
        const key = this.queue.shift() as string;
        this.queued.delete(key);
        const [cx, cz] = key.split(',').map(Number);
        const req = this.makeRequest(cx, cz);
        this.inFlight.set(req.id, { id: req.id, key, editVersion: this.world.editVersion });
        this.ready.push(this.syncBuilder.build(req));
      }
      return;
    }
    while (this.idle.length > 0 && this.queue.length > 0) {
      const key = this.queue.shift() as string;
      this.queued.delete(key);
      const [cx, cz] = key.split(',').map(Number);
      const w = this.idle.pop() as Worker;
      const req = this.makeRequest(cx, cz);
      this.inFlight.set(req.id, { id: req.id, key, editVersion: this.world.editVersion });
      // Diff arrays are small; copy (no transfer) so the main thread keeps its Map intact.
      w.postMessage(req);
    }
  }

  private upload(): void {
    const t0 = performance.now();
    let n = 0;
    while (n < MAX_UPLOADS_PER_FRAME && this.ready.length > 0) {
      const r = this.ready.shift() as BuildResult;
      if (this.installResult(r) !== null) n++;
    }
    if (n > 0) this.stats.lastUploadMs = performance.now() - t0;
    this.stats.uploadedThisFrame = n;
  }

  /** Turn a build result into a live chunk + mesh. Returns null if it was discarded. */
  private installResult(r: BuildResult): Chunk | null {
    const job = this.inFlight.get(r.id);
    this.inFlight.delete(r.id);
    const key = Chunk.keyOf(r.cx, r.cz);
    const far = Math.max(Math.abs(r.cx - this.centerCx), Math.abs(r.cz - this.centerCz)) > this.unloadDistance;
    if (this.world.chunks.has(key) || (job !== undefined && far)) return null; // superseded or no longer wanted
    const chunk = new Chunk(r.cx, r.cz, r.data);
    chunk.dirty = false;
    this.world.chunks.set(key, chunk);
    this.meshes.install(chunk, r);
    // Edits made while the job was in flight may have changed a neighbour's border → rebuild on main thread.
    if (job !== undefined && job.editVersion !== this.world.editVersion && this.world.neighbourHasDiff(r.cx, r.cz)) chunk.dirty = true;
    return chunk;
  }

  private makeRequest(cx: number, cz: number): BuildRequest {
    const diffs: DiffPayload[] = [];
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const d = this.world.modifiedBlocks.get(Chunk.keyOf(cx + dx, cz + dz));
        if (d && d.size > 0) diffs.push(ChunkLoader.serialiseDiff(cx + dx, cz + dz, d));
      }
    }
    return { type: 'build', id: this.nextId++, cx, cz, diffs };
  }

  static serialiseDiff(cx: number, cz: number, diff: ChunkDiff): DiffPayload {
    const indices = new Uint16Array(diff.size);
    const ids = new Uint8Array(diff.size);
    let i = 0;
    for (const [index, id] of diff) {
      indices[i] = index;
      ids[i] = id;
      i++;
    }
    return { cx, cz, indices, ids };
  }

  private onResult(w: Worker, r: BuildResult): void {
    this.idle.push(w);
    this.ready.push(r);
    this.workSamples++;
    this.workTotal += r.workMs;
    this.stats.avgWorkMs = this.workTotal / this.workSamples;
  }

  private onWorkerError(w: Worker, ev: ErrorEvent): void {
    console.error('chunk.worker error', ev.message);
    // Drop the broken worker; re-queue whatever it was building; fall back to sync if none remain.
    const i = this.workers.indexOf(w);
    if (i >= 0) this.workers.splice(i, 1);
    const j = this.idle.indexOf(w);
    if (j >= 0) this.idle.splice(j, 1);
    w.terminate();
    this.stats.workers = this.workers.length;
    if (this.workers.length === 0) {
      this.syncBuilder = new ChunkBuilder(this.seed, this.options);
      this.stats.mode = 'sync';
    }
    for (const job of this.inFlight.values()) if (!this.queued.has(job.key) && !this.world.chunks.has(job.key)) {
      this.queue.unshift(job.key);
      this.queued.add(job.key);
    }
    this.inFlight.clear();
  }

  dispose(): void {
    for (const w of this.workers) w.terminate();
    this.workers.length = 0;
    this.idle.length = 0;
    this.queue = [];
    this.queued.clear();
    this.inFlight.clear();
    this.ready.length = 0;
  }
}
