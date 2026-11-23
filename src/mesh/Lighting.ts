import type { Face } from './FaceData';

/** Base brightness per face direction (Minecraft-style directional shading). */
export const FACE_SHADE: Readonly<Record<Face['name'], number>> = {
  top: 1.0,
  bottom: 0.5,
  north: 0.8,
  south: 0.8,
  east: 0.65,
  west: 0.65,
};

/** Brightness multiplier for AO level 0 (fully occluded corner) … 3 (open). */
export const AO_CURVE: readonly [number, number, number, number] = [0.45, 0.65, 0.82, 1.0];

/**
 * Vertex ambient-occlusion level from the three blocks touching the vertex on the
 * outside of the face: the two edge-adjacent blocks and the diagonal corner block.
 * If both sides are solid the corner is fully enclosed regardless of the diagonal.
 */
export function vertexAO(side1: boolean, side2: boolean, corner: boolean): 0 | 1 | 2 | 3 {
  if (side1 && side2) return 0;
  const n = 3 - ((side1 ? 1 : 0) + (side2 ? 1 : 0) + (corner ? 1 : 0));
  return n as 0 | 1 | 2 | 3;
}

/** Default quad split (diagonal between corners 1 and 2 in the Z-order corner layout). */
export const QUAD_INDICES: readonly number[] = [0, 1, 2, 2, 1, 3];
/** Flipped split (diagonal between corners 0 and 3). Both triangles stay CCW. */
export const QUAD_INDICES_FLIPPED: readonly number[] = [0, 1, 3, 0, 3, 2];

/**
 * Decide whether to flip the quad diagonal so it connects the darker pair of corners,
 * which removes the anisotropic interpolation artefact.
 * Corner layout per face (seen from outside):  2 — 3
 *                                              |   |
 *                                              0 — 1
 * Default diagonal is 1–2; flip to 0–3 when the 1–2 pair is brighter than the 0–3 pair.
 */
export function shouldFlipQuad(ao0: number, ao1: number, ao2: number, ao3: number): boolean {
  return ao1 + ao2 > ao0 + ao3;
}
