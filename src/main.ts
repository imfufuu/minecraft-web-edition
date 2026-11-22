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
import { installGlobalErrorHandlers, showError } from './ui/ErrorBar';

const SKY_COLOR = 0x87ceeb;
const DEFAULT_SEED = 'minecraft-web';
const WORLD_RADIUS = 2; // [-2, 2] -> 5×5 chunks

function resolveSeed(): string {
  const param = new URLSearchParams(window.location.search).get('seed');
  return param && param.length > 0 ? param : DEFAULT_SEED;
}

/** Handle exposed on `window.__mwe` for debugging / automated tests. */
export interface GameHandle {
  input: InputManager;
  camera: FirstPersonCamera;
  player: Player;
  loop: Loop;
  frames: () => number;
}

declare global {
  interface Window {
    __mwe?: GameHandle;
  }
}

export function bootstrap(): GameHandle {
  const container = document.getElementById('app');
  if (!container) throw new Error('#app container not found');

  const gfx = new Renderer(container);
  const { scene, camera } = gfx;

  // --- Sky, fog, light ---
  scene.background = new THREE.Color(SKY_COLOR);
  scene.fog = new THREE.Fog(SKY_COLOR, 60, 160);
  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(0.5, 1, 0.3);
  scene.add(sun);

  // --- World: seeded terrain, 5×5 chunks ---
  const seed = resolveSeed();
  const world = new World(new TerrainGenerator(seed));
  const t0 = performance.now();
  world.generateArea(-WORLD_RADIUS, WORLD_RADIUS);
  const genMs = performance.now() - t0;

  // --- One merged mesh per chunk (cross-chunk culling + frustum culling) ---
  const chunkMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
  const meshes = new ChunkMeshManager(scene, world, chunkMaterial);
  const t1 = performance.now();
  meshes.rebuildAll();
  const meshMs = performance.now() - t1;

  // --- Input, camera & player: spawn on the surface at the origin column ---
  const input = new InputManager(gfx.renderer.domElement);
  const fps = new FirstPersonCamera(camera, input);
  const player = new Player(input, world);
  player.setSpawn(0.5, world.generator.heightAt(0, 0) + 1, 0.5);
  fps.setLook(Math.PI * 0.75, -0.15);
  const eye = new THREE.Vector3();

  // --- UI ---
  const pause = new PauseOverlay(() => input.requestLock());
  const touch = typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0;
  pause.setDiagnostics(
    `build ${__BUILD_ID__} · ${gfx.contextKind} · pointer-lock ${InputManager.pointerLockSupported ? 'yes' : 'no'} · touch ${touch ? 'yes' : 'no'}`,
  );
  const modeBadge = document.createElement('div');
  modeBadge.className = 'mode-badge hidden';
  modeBadge.textContent = '拖拽环顾模式 · ESC 返回菜单 / Drag to look · ESC for menu';
  document.body.appendChild(modeBadge);
  input.onModeChanged((mode) => {
    pause.setVisible(mode === 'none');
    modeBadge.classList.toggle('hidden', mode !== 'fallback');
    if (mode === 'fallback') {
      pause.setStatus('当前环境不允许锁定鼠标（如嵌入式预览 iframe），已切换为"按住鼠标拖拽环顾"模式。');
    }
  });
  const debug = new DebugOverlay();
  debug.addLine(() => `Yaw: ${THREE.MathUtils.radToDeg(fps.yaw).toFixed(1)}°  Pitch: ${THREE.MathUtils.radToDeg(fps.pitch).toFixed(1)}°  Input: ${input.captureMode}`);
  debug.addLine(() => `Seed: ${seed}  Chunks: ${world.chunks.size}  Meshes: ${meshes.meshes.size}  Faces: ${meshes.totalFaces}`);
  debug.addLine(() => `Gen: ${genMs.toFixed(1)} ms  Mesh: ${meshMs.toFixed(1)} ms`);
  debug.addLine(() => {
    const p = player.position;
    const v = player.velocity;
    return `Mode: ${player.mode} [F]  onGround: ${player.onGround}  Vel: ${v.x.toFixed(2)}, ${v.y.toFixed(2)}, ${v.z.toFixed(2)}  Feet: ${p.y.toFixed(4)}`;
  });

  // --- Main loop ---
  const loop = new Loop();
  loop.onUpdate((dt) => {
    debug.beginFrame();
    fps.update();
    player.update(dt, fps.yaw);
    fps.setEyePosition(player.getEyePosition(eye));
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

  return { input, camera: fps, player, loop, frames: () => frameCount };
}

if (!import.meta.env.SSR) {
  installGlobalErrorHandlers();
  try {
    window.__mwe = bootstrap();
  } catch (err) {
    showError(err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err));
  }
}
