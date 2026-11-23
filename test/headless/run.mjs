import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', { pretendToBeVisual: true, url: 'https://imfufuu.github.io/minecraft-web-edition/' });
const w = dom.window;
for (const k of ['window','document','PointerEvent','WebGL2RenderingContext','HTMLElement','HTMLCanvasElement','HTMLDivElement','Event','MouseEvent','KeyboardEvent','WheelEvent','requestAnimationFrame','cancelAnimationFrame','getComputedStyle','Element','Node']) globalThis[k] = w[k];
globalThis.self = w; 
Object.defineProperty(w.HTMLElement.prototype, 'clientWidth', { get: () => 1280 });
Object.defineProperty(w.HTMLElement.prototype, 'clientHeight', { get: () => 720 });
const errors = [];
w.addEventListener('error', (e) => errors.push(e.message));
process.on('uncaughtException', (e) => errors.push(String(e)));

const mode = process.argv[2] ?? 'lock-ok';
if (mode === 'lock-ok') {
  // Simulate a browser that grants pointer lock asynchronously
  w.HTMLElement.prototype.requestPointerLock = function () {
    setTimeout(() => { Object.defineProperty(w.document, 'pointerLockElement', { value: this, configurable: true }); w.document.dispatchEvent(new w.Event('pointerlockchange')); }, 10);
    return Promise.resolve();
  };
  w.document.exitPointerLock = () => { Object.defineProperty(w.document, 'pointerLockElement', { value: null, configurable: true }); w.document.dispatchEvent(new w.Event('pointerlockchange')); };
} else if (mode === 'lock-error') {
  w.HTMLElement.prototype.requestPointerLock = function () { setTimeout(() => w.document.dispatchEvent(new w.Event('pointerlockerror')), 10); return Promise.reject(new Error('blocked')); };
} else if (mode === 'lock-silent') {
  w.HTMLElement.prototype.requestPointerLock = function () { return undefined; };
}
const { bootstrap } = await import('../../.smoke-out/entry.js');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let game;
try { game = bootstrap(); } catch (e) { console.log('BOOTSTRAP THREW:', e); process.exit(1); }
await sleep(120);
console.log(`[${mode}] frames after 120ms: ${game.frames()}  mode=${game.input.captureMode}  errors=${errors.length}`);
const overlay = w.document.querySelector('.pause-overlay');
console.log(`[${mode}] overlay hidden before click: ${overlay.classList.contains('hidden')}`);
if (mode !== 'lock-ok') game.input.settings.touchControls = true; // force on-screen controls in fallback runs
overlay.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
await sleep(500);
console.log(`[${mode}] after click: mode=${game.input.captureMode} overlay hidden=${overlay.classList.contains('hidden')} status="${w.document.querySelector('.pause-status').textContent}"`);
const yaw0 = game.camera.yaw;
if (mode === 'lock-ok') {
  const mv = new w.MouseEvent('mousemove', { bubbles: true });
  Object.defineProperty(mv, 'movementX', { value: 200 }); Object.defineProperty(mv, 'movementY', { value: 50 });
  w.document.dispatchEvent(mv);
} else {
  // fallback: touch-like drag via pointer events on the canvas (no movementX at all)
  const canvas = w.document.querySelector('canvas');
  const PE = w.PointerEvent ?? w.MouseEvent;
  const mk = (type, x, y) => { const e = new PE(type, { bubbles: true, clientX: x, clientY: y, pointerId: 7, pointerType: 'touch' }); if (!('pointerId' in e)) Object.defineProperty(e, 'pointerId', { value: 7 }); return e; };
  canvas.setPointerCapture = () => {}; canvas.releasePointerCapture = () => {};
  canvas.dispatchEvent(mk('pointerdown', 100, 100));
  canvas.dispatchEvent(mk('pointermove', 200, 125));
  canvas.dispatchEvent(mk('pointermove', 300, 150));
  canvas.dispatchEvent(mk('pointerup', 300, 150));
}
await sleep(60);
const expectedYaw = mode === 'lock-ok' ? -0.44 : -0.44 * game.input.settings.touchLookScale;
console.log(`[${mode}] yaw moved: ${(game.camera.yaw - yaw0).toFixed(4)} rad (expect ≈ ${expectedYaw.toFixed(3)})  pitch=${game.camera.pitch.toFixed(3)}`);
const feet0 = game.player.position.y; const px0 = game.player.position.x;
w.window.dispatchEvent(new w.KeyboardEvent('keydown', { code: 'KeyW', bubbles: true }));
await sleep(300);
w.window.dispatchEvent(new w.KeyboardEvent('keyup', { code: 'KeyW', bubbles: true }));
console.log(`[${mode}] W for 300ms: moved ${(Math.hypot(game.player.position.x - px0, 0)).toFixed(2)} in x; feet ${feet0.toFixed(3)} -> ${game.player.position.y.toFixed(3)} onGround=${game.player.onGround}`);
const groundedBefore = game.player.onGround;
let joyMoved = false;
if (mode !== 'lock-ok') {
  const joy = w.document.querySelector('.joystick');
  joy.getBoundingClientRect = () => ({ left: 28, top: 500, width: 128, height: 128 });
  joy.setPointerCapture = () => {}; joy.releasePointerCapture = () => {};
  const PE = w.PointerEvent ?? w.MouseEvent;
  const mk = (type, x, y) => new PE(type, { bubbles: true, clientX: x, clientY: y, pointerId: 9, pointerType: 'touch' });
  game.player.mode = 'fly'; // avoid terrain steps blocking the walk
  const before = { x: game.player.position.x, z: game.player.position.z };
  joy.dispatchEvent(mk('pointerdown', 92, 564));
  joy.dispatchEvent(mk('pointermove', 92, 516)); // 48px up = full forward
  await sleep(300);
  joy.dispatchEvent(mk('pointerup', 92, 516));
  const dist = Math.hypot(game.player.position.x - before.x, game.player.position.z - before.z);
  joyMoved = dist > 2 && game.input.getMoveAxis().y === 0;
  console.log(`[${mode}] joystick forward 300ms: moved ${dist.toFixed(2)} blocks, axis reset=${game.input.getMoveAxis().y === 0}`);
}
console.log(`[${mode}] total frames=${game.frames()} errors=${JSON.stringify(errors)} diag="${w.document.querySelector('.pause-diag').textContent}" errorbar=${!!w.document.querySelector('.error-bar')}`);
game.loop.stop();
// --- assertions ---
const failures = [];
if (game.input.captureMode === 'none') failures.push('input never became active');
if (!overlay.classList.contains('hidden')) failures.push('pause overlay still visible');
if (Math.abs((game.camera.yaw - yaw0) - expectedYaw) > 0.01) failures.push('look did not rotate as expected');
if (mode !== 'lock-ok') {
  const tc = w.document.querySelector('.touch-controls');
  if (!tc || tc.classList.contains('hidden')) failures.push('touch controls not visible');
  if (!joyMoved) failures.push('joystick did not move the player');
}
if (!groundedBefore) failures.push('player not grounded');
if (game.frames() < 30) failures.push('main loop stalled');
if (errors.length) failures.push('runtime errors: ' + errors.join('; '));
if (w.document.querySelector('.error-bar')) failures.push('error bar shown');
if (failures.length) { console.log(`[${mode}] FAIL: ${failures.join(' | ')}`); process.exit(1); }
console.log(`[${mode}] OK`);
process.exit(0);
