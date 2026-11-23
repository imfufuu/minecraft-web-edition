import * as THREE from 'three';
import { createPRNG } from '../utils/prng';
import type { DayNight } from './DayNight';

const SKY_RADIUS = 420; // inside the camera far plane (1000), far beyond the loaded terrain
const SUN_SIZE = 34;
const SUN_GLOW_SIZE = 90;
const MOON_SIZE = 24;
const STAR_COUNT = 700;
/** Sun path is tilted a little toward the south so it never passes exactly through the zenith. */
const PATH_TILT = 0.28;

/**
 * Sun, moon and stars. One group that follows the camera (so the sky never gets
 * closer) and is rotated by the day phase: the sun rises in the east (+X), the moon
 * is always opposite, and the star field turns with them. Nothing here writes depth
 * and nothing is fogged, so the terrain always draws over it.
 * Cost: 4 draw calls (sun, glow, moon, stars).
 */
export class Sky {
  readonly group = new THREE.Group();
  private readonly pivot = new THREE.Group();
  private readonly sun: THREE.Mesh;
  private readonly sunGlow: THREE.Mesh;
  private readonly moon: THREE.Mesh;
  private readonly stars: THREE.Points;
  private readonly sunMat: THREE.MeshBasicMaterial;
  private readonly glowMat: THREE.MeshBasicMaterial;
  private readonly moonMat: THREE.MeshBasicMaterial;
  private readonly starMat: THREE.PointsMaterial;

  constructor(seed: number) {
    const quad = (size: number, mat: THREE.Material, dir: 1 | -1): THREE.Mesh => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
      m.position.set(dir * SKY_RADIUS, 0, 0);
      m.lookAt(0, 0, 0);
      m.frustumCulled = false;
      m.renderOrder = -10;
      return m;
    };
    const base = { fog: false, depthWrite: false, transparent: true, toneMapped: false };
    this.sunMat = new THREE.MeshBasicMaterial({ ...base, color: 0xfff1b5 });
    this.glowMat = new THREE.MeshBasicMaterial({ ...base, color: 0xffd27a, opacity: 0.22, blending: THREE.AdditiveBlending });
    this.moonMat = new THREE.MeshBasicMaterial({ ...base, color: 0xe4e9f5 });
    this.sun = quad(SUN_SIZE, this.sunMat, 1);
    this.sunGlow = quad(SUN_GLOW_SIZE, this.glowMat, 1);
    this.sunGlow.renderOrder = -11;
    this.moon = quad(MOON_SIZE, this.moonMat, -1);

    // Deterministic star sphere (points on the unit sphere, scaled to SKY_RADIUS).
    const rnd = createPRNG(seed ^ 0x57a25);
    const pos = new Float32Array(STAR_COUNT * 3);
    for (let i = 0; i < STAR_COUNT; i++) {
      const u = rnd() * 2 - 1;
      const t = rnd() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      pos[i * 3] = r * Math.cos(t) * SKY_RADIUS;
      pos[i * 3 + 1] = r * Math.sin(t) * SKY_RADIUS;
      pos[i * 3 + 2] = u * SKY_RADIUS;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false, fog: false, depthWrite: false, transparent: true, opacity: 0 });
    this.stars = new THREE.Points(starGeo, this.starMat);
    this.stars.frustumCulled = false;
    this.stars.renderOrder = -12;

    this.pivot.add(this.stars, this.sunGlow, this.sun, this.moon);
    this.pivot.rotation.z = 0; // set per frame
    this.group.add(this.pivot);
    this.group.rotation.x = PATH_TILT;
    this.group.renderOrder = -10;
  }

  /** Call once per frame with the camera position and the clock. */
  update(cameraPosition: THREE.Vector3, dayNight: DayNight): void {
    this.group.position.copy(cameraPosition);
    // phase 0 → sun at +X (east horizon); 0.25 → +Y (noon); 0.5 → −X (west horizon).
    this.pivot.rotation.z = dayNight.phase * Math.PI * 2;
    const s = dayNight.sunHeight;
    // Fade bodies out just below the horizon; stars fade in through dusk.
    this.sunMat.opacity = THREE.MathUtils.clamp((s + 0.08) / 0.16, 0, 1);
    this.glowMat.opacity = 0.22 * this.sunMat.opacity;
    this.moonMat.opacity = THREE.MathUtils.clamp((-s + 0.08) / 0.16, 0, 1);
    this.starMat.opacity = 0.9 * THREE.MathUtils.clamp((-s + 0.05) / 0.3, 0, 1);
    this.sun.visible = this.sunMat.opacity > 0;
    this.sunGlow.visible = this.sun.visible;
    this.moon.visible = this.moonMat.opacity > 0;
    this.stars.visible = this.starMat.opacity > 0;
  }

  /** World-space direction toward the sun (unit vector). */
  sunDirection(out: THREE.Vector3, dayNight: DayNight): THREE.Vector3 {
    const a = dayNight.phase * Math.PI * 2;
    out.set(Math.cos(a), Math.sin(a), 0).applyAxisAngle(new THREE.Vector3(1, 0, 0), PATH_TILT);
    return out;
  }

  dispose(): void {
    for (const m of [this.sun, this.sunGlow, this.moon]) m.geometry.dispose();
    this.stars.geometry.dispose();
    this.sunMat.dispose();
    this.glowMat.dispose();
    this.moonMat.dispose();
    this.starMat.dispose();
  }
}
