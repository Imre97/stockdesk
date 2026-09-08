const HASH_OFFSET = 2166136261;
const HASH_PRIME = 16777619;
const STATE_STEP = 0x6d2b79f5;
const UINT32_RANGE = 4294967296;
const SMALLEST_UNIFORM = 1e-12;

export interface RandomStream {
  next(): number;
  nextNormal(): number;
}

export function hashString(value: string): number {
  let hash = HASH_OFFSET;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, HASH_PRIME);
  }
  return hash >>> 0;
}

export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + STATE_STEP) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / UINT32_RANGE;
  };
}

export function createStream(...parts: (string | number)[]): RandomStream {
  const next = mulberry32(hashString(parts.join(":")));

  return {
    next,
    nextNormal() {
      const first = Math.max(next(), SMALLEST_UNIFORM);
      const second = next();
      return Math.sqrt(-2 * Math.log(first)) * Math.cos(2 * Math.PI * second);
    },
  };
}
