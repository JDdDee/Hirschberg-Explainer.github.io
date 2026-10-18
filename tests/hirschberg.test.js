// @vitest-environment node
import { test } from "vitest";
import assert from "node:assert/strict";

import {
  dedupeHighlights,
  editDistance,
  extractPath,
  findSplitColumn,
  generateFrames,
  hirschbergBackward,
  hirschbergForward,
  planRowClear,
  renderFrames,
} from "../src/lib/hirschberg.js";
import { CASES, align, makeRng, seededSeq } from "./helpers.js";

// ---------------------------------------------------------------------------
// The two linear-space passes
// ---------------------------------------------------------------------------

test("forward pass returns prefix distances against every prefix of B", () => {
  const A = "AGTA";
  const B = "TATGC";
  const row = hirschbergForward(A, B, 0, 0, []);

  assert.equal(row.length, B.length + 1);
  for (let j = 0; j <= B.length; j++) {
    assert.equal(row[j], editDistance(A, B.slice(0, j)), `prefix of length ${j}`);
  }
});

test("backward pass returns suffix distances against every suffix of B", () => {
  const A = "CGCA";
  const B = "TATGC";
  const row = hirschbergBackward(A, B, 0, 0, []);

  assert.equal(row.length, B.length + 1);
  for (let j = 0; j <= B.length; j++) {
    assert.equal(row[j], editDistance(A, B.slice(j)), `suffix starting at ${j}`);
  }
});

test("the two passes agree on the total cost at the split column", () => {
  const A = "AGTACGCA";
  const B = "TATGC";
  const mid = Math.floor(A.length / 2);

  const forward = hirschbergForward(A.slice(0, mid), B, 0, 0, []);
  const backward = hirschbergBackward(A.slice(mid), B, mid, 0, []);
  const { cost } = findSplitColumn(forward, backward);

  assert.equal(cost, editDistance(A, B));
});

test("split column ties resolve to the leftmost column", () => {
  const { index } = findSplitColumn([2, 1, 3], [1, 2, 1]);
  assert.equal(index, 0);
});

// ---------------------------------------------------------------------------
// The alignment the animation ends up drawing
// ---------------------------------------------------------------------------

test("the highlighted path is a connected sequence of single steps", () => {
  for (const [A, B] of CASES) {
    const { path } = align(A, B);

    assert.deepEqual(path[0], [0, 0], `${A}/${B} must start at the top-left`);
    assert.deepEqual(path[path.length - 1], [A.length, B.length], `${A}/${B} must end at the bottom-right`);

    for (let k = 1; k < path.length; k++) {
      const dr = path[k][0] - path[k - 1][0];
      const dc = path[k][1] - path[k - 1][1];
      const ok = (dr === 1 && dc === 0) || (dr === 0 && dc === 1) || (dr === 1 && dc === 1);
      assert.ok(ok, `${A}/${B}: jump from ${path[k - 1]} to ${path[k]} skips cells`);
    }
  }
});

test("the path spells out an alignment scoring exactly the edit distance", () => {
  for (const [A, B] of CASES) {
    const { alignedA, alignedB, cost } = align(A, B);

    assert.equal(cost, editDistance(A, B), `${A}/${B} is not optimal`);
    assert.equal(alignedA.length, alignedB.length, `${A}/${B} rows are ragged`);
    assert.equal(alignedA.replaceAll("-", ""), A, `${A}/${B} lost letters from A`);
    assert.equal(alignedB.replaceAll("-", ""), B, `${A}/${B} lost letters from B`);
  }
});

test("known alignment for the app's default example", () => {
  const { alignedA, alignedB, cost } = align("AGTACGCA", "TATGC");

  assert.equal(cost, 4);
  assert.equal(alignedA.replaceAll("-", ""), "AGTACGCA");
  assert.equal(alignedB.replaceAll("-", ""), "TATGC");
  assert.equal(alignedA.length, alignedB.length);
});

test("aligning a sequence with itself is free and gap-free", () => {
  for (const seq of ["A", "AC", "ACGT", "GATTACA", "AGTACGCATT"]) {
    const { alignedA, alignedB, cost } = align(seq, seq);
    assert.equal(cost, 0, `${seq} against itself should cost nothing`);
    assert.equal(alignedA, seq);
    assert.equal(alignedB, seq);
  }
});

test("aligning against an empty sequence is all gaps", () => {
  const { alignedA, alignedB, cost } = align("ACGT", "");
  assert.equal(cost, 4);
  assert.equal(alignedA, "ACGT");
  assert.equal(alignedB, "----");

  const flipped = align("", "ACGT");
  assert.equal(flipped.cost, 4);
  assert.equal(flipped.alignedA, "----");
  assert.equal(flipped.alignedB, "ACGT");
});

test("odd-length sequences align just as well as even-length ones", () => {
  // Odd |A| means the split row is not the middle row of the sub-rectangle.
  // These lengths used to be the ones that misbehaved.
  for (const A of ["GATTACA", "ACGTA", "ACGTACG", "AGTACGCAT"]) {
    for (const B of ["TATGC", "TATGCA", "A", "GGGG"]) {
      const { cost } = align(A, B);
      assert.equal(cost, editDistance(A, B), `${A}/${B}`);
    }
  }
});

test("randomised sequences always produce an optimal alignment", () => {
  const rng = makeRng(20251205);

  for (let trial = 0; trial < 500; trial++) {
    const A = seededSeq(rng, Math.floor(rng() * 12));
    const B = seededSeq(rng, Math.floor(rng() * 12));
    const { path, alignedA, alignedB, cost } = align(A, B);

    assert.equal(cost, editDistance(A, B), `${A}/${B} cost`);
    assert.equal(alignedA.replaceAll("-", ""), A, `${A}/${B} A intact`);
    assert.equal(alignedB.replaceAll("-", ""), B, `${A}/${B} B intact`);
    assert.deepEqual(path[path.length - 1], [A.length, B.length], `${A}/${B} endpoint`);
  }
});

test("matches Needleman-Wunsch on longer random sequences", () => {
  const rng = makeRng(31337);
  for (let trial = 0; trial < 25; trial++) {
    const A = seededSeq(rng, 30 + Math.floor(rng() * 20));
    const B = seededSeq(rng, 30 + Math.floor(rng() * 20));
    assert.equal(align(A, B).cost, editDistance(A, B), `${A}/${B}`);
  }
});

// ---------------------------------------------------------------------------
// What the animation actually shows on screen
// ---------------------------------------------------------------------------

test("every cell written stays inside the table", () => {
  for (const [A, B] of CASES) {
    const rows = A.length + 1;
    const cols = B.length + 1;
    for (const f of generateFrames(A, B)) {
      if (f.type === "clearTable") continue;
      if (f.type === "updateBounds") {
        assert.ok(f.rowOffset + f.r - 1 < rows, `${A}/${B}: bounds overflow rows`);
        assert.ok(f.colOffset + f.c - 1 < cols, `${A}/${B}: bounds overflow cols`);
        continue;
      }
      assert.ok(f.r >= 0 && f.r < rows, `${A}/${B}: row ${f.r} out of range`);
      assert.ok(f.c >= 0 && f.c < cols, `${A}/${B}: col ${f.c} out of range`);
    }
  }
});

test("each updateBounds frame reports the row where the passes meet", () => {
  for (const [A, B] of CASES) {
    for (const f of generateFrames(A, B)) {
      if (f.type !== "updateBounds") continue;
      const n = f.r - 1;
      assert.equal(f.midRow, f.rowOffset + Math.floor(n / 2), `${A}/${B}`);
    }
  }
});

// This is the regression test for the bug that used to make odd-length regions
// look wrong: the renderer worked out the split row from the row *count*
// (n + 1) rather than from n, so for odd n it erased the forward pass's last
// row one row too early. By the time the backward pass arrived to add its
// values, the forward numbers it was supposed to be added to were gone, and the
// split row showed the backward score alone.
test("the split row still holds the forward score when the backward pass lands on it", () => {
  const check = (A, B) => {
    const frames = generateFrames(A, B);
    const offenders = [];

    renderFrames(frames, A.length + 1, B.length + 1, ({ frame, before }) => {
      if (frame.type !== "sumCell") return;
      if (typeof before !== "number") {
        offenders.push({ r: frame.r, c: frame.c, before });
      }
    });

    assert.deepEqual(offenders, [], `${A}/${B}: forward values erased before the sum`);
  };

  for (const [A, B] of CASES) check(A, B);

  const rng = makeRng(7);
  for (let trial = 0; trial < 200; trial++) {
    check(seededSeq(rng, 2 + Math.floor(rng() * 10)), seededSeq(rng, 2 + Math.floor(rng() * 10)));
  }
});

test("the summed split row equals the cost of the best path through each cell", () => {
  const A = "GATTACA"; // odd length: the case that used to break
  const B = "TATGC";
  const frames = generateFrames(A, B);
  const mid = Math.floor(A.length / 2);
  const total = editDistance(A, B);

  const sums = new Map();
  renderFrames(frames, A.length + 1, B.length + 1, ({ frame, table, bounds }) => {
    if (frame.type !== "sumCell" || bounds.rowOffset !== 0 || bounds.nrows !== A.length + 1) return;
    sums.set(frame.c, table[frame.r][frame.c]);
  });

  assert.equal(sums.size, B.length + 1, "the whole split row should be summed");
  for (const [col, value] of sums) {
    const through = editDistance(A.slice(0, mid), B.slice(0, col)) + editDistance(A.slice(mid), B.slice(col));
    assert.equal(value, through, `column ${col}`);
  }
  assert.equal(Math.min(...sums.values()), total, "the best column should give the total cost");
});

test("the animation ends with the whole path highlighted and nothing else", () => {
  for (const [A, B] of CASES) {
    const rows = A.length + 1;
    const cols = B.length + 1;
    const frames = generateFrames(A, B);
    const path = extractPath(frames, rows, cols);
    const onPath = new Set(path.map(([r, c]) => `${r},${c}`));

    const { highlights } = renderFrames(frames, rows, cols);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (highlights[r][c]) {
          assert.ok(onPath.has(`${r},${c}`), `${A}/${B}: ${r},${c} highlighted but off-path`);
        }
      }
    }
  }
});

test("frames replay identically every time", () => {
  const a = JSON.stringify(generateFrames("AGTACGCA", "TATGC"));
  const b = JSON.stringify(generateFrames("AGTACGCA", "TATGC"));
  assert.equal(a, b);
});

// ---------------------------------------------------------------------------
// More alignment properties
// ---------------------------------------------------------------------------

test("textbook edit distances, on letters that aren't DNA", () => {
  // Nothing in the algorithm is specific to ACGT.
  const known = [
    ["kitten", "sitting", 3],
    ["flaw", "lawn", 2],
    ["intention", "execution", 5],
    ["sunday", "saturday", 3],
    ["abc", "", 3],
  ];
  for (const [A, B, expected] of known) {
    assert.equal(editDistance(A, B), expected, `reference ${A}/${B}`);
    assert.equal(align(A, B).cost, expected, `hirschberg ${A}/${B}`);
  }
});

test("swapping the two sequences doesn't change the cost", () => {
  const rng = makeRng(99);
  for (let trial = 0; trial < 100; trial++) {
    const A = seededSeq(rng, Math.floor(rng() * 10));
    const B = seededSeq(rng, Math.floor(rng() * 10));
    assert.equal(align(A, B).cost, align(B, A).cost, `${A}/${B}`);
  }
});

test("the passes write exactly their own rectangle, shifted by the offsets", () => {
  const A = "GAT";
  const B = "TACG";
  const rowOffset = 5;
  const colOffset = 2;

  for (const pass of [hirschbergForward, hirschbergBackward]) {
    const frames = [];
    pass(A, B, rowOffset, colOffset, frames);

    const cells = new Set(frames.map((f) => `${f.r},${f.c}`));
    assert.equal(frames.length, (A.length + 1) * (B.length + 1), `${pass.name} writes each cell once`);
    assert.equal(cells.size, frames.length, `${pass.name} never writes a cell twice`);
    for (const f of frames) {
      assert.ok(f.r >= rowOffset && f.r <= rowOffset + A.length, `${pass.name} row ${f.r}`);
      assert.ok(f.c >= colOffset && f.c <= colOffset + B.length, `${pass.name} col ${f.c}`);
    }
  }
});

test("only the backward pass's final row is written as sumCell", () => {
  const frames = [];
  hirschbergBackward("GATT", "TACG", 3, 0, frames);
  for (const f of frames) {
    assert.equal(f.type, f.r === 3 ? "sumCell" : "setCell", `row ${f.r}`);
  }
});

test("total work stays within a constant factor of the table size", () => {
  // Hirschberg does about twice the work of Needleman-Wunsch. A recursion that
  // accidentally passed the whole of B down to both halves would blow past this.
  const rng = makeRng(4242);
  for (let trial = 0; trial < 200; trial++) {
    const A = seededSeq(rng, Math.floor(rng() * 25));
    const B = seededSeq(rng, Math.floor(rng() * 25));
    const writes = generateFrames(A, B).filter((f) => f.type === "setCell" || f.type === "sumCell").length;
    assert.ok(writes <= 3 * (A.length + 1) * (B.length + 1), `${A}/${B}: ${writes} writes`);
  }
});

// ---------------------------------------------------------------------------
// The numbers and highlights the animation shows
// ---------------------------------------------------------------------------

// Every value the animation writes should be a real DP value: a prefix
// distance for the forward pass (and the base case), a suffix distance for the
// backward pass. Which pass a frame belongs to follows from where it sits
// relative to the current sub-rectangle's split row.
test("every number written to the board is the correct DP value for its cell", () => {
  const check = (seqA, seqB) => {
    let bounds = null;
    for (const f of generateFrames(seqA, seqB)) {
      if (f.type === "updateBounds") {
        bounds = f;
        continue;
      }
      if (f.type !== "setCell" && f.type !== "sumCell") continue;

      const subA = seqA.slice(bounds.rowOffset, bounds.rowOffset + bounds.r - 1);
      const subB = seqB.slice(bounds.colOffset, bounds.colOffset + bounds.c - 1);
      const i = f.r - bounds.rowOffset;
      const j = f.c - bounds.colOffset;
      const baseCase = bounds.r - 1 <= 1 || bounds.c - 1 <= 1;
      const forward = baseCase || (f.type === "setCell" && f.r <= bounds.midRow);

      const expected = forward
        ? editDistance(subA.slice(0, i), subB.slice(0, j))
        : editDistance(subA.slice(i), subB.slice(j));
      assert.equal(f.value, expected, `${seqA}/${seqB}: ${f.type} at ${f.r},${f.c}`);
    }
  };

  for (const [A, B] of CASES) check(A, B);
  const rng = makeRng(555);
  for (let trial = 0; trial < 100; trial++) {
    check(seededSeq(rng, Math.floor(rng() * 12)), seededSeq(rng, Math.floor(rng() * 12)));
  }
});

// The visual version of "linear space": while the two passes run, the board
// never shows more than three rows (two for the pass in motion, plus the split
// row waiting for the backward pass). Base cases are exempt: they are one row
// or one column, so storing them whole is still linear.
test("the board never shows more than three rows while the passes run", () => {
  const rng = makeRng(8080);
  const pairs = [...CASES];
  for (let trial = 0; trial < 300; trial++) {
    pairs.push([seededSeq(rng, Math.floor(rng() * 16)), seededSeq(rng, Math.floor(rng() * 16))]);
  }

  for (const [A, B] of pairs) {
    renderFrames(generateFrames(A, B), A.length + 1, B.length + 1, ({ index, table, bounds }) => {
      if (bounds.nrows - 1 < 2 || bounds.ncols - 1 < 2) return;
      const shown = table.filter((row) => row.some((v) => v !== "")).length;
      assert.ok(shown <= 3, `${A}/${B}: ${shown} rows on screen at frame ${index}`);
    });
  }
});

test("each path cell is highlighted exactly once, then the board is wiped", () => {
  for (const [A, B] of CASES) {
    const frames = generateFrames(A, B);
    const path = extractPath(frames, A.length + 1, B.length + 1);
    const highlightIdx = frames.flatMap((f, k) => (f.type === "highlight" ? [k] : []));

    // The two corners are drawn by the UI, not by frames.
    assert.equal(highlightIdx.length, Math.max(0, path.length - 2), `${A}/${B}`);
    for (const k of highlightIdx) {
      assert.equal(frames[k + 1]?.type, "clearTable", `${A}/${B}: highlight at frame ${k}`);
    }
  }
});

test("the first frame always sets up the full table", () => {
  for (const [A, B] of CASES) {
    const [first] = generateFrames(A, B);
    assert.equal(first.type, "updateBounds");
    assert.equal(first.r, A.length + 1);
    assert.equal(first.c, B.length + 1);
    assert.equal(first.rowOffset, 0);
    assert.equal(first.colOffset, 0);
  }
});

test("dedupeHighlights drops repeats and the two corners, and nothing else", () => {
  const frames = [
    { type: "updateBounds", r: 3, c: 3, rowOffset: 0, colOffset: 0, midRow: 1 },
    { type: "highlight", r: 0, c: 0 },
    { type: "highlight", r: 1, c: 1 },
    { type: "clearTable" },
    { type: "highlight", r: 1, c: 1 },
    { type: "setCell", r: 1, c: 1, value: 0 },
    { type: "highlight", r: 2, c: 2 },
  ];

  assert.deepEqual(dedupeHighlights(frames, 3, 3), [frames[0], frames[2], frames[3], frames[5]]);
});

// ---------------------------------------------------------------------------
// planRowClear: which row the renderer is allowed to erase
// ---------------------------------------------------------------------------

test("planRowClear erases the right row at each hand-off point", () => {
  // A 9x6 region with the split at row 4: the default example's first pass.
  const fresh = () => ({ nrows: 9, ncols: 6, rowOffset: 0, colOffset: 0, midRow: 4, lastRow: -1 });

  // Forward pass starting row 3 drops row 1.
  assert.equal(planRowClear({ type: "setCell", r: 3, c: 0 }, fresh()), 1);
  // Forward pass finishing the split row drops the row above it.
  assert.equal(planRowClear({ type: "setCell", r: 4, c: 5 }, { ...fresh(), lastRow: 4 }), 3);
  // Backward pass starting row 6 (walking up) drops row 8.
  assert.equal(planRowClear({ type: "setCell", r: 6, c: 5 }, fresh()), 8);
  // Backward pass finishing the row under the split row drops the one below.
  assert.equal(planRowClear({ type: "setCell", r: 5, c: 0 }, { ...fresh(), lastRow: 5 }), 6);
  // Backward pass finishing the split row drops the row under it.
  assert.equal(planRowClear({ type: "sumCell", r: 4, c: 0 }, fresh()), 5);
  // Mid-row writes drop nothing.
  assert.equal(planRowClear({ type: "setCell", r: 3, c: 2 }, { ...fresh(), lastRow: 3 }), -1);
  // Frames that don't write numbers drop nothing.
  assert.equal(planRowClear({ type: "highlight", r: 3, c: 0 }, fresh()), -1);
});

test("planRowClear tracks the row it last saw", () => {
  const bounds = { nrows: 9, ncols: 6, rowOffset: 0, colOffset: 0, midRow: 4, lastRow: -1 };
  planRowClear({ type: "setCell", r: 2, c: 0 }, bounds);
  assert.equal(bounds.lastRow, 2);
  assert.equal(planRowClear({ type: "setCell", r: 2, c: 1 }, bounds), -1, "same row, nothing new to drop");
});

test("planRowClear never reaches outside the current sub-rectangle", () => {
  // The top rows of a region would ask to clear rows above it, and the bottom
  // rows would ask to clear rows below it. Both belong to someone else.
  const bounds = { nrows: 4, ncols: 3, rowOffset: 6, colOffset: 2, midRow: 7, lastRow: -1 };
  assert.equal(planRowClear({ type: "setCell", r: 6, c: 2 }, { ...bounds }), -1);
  assert.equal(planRowClear({ type: "setCell", r: 9, c: 4 }, { ...bounds }), -1);

  for (const [A, B] of CASES) {
    renderFrames(generateFrames(A, B), A.length + 1, B.length + 1, ({ frame, bounds: b }) => {
      const row = planRowClear(frame, { ...b, lastRow: -1 });
      if (row === -1) return;
      assert.ok(row >= b.rowOffset && row < b.rowOffset + b.nrows, `${A}/${B}: cleared row ${row}`);
    });
  }
});
