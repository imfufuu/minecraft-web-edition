import * as THREE from 'three';

/** Real seconds for one full in-game day. */
export const DAY_LENGTH_SEC = 600;
/** Night never gets darker than this fraction of full daylight (keeps the world readable). */
export const MIN_DAYLIGHT = 0.25;
/** Default starting phase: mid-morning. */
export const DEFAULT_PHASE = 0.12;

const SKY_DAY = new THREE.Color(0x87ceeb);
const SKY_DUSK = new THREE.Color(0xe8905a);
const SKY_NIGHT = new THREE.Color(0x0a0f22);

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/**
 * Day/night clock. `phase` ∈ [0,1): 0 = sunrise, 0.25 = noon, 0.5 = sunset, 0.75 = midnight.
 * Everything downstream (sky, fog, the `uDaylight` uniform) is derived from `sunHeight = sin(2π·phase)`,
 * so lighting changes cost zero CPU per frame: no mesh is ever rebuilt.
 */
export class DayNight {
  phase: number;
  /** When fixed (e.g. `?day=0.3`) the clock never advances. */
  readonly fixed: boolean;
  /** Set by the game while a menu is open; time stands still. */
  paused = false;
  /** Shared GPU uniform: multiplies every vertex colour in the chunk / water materials. */
  readonly daylightUniform: THREE.IUniform<number> = { value: 1 };
  readonly skyColor = new THREE.Color();

  constructor(phase = DEFAULT_PHASE, fixed = false) {
    this.phase = phase >= 0 && phase < 1 ? phase : ((phase % 1) + 1) % 1; // avoid FP drift for in-range values
    this.fixed = fixed;
    this.refresh();
  }

  get sunHeight(): number {
    return Math.sin(this.phase * Math.PI * 2);
  }

  get daylight(): number {
    return this.daylightUniform.value;
  }

  /** 24h clock string (06:00 = sunrise). */
  get clock(): string {
    const minutes = Math.floor((((this.phase + 0.25) % 1) * 24 * 60));
    const hh = Math.floor(minutes / 60).toString().padStart(2, '0');
    const mm = (minutes % 60).toString().padStart(2, '0');
    return `${hh}:${mm}`;
  }

  update(dt: number): void {
    if (this.fixed || this.paused) return;
    this.phase = (this.phase + dt / DAY_LENGTH_SEC) % 1;
    this.refresh();
  }

  /** Recompute daylight + sky colour from the phase. */
  refresh(): void {
    const s = this.sunHeight;
    // Light fades through twilight (sun 0.2 above → 0.15 below the horizon) and floors at MIN_DAYLIGHT.
    this.daylightUniform.value = MIN_DAYLIGHT + (1 - MIN_DAYLIGHT) * smoothstep(-0.15, 0.2, s);
    // Sky: night → dusk around the horizon → day.
    if (s >= 0) {
      this.skyColor.lerpColors(SKY_DUSK, SKY_DAY, smoothstep(0, 0.35, s));
    } else {
      this.skyColor.lerpColors(SKY_NIGHT, SKY_DUSK, smoothstep(-0.3, 0, s));
    }
  }

  /**
   * Inject `uDaylight` into a built-in material: the fragment colour (texture × vertex colour)
   * is multiplied by the uniform right after three's own colour stage.
   */
  attach(material: THREE.Material): void {
    const uniform = this.daylightUniform;
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uDaylight = uniform;
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uDaylight;')
        .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= uDaylight;');
    };
    material.customProgramCacheKey = () => 'mwe-daylight';
  }
}

/** Parse `?day=` (0–1 phase or HH:MM). Returns null when absent/invalid. */
export function parseDayParam(raw: string | null): number | null {
  if (!raw) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(raw);
  if (m) {
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (h > 23 || min > 59) return null;
    return (((h + min / 60) / 24 - 0.25) % 1 + 1) % 1;
  }
  const v = Number(raw);
  return Number.isFinite(v) && v >= 0 && v <= 1 ? v % 1 : null;
}
