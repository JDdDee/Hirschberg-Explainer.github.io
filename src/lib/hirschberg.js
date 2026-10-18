// Hirschberg's algorithm, written so that every step it takes can be replayed as
// an animation. Instead of only returning an alignment, the functions below push
// "frames" onto an array. The page plays that array back one frame at a time,
// and the tests replay the same array to check the algorithm did the right thing.
//
// Scoring is plain Levenshtein edit distance. A match costs 0, a mismatch costs
// 1, and a gap (insert or delete) costs 1. Lower is better.
//
// Frame types:
//   setCell       write a DP value into a cell
//   sumCell       add a backward-pass value onto the forward-pass value already
//                 in the cell (only on the split row, where the two passes meet)
//   updateBounds  start a new subproblem: which rectangle of the table it covers,
//                 and which row inside it is the split row
//   highlight     mark a cell as part of the final alignment path
//   clearTable    wipe the board before the next subproblem

export const matchScore = 0;
export const mismatchScore = 1;
export const gapScore = 1;

function substitutionCost(a, b) {
  return a === b ? matchScore : mismatchScore;
}

// ---------------------------------------------------------------------------
// The algorithm
// ---------------------------------------------------------------------------

// Forward pass over rows rowOffset .. rowOffset + A.length, top to bottom.
// Returns the last row: the distance from all of A to every prefix of B. Only
// two rows are held in memory at a time, which is the point of the algorithm.
export function hirschbergForward(A, B, rowOffset, colOffset, frames = []) {
  const n = A.length;
  const m = B.length;
  let prev = Array(m + 1).fill(0);
  let curr = Array(m + 1).fill(0);

  // Aligning an empty prefix of A against B costs one gap per letter of B.
  for (let j = 0; j <= m; j++) {
    prev[j] = j * gapScore;
    frames.push({ type: "setCell", r: rowOffset, c: colOffset + j, value: prev[j] });
  }

  for (let i = 1; i <= n; i++) {
    curr[0] = i * gapScore;
    frames.push({ type: "setCell", r: rowOffset + i, c: colOffset, value: curr[0] });

    for (let j = 1; j <= m; j++) {
      curr[j] = Math.min(
        prev[j] + gapScore,                             // delete ↓
        curr[j - 1] + gapScore,                         // insert →
        prev[j - 1] + substitutionCost(A[i - 1], B[j - 1]) // match/mismatch ↘
      );
      frames.push({ type: "setCell", r: rowOffset + i, c: colOffset + j, value: curr[j] });
    }

    // Swap rather than assign: `prev = curr` would make both names point at
    // the same array.
    [prev, curr] = [curr, prev];
  }

  return prev;
}

// Backward pass: the same recurrence run from the bottom-right corner upward.
// Pass A and B in their normal order; the loops walk them backwards.
// Returns suffix distances: result[j] is the distance from A to B.slice(j).
//
// The row this pass finishes on is the split row. Its writes are sumCell
// frames, so they land on top of the forward pass's last row and each cell ends
// up holding the cost of the best full alignment through it.
export function hirschbergBackward(A, B, rowOffset, colOffset, frames = []) {
  const n = A.length;
  const m = B.length;
  let prev = Array(m + 1).fill(0);
  let curr = Array(m + 1).fill(0);

  for (let j = m; j >= 0; j--) {
    prev[j] = (m - j) * gapScore;
    frames.push({ type: "setCell", r: rowOffset + n, c: colOffset + j, value: prev[j] });
  }

  for (let i = n - 1; i >= 0; i--) {
    const type = i === 0 ? "sumCell" : "setCell";

    curr[m] = (n - i) * gapScore;
    frames.push({ type, r: rowOffset + i, c: colOffset + m, value: curr[m] });

    for (let j = m - 1; j >= 0; j--) {
      curr[j] = Math.min(
        prev[j] + gapScore,                     // delete ↑
        curr[j + 1] + gapScore,                 // insert ←
        prev[j + 1] + substitutionCost(A[i], B[j]) // match/mismatch ↖
      );
      frames.push({ type, r: rowOffset + i, c: colOffset + j, value: curr[j] });
    }

    [prev, curr] = [curr, prev];
  }

  return prev;
}

// The column where forward + backward is smallest. Ties go to the leftmost
// column, which keeps the animation deterministic.
export function findSplitColumn(forward, backward) {
  let index = 0;
  let cost = Infinity;

  for (let j = 0; j < forward.length; j++) {
    const total = forward[j] + backward[j];
    if (total < cost) {
      cost = total;
      index = j;
    }
  }

  return { index, cost };
}

// A region at most one row tall or one column wide is small enough to store
// whole, so fill it and trace back the ordinary Needleman-Wunsch way.
export function hirschbergBaseCase(A, B, rowOffset, colOffset, frames = []) {
  const n = A.length;
  const m = B.length;
  const dp = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));

  for (let i = 0; i <= n; i++) dp[i][0] = i * gapScore;
  for (let j = 0; j <= m; j++) dp[0][j] = j * gapScore;

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + gapScore,
        dp[i][j - 1] + gapScore,
        dp[i - 1][j - 1] + substitutionCost(A[i - 1], B[j - 1])
      );
      frames.push({ type: "setCell", r: rowOffset + i, c: colOffset + j, value: dp[i][j] });
    }
  }

  // The region's top-left corner is already on the path (the parent call
  // highlighted it), so the traceback stops as soon as it gets there.
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    frames.push({ type: "highlight", r: rowOffset + i, c: colOffset + j });
    frames.push({ type: "clearTable" });

    if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + substitutionCost(A[i - 1], B[j - 1])) {
      i--;
      j--;
    } else if (i > 0 && dp[i][j] === dp[i - 1][j] + gapScore) {
      i--;
    } else {
      j--;
    }
  }

  return dp[n][m];
}

// rowOffset and colOffset say where this subproblem sits in the full table, so
// a local index (i, j) is drawn at (rowOffset + i, colOffset + j).
export function hirschberg(A, B, rowOffset = 0, colOffset = 0, frames = []) {
  const n = A.length;
  const m = B.length;
  const mid = Math.floor(n / 2);

  frames.push({
    type: "updateBounds",
    r: n + 1,
    c: m + 1,
    rowOffset,
    colOffset,
    // The renderer needs the split row to know which stale rows it may erase.
    // Deriving it from the row count is off by one whenever n is odd.
    midRow: rowOffset + mid,
  });

  if (n === 0 && m === 0) return frames;

  // This also covers strips where one sequence has run out. Those have to be
  // walked cell by cell so the highlighted path stays connected.
  if (n <= 1 || m <= 1) {
    hirschbergBaseCase(A, B, rowOffset, colOffset, frames);
    return frames;
  }

  const forward = hirschbergForward(A.slice(0, mid), B, rowOffset, colOffset, frames);
  const backward = hirschbergBackward(A.slice(mid), B, rowOffset + mid, colOffset, frames);
  const split = findSplitColumn(forward, backward).index;

  // The split cell is the only result of this round that survives. The board
  // is wiped for the next subproblem.
  frames.push({ type: "highlight", r: rowOffset + mid, c: colOffset + split });
  frames.push({ type: "clearTable" });

  hirschberg(A.slice(0, mid), B.slice(0, split), rowOffset, colOffset, frames);
  hirschberg(A.slice(mid), B.slice(split), rowOffset + mid, colOffset + split, frames);

  return frames;
}

// The page highlights both corners as soon as Align is pressed, so drop the
// frames that would highlight them again, along with any repeats.
export function dedupeHighlights(frames, rows, cols) {
  const seen = new Set();

  return frames.filter((f) => {
    if (f.type !== "highlight") return true;
    const key = `${f.r},${f.c}`;
    const isCorner = (f.r === 0 && f.c === 0) || (f.r === rows - 1 && f.c === cols - 1);
    if (seen.has(key) || isCorner) return false;
    seen.add(key);
    return true;
  });
}

// Everything the animation needs for one alignment.
export function generateFrames(seqA, seqB) {
  const frames = hirschberg(seqA, seqB);
  return dedupeHighlights(frames, seqA.length + 1, seqB.length + 1);
}

// ---------------------------------------------------------------------------
// Playing frames onto a board
// ---------------------------------------------------------------------------

// `bounds` is the subproblem currently being drawn. lastRow is the last row a
// setCell touched, which planRowClear uses to notice when a new row starts.
function createBounds() {
  return { nrows: 0, ncols: 0, rowOffset: 0, colOffset: 0, midRow: 0, lastRow: -1 };
}

export function createBoard(rows, cols) {
  return {
    table: Array.from({ length: rows }, () => Array(cols).fill("")),
    highlights: Array.from({ length: rows }, () => Array(cols).fill(false)),
    bounds: createBounds(),
  };
}

// Which row (if any) has gone stale and can be erased now that `frame` has
// been drawn. Returns -1 when nothing should be cleared.
//
// The two passes crawl toward each other, so only a small window of rows stays
// on screen: going down, the row two above is dropped; coming up, the row two
// below. Everything is measured against bounds.midRow, the row where the passes
// meet, because its values have to survive until the sumCell frames land on it.
export function planRowClear(frame, bounds) {
  const { rowOffset, colOffset, ncols, midRow } = bounds;
  let clearRow = -1;

  if (frame.type === "setCell") {
    if (frame.r !== bounds.lastRow) {
      bounds.lastRow = frame.r;
      clearRow = frame.r <= midRow
        ? frame.r - 2  // forward pass, walking down
        : frame.r + 2; // backward pass, walking up
    }

    const forwardPassFinished = frame.r === midRow && frame.c === colOffset + ncols - 1;
    if (forwardPassFinished) clearRow = frame.r - 1;

    const rowBelowSplitFinished = frame.r === midRow + 1 && frame.c === colOffset;
    if (rowBelowSplitFinished) clearRow = frame.r + 1;
  } else if (frame.type === "sumCell") {
    const splitRowFinished = frame.r === midRow && frame.c === colOffset;
    if (splitRowFinished) clearRow = frame.r + 1;
  }

  const insideSubproblem = clearRow >= rowOffset && clearRow < rowOffset + bounds.nrows;
  return insideSubproblem ? clearRow : -1;
}

// What each frame type does to the board. The page and the tests both call this,
// so the meaning of a frame is defined in exactly one place.
export function applyFrame(board, frame) {
  const { table, highlights } = board;

  switch (frame.type) {
    case "setCell":
      table[frame.r][frame.c] = frame.value;
      clearStaleRow(board, frame);
      break;
    case "sumCell":
      table[frame.r][frame.c] += frame.value;
      clearStaleRow(board, frame);
      break;
    case "updateBounds":
      board.bounds = {
        nrows: frame.r,
        ncols: frame.c,
        rowOffset: frame.rowOffset,
        colOffset: frame.colOffset,
        midRow: frame.midRow,
        lastRow: -1,
      };
      break;
    case "highlight":
      highlights[frame.r][frame.c] = true;
      break;
    case "clearTable":
      for (const row of table) row.fill("");
      break;
  }
}

function clearStaleRow(board, frame) {
  const row = planRowClear(frame, board.bounds);
  if (row < 0) return;
  const { colOffset, ncols } = board.bounds;
  board.table[row].fill("", colOffset, colOffset + ncols);
}

// Replays a frame list headlessly so tests can inspect the board after every
// frame. For sumCell frames, `before` is the value the cell held beforehand.
export function renderFrames(frames, rows, cols, onFrame) {
  const board = createBoard(rows, cols);

  frames.forEach((frame, index) => {
    const before = frame.type === "sumCell" ? board.table[frame.r][frame.c] : undefined;
    applyFrame(board, frame);
    onFrame?.({ index, frame, table: board.table, highlights: board.highlights, bounds: board.bounds, before });
  });

  return { table: board.table, highlights: board.highlights };
}

// ---------------------------------------------------------------------------
// Helpers the tests use to check the result
// ---------------------------------------------------------------------------

// The alignment path as [row, col] pairs, in order. The two corners are always
// on it whether or not a frame highlighted them.
export function extractPath(frames, rows, cols) {
  const { highlights } = renderFrames(frames, rows, cols);
  highlights[0][0] = true;
  highlights[rows - 1][cols - 1] = true;
  return pathCells(highlights);
}

// The path only moves down and/or right, so a row-major sweep visits its cells
// in path order.
export function pathCells(highlights) {
  const cells = [];
  highlights.forEach((row, r) => row.forEach((on, c) => on && cells.push([r, c])));
  return cells;
}

// Turns a path through the table into the alignment it represents.
export function alignmentFromPath(path, A, B) {
  let alignedA = "";
  let alignedB = "";
  let cost = 0;

  for (let k = 1; k < path.length; k++) {
    const [r0, c0] = path[k - 1];
    const [r1, c1] = path[k];
    const down = r1 - r0;
    const right = c1 - c0;

    if (down === 1 && right === 1) {
      alignedA += A[r0];
      alignedB += B[c0];
      cost += substitutionCost(A[r0], B[c0]);
    } else if (down === 1 && right === 0) {
      alignedA += A[r0];
      alignedB += "-";
      cost += gapScore;
    } else if (down === 0 && right === 1) {
      alignedA += "-";
      alignedB += B[c0];
      cost += gapScore;
    } else {
      throw new Error(`path jumps from ${r0},${c0} to ${r1},${c1}, which is not a single step`);
    }
  }

  return { alignedA, alignedB, cost };
}

// Plain Needleman-Wunsch edit distance, the reference the Hirschberg result is
// checked against.
export function editDistance(A, B) {
  let prev = Array.from({ length: B.length + 1 }, (_, j) => j * gapScore);
  let curr = Array(B.length + 1).fill(0);

  for (let i = 1; i <= A.length; i++) {
    curr[0] = i * gapScore;
    for (let j = 1; j <= B.length; j++) {
      curr[j] = Math.min(
        prev[j] + gapScore,
        curr[j - 1] + gapScore,
        prev[j - 1] + substitutionCost(A[i - 1], B[j - 1])
      );
    }
    [prev, curr] = [curr, prev];
  }

  return prev[B.length];
}
