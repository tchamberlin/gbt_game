// Pre-computed lookup tables for fast math operations

const ANIM_TABLE_SIZE = 256;
const animSinTable: Float32Array = new Float32Array(ANIM_TABLE_SIZE);

// Initialize sine table
for (let i = 0; i < ANIM_TABLE_SIZE; i++) {
  animSinTable[i] = Math.sin((i / ANIM_TABLE_SIZE) * Math.PI * 2);
}

// Fast sine for animation phases (0-1 range input, -1 to 1 output)
export function animSin(phase: number): number {
  const normalized = ((phase % 1) + 1) % 1;
  const index = Math.floor(normalized * ANIM_TABLE_SIZE) % ANIM_TABLE_SIZE;
  return animSinTable[index]!;
}

// Fast sine for animation phases (0-1 range input, 0 to 1 output)
export function animSin01(phase: number): number {
  return 0.5 + 0.5 * animSin(phase);
}

// Fast cosine for animation phases
export function animCos(phase: number): number {
  return animSin(phase + 0.25);
}
