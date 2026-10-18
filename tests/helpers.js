import { alignmentFromPath, extractPath, generateFrames } from "../src/lib/hirschberg.js";

export const ALPHABET = "ACGT";

// A deterministic generator so a failing run can be reproduced.
export function makeRng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export function seededSeq(rng, len) {
  let s = "";
  for (let i = 0; i < len; i++) s += ALPHABET[Math.floor(rng() * ALPHABET.length)];
  return s;
}

export function align(A, B) {
  const frames = generateFrames(A, B);
  const path = extractPath(frames, A.length + 1, B.length + 1);
  return { frames, path, ...alignmentFromPath(path, A, B) };
}

// A handful of pairs worth naming, covering both parities of |A| and the
// lopsided/empty cases.
export const CASES = [
  ["AGTACGCA", "TATGC"],   // the app's default example
  ["GATTACA", "TATGC"],    // odd |A|
  ["ACGTAC", "TATGC"],     // even |A|, odd sub-region
  ["AGTACGCATT", "TATGCAT"],
  ["ACGT", "ACGT"],        // identical
  ["AAAA", "TTTT"],        // nothing matches
  ["ACGTACGT", "AGTACG"],
  ["GATTACA", "GCATGC"],
  ["A", "A"],
  ["A", "T"],
  ["AC", "A"],
  ["A", "ACGT"],
  ["ACGT", "A"],
  ["ACGT", ""],
  ["", "ACGT"],
  ["", ""],
];
