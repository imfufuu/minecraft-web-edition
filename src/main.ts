import * as THREE from 'three';
import { Renderer } from './core/Renderer';
import { Loop } from './core/Loop';
import { InputManager } from './core/InputManager';
import { FirstPersonCamera } from './core/FirstPersonCamera';
import { DebugOverlay } from './ui/DebugOverlay';
import { PauseOverlay } from './ui/PauseOverlay';
import { World } from './world/World';
import { TerrainGenerator } from './world/TerrainGenerator';
import { ChunkMeshManager } from './mesh/ChunkMeshManager';
import { worldToChunkCoords } from './utils/math';
import { Player } from './player/Player';
import { BlockInteraction } from './player/BlockInteraction';
import { installGlobalErrorHandlers, showError } from './ui/ErrorBar';
import { TouchControls } from './ui/TouchControls';
import { Hotbar } from './ui/Hotbar';
import { TextureAtlas } from './mesh/TextureAtlas';
import { WorldStorage, type WorldMeta } from './world/WorldStorage';
import { SaveManager } from './core/SaveManager';
import { DayNight, parseDayParam } from './core/DayNight';
import { BlockId } from './blocks/BlockTypes';
import { CHUNK_HEIGHT } from './world/Chunk';
import { ChunkLoader, DEFAULT_RENDER_DISTANCE } from './world/ChunkLoader';
import { hashSeed } from './utils/prng';

const SKY_COLOR = 0x87ceeb;
const DEFAULT_SEED = 'minecraft-web';

function urlSeed(): string | null {
  const param = new URLSearchParams(window.location.search).get('seed');
  return param && param.length > 0 ? param : null;
}

/** Seed priority: URL ?seed= > saved world > default. */
function resolveSeed(saved: WorldMeta | null): string {
  return urlSeed() ?? saved?.seed ?? DEFAULT_SEED;
}

/** Deterministic-but-fresh seed for "new world" (time-based, hashed to a short token). */
function freshSeed(): string {
  return hashSeed(`${Date.now()}-${performance.now()}`).toString(36);
}

/** Handle exposed on `window.__mwe` for debugging / automated tests. */
export interface GameHandle {
  input: InputManager;
  camera: FirstPersonCamera;
  player: Player;
  interaction: BlockInteraction;
  world: World;
  hotbar: Hotbar;
  save: SaveManager;
  loader: ChunkLoader;
  meshes: ChunkMeshManager;
  dayNight: DayNight;
  storage: WorldStorage;
  seed: string;
  restored: boolean;
  loop: Loop;
  frames: () => number;
}

declare global {
  interface Window {
    __mwe?: GameHandle;
  }
}

export async function bootstrap(): Promise<GameHandle> {
  const container = document.getElementById('app');
  if (!container) throw new Error('#app container not found');

  const gfx = new Renderer(container);
  const { scene, camera } = gfx;

  // --- Sky, fog, light ---
  const dayParam = parseDayParam(new URLSearchParams(window.location.search).get('day'));
  const dayNight = dayParam === null ? new DayNight() : new DayNight(dayParam, true);
  const skyColor = new THREE.Color(SKY_COLOR).copy(dayNight.skyColor);
  scene.background = skyColor;
  const fog = new THREE.Fog(skyColor.getHex(), 60, 160);
  scene.fog = fog;

  // --- Persistence: open DB, read meta, decide seed ---
  const storage = new WorldStorage();
  await storage.open();
  const savedMeta = await storage.loadMeta();
  const seed = resolveSeed(savedMeta);
  const restoring = savedMeta !== null && savedMeta.seed === seed;

  // --- World: seeded terrain, 5×5 chunks (+ saved diffs) ---
  const world = new World(new TerrainGenerator(seed));
  if (restoring) {
    for (const [key, diff] of await storage.loadAllDiffs()) world.applyDiff(key, diff);
  } else if (savedMeta !== null) {
    await storage.clearAll(); // different seed requested: the old save no longer applies
  }
  const rdParam = Number(new URLSearchParams(window.location.search).get('rd'));
  const renderDistance = Number.isFinite(rdParam) && rdParam >= 2 ? Math.min(12, Math.floor(rdParam)) : DEFAULT_RENDER_DISTANCE;

  // --- One merged mesh per chunk (cross-chunk culling + frustum culling) ---
  const atlas = new TextureAtlas();
  // Lighting is fully baked into vertex colours (directional shade × AO): unlit material, zero per-frame GPU lighting cost.
  const chunkMaterial = new THREE.MeshBasicMaterial({ map: atlas.texture, vertexColors: true });
  // Water: same atlas, translucent, no depth write (so overlapping sheets don't z-fight), visible from below too.
  const waterMaterial = new THREE.MeshBasicMaterial({
    map: atlas.texture,
    vertexColors: true,
    transparent: true,
    opacity: 0.62,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  // Day/night: a single uniform scales the baked vertex lighting — no chunk is ever rebuilt for time of day.
  dayNight.attach(chunkMaterial);
  dayNight.attach(waterMaterial);
  const meshes = new ChunkMeshManager(scene, world, chunkMaterial, waterMaterial);
  // Streaming loader: spiral queue around the player, worker pool, ≤2 uploads/frame, unload beyond rd+2.
  const loader = new ChunkLoader(world, meshes, seed, meshes.mesher.options, renderDistance);

  // --- Input, camera & player: spawn on the surface at the origin column ---
  const input = new InputManager(gfx.renderer.domElement);
  const fps = new FirstPersonCamera(camera, input);
  const player = new Player(input, world);
  player.groundReady = (x, z) => {
    const c = worldToChunkCoords(x, 0, z);
    return world.hasChunk(c.cx, c.cz);
  };
  player.setSpawn(0.5, world.generator.heightAt(0, 0) + 1, 0.5);
  fps.setLook(Math.PI * 0.75, -0.15);
  if (restoring && savedMeta) {
    const p = savedMeta.player;
    player.position.set(p.x, p.y, p.z);
    player.mode = p.mode;
    fps.setLook(p.yaw, p.pitch);
  }
  // The chunk under the player's feet is built synchronously so physics has ground on frame 1.
  const t0 = performance.now();
  const spawnChunk = worldToChunkCoords(player.position.x, player.position.y, player.position.z);
  loader.loadNow(spawnChunk.cx, spawnChunk.cz);
  const spawnMs = performance.now() - t0;
  if (!(restoring && savedMeta)) {
    // Fresh spawn: climb above anything (e.g. a tree trunk) occupying the origin column.
    let y = Math.floor(player.position.y);
    while (y < CHUNK_HEIGHT - 2 && (world.getBlock(0, y, 0) !== BlockId.AIR || world.getBlock(0, y + 1, 0) !== BlockId.AIR)) y++;
    player.setSpawn(0.5, y, 0.5);
  }
  const eye = new THREE.Vector3();
  const interaction = new BlockInteraction(world, player, camera, input, scene);

  // Crosshair
  const crosshair = document.createElement('div');
  crosshair.className = 'crosshair';
  document.body.appendChild(crosshair);

  // --- UI ---
  const pause = new PauseOverlay(() => input.requestLock());
  const touch = typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0;
  pause.setDiagnostics(
    `build ${__BUILD_ID__} · ${gfx.contextKind} · pointer-lock ${InputManager.pointerLockSupported ? 'yes' : 'no'} · touch ${touch ? 'yes' : 'no'}`,
  );
  const modeBadge = document.createElement('div');
  modeBadge.className = 'mode-badge hidden';
  modeBadge.textContent = '拖拽环顾 · ☰ 菜单';
  document.body.appendChild(modeBadge);
  input.onModeChanged((mode) => {
    pause.setVisible(mode === 'none');
    modeBadge.classList.toggle('hidden', mode !== 'fallback');
    if (mode === 'fallback') {
      pause.setStatus('当前环境不允许锁定鼠标（如嵌入式预览 iframe），已切换为"按住鼠标拖拽环顾"模式。');
    }
  });
  const debug = new DebugOverlay();
  const touchControls = new TouchControls(input, () => debug.toggle());
  const hotbar = new Hotbar(input, atlas);
  hotbar.onSelect((id) => {
    interaction.selectedBlock = id;
  });
  if (restoring && savedMeta) hotbar.select(Math.max(0, Math.min(8, savedMeta.player.hotbarIndex | 0)));

  // --- Save manager ---
  const save = new SaveManager(storage, world, seed, () => ({
    x: player.position.x,
    y: player.position.y,
    z: player.position.z,
    yaw: fps.yaw,
    pitch: fps.pitch,
    mode: player.mode,
    hotbarIndex: hotbar.selectedIndex,
  }));
  pause.bindActions({
    onSave: () => {
      void save.flush().then(() => pause.setSaveInfo(`已保存 ${new Date().toLocaleTimeString()}`));
    },
    onNewWorld: () => {
      void (async () => {
        await storage.clearAll();
        await storage.saveMeta({
          seed: freshSeed(),
          player: { x: 0.5, y: 0, z: 0.5, yaw: 0, pitch: 0, mode: 'survival', hotbarIndex: 0 },
          savedAt: Date.now(),
        });
        // Drop any ?seed= so the fresh seed from storage wins.
        window.location.href = window.location.pathname;
      })();
    },
  });
  pause.setSaveInfo(storage.available ? (restoring ? `已读取存档 (${world.modifiedBlocks.size} 个区块有修改)` : '新世界') : '此浏览器不支持 IndexedDB，无法存档');
  pause.bindSettings({
    sensitivity: input.settings.lookSensitivity,
    touchControls: input.touchControlsEnabled,
    onSensitivity: (v) => {
      input.settings.lookSensitivity = v;
      input.saveSettings();
    },
    onTouchControls: (v) => {
      input.settings.touchControls = v;
      input.saveSettings();
    },
  });
  input.onModeChanged((mode) => touchControls.setVisible(mode !== 'none' && input.touchControlsEnabled));
  debug.addLine(() => `Yaw: ${THREE.MathUtils.radToDeg(fps.yaw).toFixed(1)}°  Pitch: ${THREE.MathUtils.radToDeg(fps.pitch).toFixed(1)}°  Input: ${input.captureMode}`);
  debug.addLine(() => `Seed: ${seed}  Chunks: ${world.chunks.size}  Meshes: ${meshes.meshes.size}+${meshes.waterMeshes.size} water  Faces: ${meshes.totalFaces}+${meshes.totalWaterFaces}`);
  debug.addLine(() => {
    const st = loader.stats;
    return `Loader: ${st.mode}×${st.workers}  rd=${loader.renderDistance}  queued: ${st.queued}  inFlight: ${st.inFlight}  ready: ${st.ready}  uploads/frame: ${st.uploadedThisFrame}`;
  });
  debug.addLine(() => {
    const st = loader.stats;
    return `Chunk work: ${st.avgWorkMs.toFixed(2)} ms avg  upload: ${st.lastUploadMs.toFixed(2)} ms  unloaded: ${st.unloadedTotal}  disposed: ${meshes.disposed}  spawn: ${spawnMs.toFixed(1)} ms`;
  });
  debug.addLine(() => {
    const h = interaction.hit;
    return h
      ? `Target: ${h.x}, ${h.y}, ${h.z}  face: ${h.nx}, ${h.ny}, ${h.nz}  dist: ${h.distance.toFixed(2)}  id: ${world.getBlock(h.x, h.y, h.z)}`
      : 'Target: none';
  });
  debug.addLine(() => `Hand: ${interaction.selectedBlock} (${hotbar.selectedIndex + 1})  Textures: ${gfx.info.memory.textures}`);
  debug.addLine(() => `AO: ${meshes.mesher.options.ao ? 'on' : 'off'} [F4]  Shading: ${meshes.mesher.options.shading ? 'on' : 'off'} [F6]  Time: ${dayNight.clock}  daylight: ${dayNight.daylight.toFixed(2)}${dayNight.fixed ? ' (fixed)' : dayNight.paused ? ' (paused)' : ''}`);
  debug.addLine(() => {
    if (!storage.available) return 'Save: unavailable';
    const ago = save.lastSavedAt > 0 ? `${((performance.now() - save.lastSavedAt) / 1000).toFixed(0)}s ago` : 'never';
    return `Save: ${ago} (${save.lastSaveMs.toFixed(1)} ms)  modified chunks: ${world.modifiedBlocks.size}  unsaved: ${world.unsavedDiffs.size}`;
  });
  input.onKeyPress((code) => {
    if (code === 'F4') {
      meshes.mesher.options.ao = !meshes.mesher.options.ao;
      loader.setOptions(meshes.mesher.options);
      meshes.rebuildAll();
    } else if (code === 'F6') {
      meshes.mesher.options.shading = !meshes.mesher.options.shading;
      loader.setOptions(meshes.mesher.options);
      meshes.rebuildAll();
    }
  });
  debug.addLine(() => {
    const p = player.position;
    const v = player.velocity;
    return `Mode: ${player.mode} [F]  onGround: ${player.onGround}${player.inWater ? '  inWater' : ''}  Vel: ${v.x.toFixed(2)}, ${v.y.toFixed(2)}, ${v.z.toFixed(2)}  Feet: ${p.y.toFixed(4)}`;
  });

  // --- Main loop ---
  const loop = new Loop();
  loop.onUpdate((dt) => {
    debug.beginFrame();
    dayNight.paused = !input.active; // menu open → time stands still
    dayNight.update(dt);
    skyColor.copy(dayNight.skyColor);
    fog.color.copy(dayNight.skyColor);
    fps.update();
    player.update(dt, fps.yaw);
    fps.setEyePosition(player.getEyePosition(eye));
    camera.updateMatrixWorld();
    interaction.update(performance.now());
    touchControls.setFlyMode(player.mode === 'fly');
    hotbar.update();
    save.update(performance.now());
    const pc = worldToChunkCoords(player.position.x, player.position.y, player.position.z);
    loader.update(pc.cx, pc.cz);
    meshes.rebuildDirty();
  });
  loop.onRender(() => {
    gfx.render();
    const p = player.position;
    const c = worldToChunkCoords(p.x, p.y, p.z);
    debug.endFrame(gfx.info, { x: p.x, y: p.y, z: p.z }, { cx: c.cx, cz: c.cz });
  });
  let frameCount = 0;
  loop.onUpdate(() => {
    frameCount++;
  });
  loop.start();

  return { input, camera: fps, player, interaction, world, hotbar, save, loader, meshes, dayNight, storage, seed, restored: restoring, loop, frames: () => frameCount };
}

if (!import.meta.env.SSR) {
  installGlobalErrorHandlers();
  bootstrap()
    .then((game) => {
      window.__mwe = game;
    })
    .catch((err: unknown) => {
      showError(err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err));
    });
}
