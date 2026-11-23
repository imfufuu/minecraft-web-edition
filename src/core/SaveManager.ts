import type { World } from '../world/World';
import type { SavedPlayer, WorldStorage } from '../world/WorldStorage';

const AUTOSAVE_INTERVAL_MS = 5000;
const EDIT_DEBOUNCE_MS = 1500;

/**
 * Drives periodic / debounced persistence of the world diff and player state.
 * Call `update(now)` once per frame; call `flush()` for an explicit save.
 */
export class SaveManager {
  lastSavedAt = 0;
  lastSaveMs = 0;
  savedChunks = 0;
  private lastEditAt = 0;
  private lastEditCount = 0;
  private saving: Promise<void> | null = null;
  private readonly storage: WorldStorage;
  private readonly world: World;
  private readonly seed: string;
  private readonly snapshotPlayer: () => SavedPlayer;

  constructor(storage: WorldStorage, world: World, seed: string, snapshotPlayer: () => SavedPlayer) {
    this.storage = storage;
    this.world = world;
    this.seed = seed;
    this.snapshotPlayer = snapshotPlayer;
    const onHide = (): void => {
      if (document.visibilityState === 'hidden') void this.flush();
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', () => void this.flush());
  }

  update(nowMs: number): void {
    if (!this.storage.available) return;
    const edits = this.world.unsavedDiffs.size;
    if (edits !== this.lastEditCount) {
      this.lastEditCount = edits;
      this.lastEditAt = nowMs;
    }
    const debounced = edits > 0 && nowMs - this.lastEditAt >= EDIT_DEBOUNCE_MS;
    const periodic = nowMs - this.lastSavedAt >= AUTOSAVE_INTERVAL_MS;
    if (debounced || periodic) void this.flush();
  }

  /** Persist meta + all unsaved chunk diffs. Concurrent calls coalesce. */
  flush(): Promise<void> {
    if (this.saving) return this.saving;
    this.saving = this.doSave().finally(() => {
      this.saving = null;
    });
    return this.saving;
  }

  private async doSave(): Promise<void> {
    const t0 = performance.now();
    const keys = [...this.world.unsavedDiffs];
    const diffs: [string, Map<number, number>][] = [];
    for (const k of keys) {
      const d = this.world.modifiedBlocks.get(k);
      if (d) diffs.push([k, d]);
    }
    try {
      if (diffs.length > 0) await this.storage.saveDiffs(diffs);
      await this.storage.saveMeta({ seed: this.seed, player: this.snapshotPlayer(), savedAt: Date.now() });
      for (const k of keys) this.world.unsavedDiffs.delete(k);
      this.savedChunks = this.world.modifiedBlocks.size;
      this.lastSavedAt = performance.now();
      this.lastSaveMs = this.lastSavedAt - t0;
      this.lastEditCount = this.world.unsavedDiffs.size;
    } catch (err) {
      console.error('Save failed', err);
    }
  }
}
