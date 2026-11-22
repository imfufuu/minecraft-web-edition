import * as THREE from 'three';
import { Renderer } from './core/Renderer';
import { Loop } from './core/Loop';
import { InputManager } from './core/InputManager';
import { FirstPersonCamera } from './core/FirstPersonCamera';
import { DebugOverlay } from './ui/DebugOverlay';
import { PauseOverlay } from './ui/PauseOverlay';
import { CHUNK_SIZE, type Chunk } from './world/Chunk';
import { World } from './world/World';
import { TerrainGenerator } from './world/TerrainGenerator';
import { ChunkMesher } from './mesh/ChunkMesher';
import { worldToChunkCoords } from './utils/math';

const SKY_COLOR = 0x87ceeb;
const DEFAULT_SEED = 'minecraft-web';
const WORLD_RADIUS = 2; // [-2, 2] -> 5×5 chunks

function resolveSeed(): string {
  const param = new URLSearchParams(window.location.search).get('seed');
  return param && param.length > 0 ? param : DEFAULT_SEED;
}

function bootstrap(): void {
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

  // --- One merged mesh per chunk ---
  const mesher = new ChunkMesher();
  const chunkMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
  const chunkMeshes = new Map<string, THREE.Mesh>();
  let totalFaces = 0;

  const t1 = performance.now();
  for (const chunk of world.chunks.values()) buildChunkMesh(chunk);
  const meshMs = performance.now() - t1;

  function buildChunkMesh(chunk: Chunk): void {
    const buffers = mesher.build(chunk);
    totalFaces += buffers.faceCount;
    chunk.dirty = false;
    if (buffers.vertexCount === 0) return;
    const geometry = ChunkMesher.toGeometry(buffers);
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, chunkMaterial);
    mesh.position.set(chunk.cx * CHUNK_SIZE, 0, chunk.cz * CHUNK_SIZE);
    scene.add(mesh);
    chunkMeshes.set(chunk.key, mesh);
  }

  // --- Input & camera: spawn above the origin column ---
  const input = new InputManager(gfx.renderer.domElement);
  const fps = new FirstPersonCamera(camera, input);
  const spawnY = world.generator.heightAt(0, 0) + 12;
  camera.position.set(0.5, spawnY, 0.5);
  fps.setLook(Math.PI * 0.75, -0.35);

  // --- UI ---
  const pause = new PauseOverlay(() => input.requestLock());
  input.onLockChanged((locked) => pause.setVisible(!locked));
  const debug = new DebugOverlay();
  debug.addLine(() => `Yaw: ${THREE.MathUtils.radToDeg(fps.yaw).toFixed(1)}°  Pitch: ${THREE.MathUtils.radToDeg(fps.pitch).toFixed(1)}°`);
  debug.addLine(() => `Seed: ${seed}  Chunks: ${world.chunks.size}  Faces: ${totalFaces}`);
  debug.addLine(() => `Gen: ${genMs.toFixed(1)} ms  Mesh: ${meshMs.toFixed(1)} ms`);
  debug.addLine(() => {
    const p = camera.position;
    return `Block under: ${world.getBlock(p.x, p.y - 1, p.z)}  Surface h: ${world.generator.heightAt(Math.floor(p.x), Math.floor(p.z))}`;
  });

  // --- Main loop ---
  const loop = new Loop();
  loop.onUpdate((dt) => {
    debug.beginFrame();
    fps.update(dt);
  });
  loop.onRender(() => {
    gfx.render();
    const p = camera.position;
    const c = worldToChunkCoords(p.x, p.y, p.z);
    debug.endFrame(gfx.info, { x: p.x, y: p.y, z: p.z }, { cx: c.cx, cz: c.cz });
  });
  loop.start();
}

bootstrap();
