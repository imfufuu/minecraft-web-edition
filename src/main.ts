import * as THREE from 'three';
import { Renderer } from './core/Renderer';
import { Loop } from './core/Loop';
import { InputManager } from './core/InputManager';
import { FirstPersonCamera } from './core/FirstPersonCamera';
import { DebugOverlay } from './ui/DebugOverlay';
import { PauseOverlay } from './ui/PauseOverlay';

const CHUNK_SIZE = 16; // used only for the debug "current chunk" readout until P2
const SKY_COLOR = 0x87ceeb;

function bootstrap(): void {
  const container = document.getElementById('app');
  if (!container) throw new Error('#app container not found');

  const gfx = new Renderer(container);
  const { scene, camera } = gfx;

  // --- Sky & fog ---
  scene.background = new THREE.Color(SKY_COLOR);
  scene.fog = new THREE.Fog(SKY_COLOR, 60, 160);

  // --- Baseline objects (from P0): test cube + grid helper ---
  const cube = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshNormalMaterial());
  cube.position.set(0, 0.5, 0);
  scene.add(cube);
  scene.add(new THREE.GridHelper(64, 64, 0x666666, 0x3a3a3a));

  // --- Input & camera ---
  const input = new InputManager(gfx.renderer.domElement);
  const fps = new FirstPersonCamera(camera, input);
  camera.position.set(4, 3, 8);
  fps.setLook(Math.atan2(4, 8), -0.25);

  // --- UI ---
  const pause = new PauseOverlay(() => input.requestLock());
  input.onLockChanged((locked) => pause.setVisible(!locked));
  const debug = new DebugOverlay();
  debug.addLine(() => `Yaw: ${THREE.MathUtils.radToDeg(fps.yaw).toFixed(1)}°  Pitch: ${THREE.MathUtils.radToDeg(fps.pitch).toFixed(1)}°`);
  debug.addLine(() => `Pointer: ${input.locked ? 'locked' : 'free'}`);

  // --- Main loop ---
  const loop = new Loop();
  loop.onUpdate((dt) => {
    debug.beginFrame();
    fps.update(dt);
    cube.rotation.y += dt * 0.8;
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
