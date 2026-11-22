import * as THREE from 'three';
import { Renderer } from './core/Renderer';
import { Loop } from './core/Loop';
import { DebugOverlay } from './ui/DebugOverlay';

const CHUNK_SIZE = 16; // used only for the debug "current chunk" readout in P0

function bootstrap(): void {
  const container = document.getElementById('app');
  if (!container) throw new Error('#app container not found');

  const gfx = new Renderer(container);
  const { scene, camera } = gfx;

  scene.background = new THREE.Color(0x202020);
  camera.position.set(4, 3, 6);
  camera.lookAt(0, 0.5, 0);

  // --- P0 baseline objects: one test cube + grid helper ---
  const cubeGeometry = new THREE.BoxGeometry(1, 1, 1);
  const cubeMaterial = new THREE.MeshNormalMaterial();
  const cube = new THREE.Mesh(cubeGeometry, cubeMaterial);
  cube.position.set(0, 0.5, 0);
  scene.add(cube);

  const grid = new THREE.GridHelper(32, 32, 0x888888, 0x444444);
  scene.add(grid);

  // --- Debug overlay (F3) ---
  const debug = new DebugOverlay();

  // --- Main loop ---
  const loop = new Loop();
  loop.onUpdate((dt) => {
    debug.beginFrame();
    cube.rotation.y += dt * 0.8;
    cube.rotation.x += dt * 0.3;
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
