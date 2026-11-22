/**
 * Static geometry description of the 6 cube faces.
 *
 * Every face lists its 4 corner offsets in an order such that the index pattern
 * [0, 1, 2, 2, 1, 3] produces two counter-clockwise triangles when viewed from
 * outside the cube (i.e. looking against the face normal). Three.js front faces
 * are CCW, so back-face culling hides the inside of every block.
 *
 * Corner layout per face (as seen from outside):
 *   2 --- 3
 *   |  \  |
 *   0 --- 1
 */
export interface Face {
  readonly name: 'top' | 'bottom' | 'north' | 'south' | 'east' | 'west';
  /** Unit direction to the neighbouring block that would occlude this face. */
  readonly dir: readonly [number, number, number];
  readonly normal: readonly [number, number, number];
  /** 4 corners × (x, y, z) offsets within the unit cube. */
  readonly corners: readonly [
    readonly [number, number, number],
    readonly [number, number, number],
    readonly [number, number, number],
    readonly [number, number, number],
  ];
}

export const FACE_INDICES: readonly [number, number, number, number, number, number] = [0, 1, 2, 2, 1, 3];

export const FACES: readonly Face[] = [
  {
    name: 'top', // +Y
    dir: [0, 1, 0],
    normal: [0, 1, 0],
    corners: [
      [0, 1, 1],
      [1, 1, 1],
      [0, 1, 0],
      [1, 1, 0],
    ],
  },
  {
    name: 'bottom', // -Y
    dir: [0, -1, 0],
    normal: [0, -1, 0],
    corners: [
      [0, 0, 0],
      [1, 0, 0],
      [0, 0, 1],
      [1, 0, 1],
    ],
  },
  {
    name: 'south', // +Z (towards the viewer in default three.js orientation)
    dir: [0, 0, 1],
    normal: [0, 0, 1],
    corners: [
      [0, 0, 1],
      [1, 0, 1],
      [0, 1, 1],
      [1, 1, 1],
    ],
  },
  {
    name: 'north', // -Z
    dir: [0, 0, -1],
    normal: [0, 0, -1],
    corners: [
      [1, 0, 0],
      [0, 0, 0],
      [1, 1, 0],
      [0, 1, 0],
    ],
  },
  {
    name: 'east', // +X
    dir: [1, 0, 0],
    normal: [1, 0, 0],
    corners: [
      [1, 0, 1],
      [1, 0, 0],
      [1, 1, 1],
      [1, 1, 0],
    ],
  },
  {
    name: 'west', // -X
    dir: [-1, 0, 0],
    normal: [-1, 0, 0],
    corners: [
      [0, 0, 0],
      [0, 0, 1],
      [0, 1, 0],
      [0, 1, 1],
    ],
  },
];
