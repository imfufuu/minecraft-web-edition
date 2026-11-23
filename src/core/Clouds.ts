import * as THREE from 'three';
import { SimplexNoise2D } from '../utils/noise';
import type { DayNight } from './DayNight';

export const CLOUD_CELL = 12; // blocks per cloud cell (x/z)
export const CLOUD_THICKNESS = 4; // blocks
export const CLOUD_ALTITUDE = 84; // bottom of the layer (terrain tops out at 60)
export const CLOUD_RADIUS_CELLS = 18; // 37×37 cells ≈ 444 blocks across; fog hides the rim
export const CLOUD_DRIFT = 0.6; // blocks per second along +X
/** Rebuild the mesh once the player (relative to the drifting field) has moved this many cells. */
const REBUILD_CELLS = 2;
const COVERAGE_THRESHOLD = 0.12;
const NOISE_SCALE = 0.085;

const SHADE_TOP = 1.0;
const SHADE_BOTTOM = 0.72;
const SHADE_SIDE = 0.86;

/**
 * Minecraft-style "fancy" clouds: a deterministic boolean field (simplex fbm on a 12-block
 * grid) rendered as a single mesh of 4-block-thick boxes with faces between neighbouring
 * cloud cells culled. The field drifts east over time; the mesh is rebuilt (old geometry
 * disposed) only when the player has moved REBUILD_CELLS cells relative to the field.
 * Cost: 1 draw call, ~1–3k faces.
 */
export class Clouds {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.MeshBasicMaterial;
  rebuilds = 0;
  faces = 0;
  private readonly noise: SimplexNoise2D;
  private centerCx = Number.NaN;
  private centerCz = Number.NaN;

  constructor(seed: number) {
    this.noise = new SimplexNoise2D((seed ^ 0xc10d5) >>> 0);
    this.material = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, transparent: true, opacity: 0.82, depthWrite: true });
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2; // after terrain + water
    this.mesh.matrixAutoUpdate = false;
  }

  /** Pure field function: is cloud cell (cx, cz) filled? */
  isCloud(cx: number, cz: number): boolean {
    return this.noise.fbm(cx * NOISE_SCALE, cz * NOISE_SCALE, 2) > COVERAGE_THRESHOLD;
  }

  /** Current eastward offset of the field in blocks. */
  static driftAt(elapsed: number): number {
    return elapsed * CLOUD_DRIFT;
  }

  /** Call once per frame. Rebuilds when needed and keeps the mesh positioned under the drift. */
  update(cameraPosition: THREE.Vector3, elapsed: number, dayNight: DayNight): void {
    const drift = Clouds.driftAt(elapsed);
    const cx = Math.floor((cameraPosition.x - drift) / CLOUD_CELL);
    const cz = Math.floor(cameraPosition.z / CLOUD_CELL);
    if (Number.isNaN(this.centerCx) || Math.abs(cx - this.centerCx) >= REBUILD_CELLS || Math.abs(cz - this.centerCz) >= REBUILD_CELLS) {
      this.centerCx = cx;
      this.centerCz = cz;
      this.rebuild();
    }
    this.mesh.position.set(this.centerCx * CLOUD_CELL + drift, CLOUD_ALTITUDE, this.centerCz * CLOUD_CELL);
    this.mesh.updateMatrix();
    // Clouds are lit by the sky: dim toward night (floor keeps them faintly visible under the moon).
    const d = dayNight.daylight;
    this.material.color.setScalar(0.25 + 0.75 * d);
  }

  /** Build the box mesh for the (2R+1)² cells around the centre cell; coordinates are relative to the centre cell origin. */
  rebuild(): void {
    const R = CLOUD_RADIUS_CELLS;
    const size = 2 * R + 1;
    const cells = new Uint8Array(size * size);
    for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) cells[x + z * size] = this.isCloud(this.centerCx + x - R, this.centerCz + z - R) ? 1 : 0;
    const at = (x: number, z: number): boolean => x >= 0 && x < size && z >= 0 && z < size && cells[x + z * size] === 1;

    const positions: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];
    let v = 0;
    const quad = (a: number[], b: number[], c: number[], d: number[], shade: number): void => {
      positions.push(...a, ...b, ...c, ...d);
      for (let i = 0; i < 4; i++) colors.push(shade, shade, shade);
      indices.push(v, v + 1, v + 2, v + 2, v + 1, v + 3);
      v += 4;
    };
    const S = CLOUD_CELL;
    const T = CLOUD_THICKNESS;
    for (let z = 0; z < size; z++) {
      for (let x = 0; x < size; x++) {
        if (!at(x, z)) continue;
        const x0 = (x - R) * S;
        const z0 = (z - R) * S;
        const x1 = x0 + S;
        const z1 = z0 + S;
        // Corner order per face matches FaceData (0 BL, 1 BR, 2 TL, 3 TR seen from outside) → CCW triangles.
        quad([x0, T, z1], [x1, T, z1], [x0, T, z0], [x1, T, z0], SHADE_TOP);
        quad([x0, 0, z0], [x1, 0, z0], [x0, 0, z1], [x1, 0, z1], SHADE_BOTTOM);
        if (!at(x, z + 1)) quad([x0, 0, z1], [x1, 0, z1], [x0, T, z1], [x1, T, z1], SHADE_SIDE); // south (+Z)
        if (!at(x, z - 1)) quad([x1, 0, z0], [x0, 0, z0], [x1, T, z0], [x0, T, z0], SHADE_SIDE); // north (−Z)
        if (!at(x + 1, z)) quad([x1, 0, z1], [x1, 0, z0], [x1, T, z1], [x1, T, z0], SHADE_SIDE); // east (+X)
        if (!at(x - 1, z)) quad([x0, 0, z0], [x0, 0, z1], [x0, T, z0], [x0, T, z1], SHADE_SIDE); // west (−X)
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors), 3));
    geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));
    this.mesh.geometry.dispose(); // always release the previous layer
    this.mesh.geometry = geometry;
    this.faces = indices.length / 6;
    this.rebuilds++;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
