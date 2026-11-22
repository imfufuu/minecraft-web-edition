import * as THREE from 'three';
import { Renderer } from './core/Renderer';
import { Loop } from './core/Loop';
import { InputManager } from './core/InputManager';
import { FirstPersonCamera } from './core/FirstPersonCamera';
import { DebugOverlay } from './ui/DebugOverlay';
import { PauseOverlay } from './ui/PauseOverlay';
import { BlockId } from './blocks/BlockTypes';
import { Chunk, CHUNK_HEIGHT, CHUNK_SIZE } from './world/Chunk';
import { ChunkMesher } from './mesh/ChunkMesher';

const SKY_COLOR = 0x87ceeb;

/**
 * P2 placeholder terrain: deterministic sine-wave heightmap for a single chunk.
 * Replaced by seeded fBm noise in P3.
 */
function fillTestChunk(chunk: Chunk): void {
  for (let z = 0; z < CHUNK_SIZE; z++) {
    for (let x = 0; x < CHUNK_SIZE; x++) {
      const h = Math.floor(20 + Math.sin(x * 0.45) * 3 + Math.cos(z * 0.35) * 3 + Math.sin((x + z) * 0.2) * 2);
      for (let y = 0; y <= h && y < CHUNK_HEIGHT; y++) {
        let id: BlockId;
        if (y === 0) id = BlockId.BEDROCK;
        else if (y === h) id = BlockId.GRASS;
        else if (y >= h - 3) id = BlockId.DIRT;
        else id = BlockId.STONE;
        chunk.setBlock(x, y, z, id);
      }
    }
  }
}

function bootstrap(): void {
  const container = document.getElementById('app');
  if (!container) throw new Error('#app container not found');

  const gfx = new Renderer(container);
  const { scene, camera } = gfx;

  // --- Sky & fog ---
  scene.background = new THREE.Color(SKY_COLOR);
  scene.fog = new THREE.Fog(SKY_COLOR, 60, 160);

  // --- Lighting (needed for MeshLambertMaterial to show face direction) ---
  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(0.5, 1, 0.3);
  scene.add(sun);

  // --- Single chunk: data -> mesher -> 1 merged mesh ---
  const chunk = new Chunk(0, 0);
  fillTestChunk(chunk);

  const mesher = new ChunkMesher();
  const buffers = mesher.build(chunk);
  const geometry = ChunkMesher.toGeometry(buffers);
  geometry.computeBoundingSphere();
  chunk.dirty = false;

  const chunkMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
  const chunkMesh = new THREE.Mesh(geometry, chunkMaterial);
  chunkMesh.position.set(chunk.cx * CHUNK_SIZE, 0, chunk.cz * CHUNK_SIZE);
  scene.add(chunkMesh);

  // --- Input & camera ---
  const input = new InputManager(gfx.renderer.domElement);
  const fps = new FirstPersonCamera(camera, input);
  camera.position.set(8, 30, 30);
  fps.setLook(0, -0.35);

  // --- UI ---
  const pause = new PauseOverlay(() => input.requestLock());
  input.onLockChanged((locked) => pause.setVisible(!locked));
  const debug = new DebugOverlay();
  debug.addLine(() => `Yaw: ${THREE.MathUtils.radToDeg(fps.yaw).toFixed(1)}°  Pitch: ${THREE.MathUtils.radToDeg(fps.pitch).toFixed(1)}°`);
  debug.addLine(() => `Chunk mesh: ${buffers.faceCount} faces / ${buffers.vertexCount} verts`);

  // --- Main loop ---
  const loop = new Loop();
  loop.onUpdate((dt) => {
    debug.beginFrame();
    fps.update(dt);
  });
  loop.onRender(() => {
    gfx.render();
    const p = camera.position;
    debug.endFrame(
      gfx.info,
      { x: p.x, y: p.y, z: p.z },
      { cx: Math.floor(p.x / CHUNK_SIZE), cz: Math.floor(p.z / CHUNK_SIZE) },
    );
  });
  loop.start();
}

bootstrap();
