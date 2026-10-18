// Tests for the page itself: App.svelte mounted into a fake DOM (jsdom), driven
// by clicking its buttons, with fake timers standing in for the playback delay.
//
// The algorithm tests replay frames headlessly through renderFrames(). Most
// tests here check that the page shows exactly what that headless replay
// says it should, at every step, so the two can't quietly drift apart.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { tick } from "svelte";

import App from "../src/App.svelte";
import { editDistance, extractPath, generateFrames, renderFrames } from "../src/lib/hirschberg.js";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

// Errors thrown inside click handlers or timers don't reach the test on their
// own; jsdom reports them to window instead. Collect them and fail on any.
let pageErrors = [];
const onError = (e) => pageErrors.push(e.error ?? e.message);

beforeEach(() => {
  vi.useFakeTimers();
  pageErrors = [];
  window.addEventListener("error", onError);
});

afterEach(async () => {
  // Let any pending timers fire, so an error they throw is caught here.
  await vi.runAllTimersAsync();
  window.removeEventListener("error", onError);
  cleanup();
  vi.useRealTimers();
  expect(pageErrors).toEqual([]);
});

function mount(seqA = "AGTACGCA", seqB = "TATGC") {
  const result = render(App, { props: { seqA, seqB } });
  const button = (name) => screen.getByRole("button", { name });
  return {
    ...result,
    align: () => fireEvent.click(button("Align")),
    // The play/pause button's label flips between ▶ and ⏸.
    playPause: () => fireEvent.click(screen.getByRole("button", { name: /^[▶⏸]/ })),
    playLabel: () => screen.getByRole("button", { name: /^[▶⏸]/ }).textContent.trim(),
    forward: () => fireEvent.click(button("⏭")),
    back: () => fireEvent.click(button("⏮")),
    clear: () => fireEvent.click(button("Clear")),
    input: (id) => result.container.querySelector(`#${id}`),
  };
}

// The DP grid as text, skipping each row's letter header.
function bodyCells(container) {
  return [...container.querySelectorAll("#dpTable tbody tr")].map((tr) => [...tr.querySelectorAll("td")].slice(1));
}

function readBoard(container) {
  return bodyCells(container).map((row) => row.map((td) => td.textContent.trim()));
}

// Gold cells on the alignment path carry the on-path class.
function readHighlights(container) {
  const cells = [];
  bodyCells(container).forEach((row, r) =>
    row.forEach((td, c) => {
      if (td.classList.contains("on-path")) cells.push([r, c]);
    })
  );
  return cells;
}

// What the board should look like after the first `count` frames, according
// to the headless renderer. The page draws both corners as soon as Align is
// pressed, so add those.
function expectedAfter(frames, count, rows, cols) {
  const { table, highlights } = renderFrames(frames.slice(0, count), rows, cols);
  if (rows > 0 && cols > 0) {
    highlights[0][0] = true;
    highlights[rows - 1][cols - 1] = true;
  }
  const cells = [];
  highlights.forEach((row, r) => row.forEach((on, c) => on && cells.push([r, c])));
  return { board: table.map((row) => row.map((v) => String(v))), highlights: cells };
}

// How far through the frame list the page is: the first frame count whose
// headless replay matches what's on screen.
function progress(page, frames, rows, cols) {
  const now = JSON.stringify({ board: readBoard(page.container), highlights: readHighlights(page.container) });
  for (let k = 0; k <= frames.length; k++) {
    if (JSON.stringify(expectedAfter(frames, k, rows, cols)) === now) return k;
  }
  throw new Error("the page doesn't match any point in the animation");
}

// Where each press of ⏭ lands, starting just after the first frame (Align
// plays frame 0 before it can be paused). Stepping runs straight past
// updateBounds frames, since they change nothing on screen.
function stepPositions(frames) {
  const positions = [1];
  let p = 1;
  while (p < frames.length) {
    while (p < frames.length) {
      const f = frames[p++];
      if (f.type !== "updateBounds") break;
    }
    positions.push(p);
  }
  return positions;
}

// Press Align, then pause right away, leaving the board after frame 0.
async function alignPaused(page) {
  await page.align();
  await page.playPause();
  await vi.runAllTimersAsync();
}

// ---------------------------------------------------------------------------
// The page before anything runs
// ---------------------------------------------------------------------------

describe("initial page", () => {
  test("draws an (|A|+1) x (|B|+1) grid with the letters as headers", () => {
    const { container } = mount("GATTACA", "TATGC");

    const board = readBoard(container);
    expect(board).toHaveLength(8);
    for (const row of board) expect(row).toHaveLength(6);

    const top = [...container.querySelectorAll("#dpTable thead td")].map((td) => td.textContent.trim());
    expect(top).toEqual(["", "—", ..."TATGC"]);

    const left = [...container.querySelectorAll("#dpTable tbody tr")].map((tr) => tr.querySelector("td").textContent.trim());
    expect(left).toEqual(["—", ..."GATTACA"]);
  });

  test("starts empty, unhighlighted and stopped", () => {
    const page = mount();
    expect(readBoard(page.container).flat().every((v) => v === "")).toBe(true);
    expect(readHighlights(page.container)).toEqual([]);
    expect(page.playLabel()).toBe("▶");
    expect(page.container.querySelector("#svgOverlay polyline")).toBeNull();
  });

  test("typing a sequence resizes the grid and uppercases it", async () => {
    const page = mount("AGTACGCA", "TATGC");

    await fireEvent.input(page.input("seqA"), { target: { value: "gat" } });
    await fireEvent.input(page.input("seqB"), { target: { value: "ac" } });

    expect(readBoard(page.container)).toHaveLength(4);
    expect(readBoard(page.container)[0]).toHaveLength(3);
    const left = [...page.container.querySelectorAll("#dpTable tbody tr")].map((tr) => tr.querySelector("td").textContent.trim());
    expect(left).toEqual(["—", "G", "A", "T"]);
  });

  test("the step buttons do nothing before Align is pressed", async () => {
    const page = mount();
    await page.forward();
    await page.back();
    await page.playPause();
    expect(readBoard(page.container).flat().every((v) => v === "")).toBe(true);
    expect(page.playLabel()).toBe("▶");
  });
});

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

describe("input validation", () => {
  const notice = (page) => page.container.querySelector(".input-notice").textContent;

  test("drops anything that isn't A, C, G, T or U, and says why", async () => {
    const page = mount();
    await fireEvent.input(page.input("seqA"), { target: { value: "ga t-x7\nu" } });

    expect(page.input("seqA").value).toBe("GATU");
    expect(notice(page)).toMatch(/only a, c, g, t and u/i);

    await vi.advanceTimersByTimeAsync(3000);
    expect(notice(page)).toBe("");
  });

  test("caps sequences at 20 bases", async () => {
    const page = mount();
    await fireEvent.input(page.input("seqB"), { target: { value: "ACGT".repeat(6) } });

    expect(page.input("seqB").value).toBe("ACGT".repeat(5));
    // 20 bases plus the leading gap column.
    expect(readBoard(page.container)[0]).toHaveLength(21);
    expect(notice(page)).toMatch(/capped at 20/);
  });

  test("valid typing shows no notice", async () => {
    const page = mount();
    await fireEvent.input(page.input("seqA"), { target: { value: "acgu" } });
    expect(page.input("seqA").value).toBe("ACGU");
    expect(notice(page)).toBe("");
  });

  test("bad props are cleaned too", () => {
    const page = mount("AC GTN", "uu");
    expect(page.input("seqA").value).toBe("ACGT");
    expect(page.input("seqB").value).toBe("UU");
  });

  test("the box widens with the sequence", async () => {
    const page = mount();
    const chars = () => Number(page.input("seqA").style.getPropertyValue("--chars"));

    await fireEvent.input(page.input("seqA"), { target: { value: "A" } });
    const short = chars();
    await fireEvent.input(page.input("seqA"), { target: { value: "A".repeat(15) } });

    expect(chars()).toBeGreaterThan(short);
  });
});

// ---------------------------------------------------------------------------
// Playing the animation through
// ---------------------------------------------------------------------------

describe("playback", () => {
  test.each([
    ["AGTACGCA", "TATGC"],
    ["GATTACA", "TATGC"],
    ["ACGT", "A"],
    ["A", "ACGT"],
    ["ACGT", "ACGT"],
  ])("%s / %s plays to the end and leaves the optimal path drawn", async (A, B) => {
    const page = mount(A, B);
    const frames = generateFrames(A, B);
    const path = extractPath(frames, A.length + 1, B.length + 1);

    await page.align();
    expect(page.playLabel()).toBe("⏸");
    await vi.runAllTimersAsync();

    expect(page.playLabel()).toBe("▶");
    expect(readHighlights(page.container)).toEqual(path);
    expect(readBoard(page.container)).toEqual(expectedAfter(frames, frames.length, A.length + 1, B.length + 1).board);

    // The white line over the grid joins up every path cell, in order.
    const polyline = page.container.querySelector("#svgOverlay polyline");
    expect(polyline).not.toBeNull();
    expect(polyline.getAttribute("points").trim().split(/\s+/)).toHaveLength(path.length);
  });

  test("pausing stops the board changing, and resuming finishes the job", async () => {
    const A = "AGTACGCA";
    const B = "TATGC";
    const page = mount(A, B);

    await page.align();
    await vi.advanceTimersByTimeAsync(2000);
    await page.playPause();
    expect(page.playLabel()).toBe("▶");

    const paused = readBoard(page.container);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(readBoard(page.container)).toEqual(paused);

    await page.playPause();
    await vi.runAllTimersAsync();
    const frames = generateFrames(A, B);
    expect(readHighlights(page.container)).toEqual(extractPath(frames, A.length + 1, B.length + 1));
  });

  // If the old playback loop is still asleep when a new one starts, it wakes
  // up, sees `playing` is true again, and carries on: two loops stepping the
  // same animation, so it runs at double speed. Compare how far an
  // interrupted page gets in 3 seconds against an untouched one.
  describe("restarting playback doesn't leave a second loop running", () => {
    const A = "AGTACGCA";
    const B = "TATGC";
    const frames = generateFrames(A, B);

    async function framesPlayedIn3s(interrupt) {
      const page = mount(A, B);
      await page.align();
      await vi.advanceTimersByTimeAsync(1000);
      await interrupt(page);
      const start = progress(page, frames, A.length + 1, B.length + 1);
      await vi.advanceTimersByTimeAsync(3000);
      const end = progress(page, frames, A.length + 1, B.length + 1);
      cleanup();
      return end - start;
    }

    test.each([
      ["pause then play", async (page) => { await page.playPause(); await page.playPause(); }],
      ["Align mid-run", (page) => page.align()],
      ["step then play", async (page) => { await page.forward(); await page.playPause(); }],
    ])("%s", async (_, interrupt) => {
      const untouched = await framesPlayedIn3s(async () => {});
      const interrupted = await framesPlayedIn3s(interrupt);

      expect(untouched).toBeGreaterThan(5);
      // Resuming applies one frame straight away, so allow a little slack.
      expect(interrupted).toBeLessThanOrEqual(untouched + 2);
    });
  });

  test("pressing Align again restarts from a clean board", async () => {
    const A = "GATTACA";
    const B = "TATGC";
    const page = mount(A, B);

    await page.align();
    await vi.runAllTimersAsync();
    const first = { board: readBoard(page.container), highlights: readHighlights(page.container) };

    await page.align();
    const restarted = expectedAfter(generateFrames(A, B), 1, A.length + 1, B.length + 1);
    expect(readBoard(page.container)).toEqual(restarted.board);
    expect(readHighlights(page.container)).toEqual(restarted.highlights);
    expect(page.container.querySelector("#svgOverlay polyline")).toBeNull();

    await vi.runAllTimersAsync();
    expect({ board: readBoard(page.container), highlights: readHighlights(page.container) }).toEqual(first);
  });

  test("Clear wipes the board, the highlights and the path line", async () => {
    const page = mount();
    await page.align();
    await vi.runAllTimersAsync();

    await page.clear();
    expect(readBoard(page.container).flat().every((v) => v === "")).toBe(true);
    expect(readHighlights(page.container)).toEqual([]);
    expect(page.container.querySelector("#svgOverlay polyline")).toBeNull();
    expect(page.playLabel()).toBe("▶");

    // And there's nothing left to play.
    await page.playPause();
    await page.forward();
    expect(readBoard(page.container).flat().every((v) => v === "")).toBe(true);
  });

  test("two empty sequences align without crashing", async () => {
    const page = mount("", "");
    await page.align();
    await vi.runAllTimersAsync();
    expect(page.playLabel()).toBe("▶");
    expect(readHighlights(page.container)).toEqual([[0, 0]]);
  });
});

// ---------------------------------------------------------------------------
// Stepping, checked against the headless replay at every position
// ---------------------------------------------------------------------------

describe("stepping", () => {
  const pairs = [
    ["AGTACGCA", "TATGC"], // the default example
    ["GATTACA", "TATGC"], // odd |A|: the split row sits off-centre
    ["ACGTAC", "TATGC"], // even |A| with odd-height sub-regions
  ];

  test.each(pairs)("%s / %s: every ⏭ shows exactly what the frames say", async (A, B) => {
    const page = mount(A, B);
    const frames = generateFrames(A, B);
    const rows = A.length + 1;
    const cols = B.length + 1;

    await alignPaused(page);

    for (const [k, position] of stepPositions(frames).entries()) {
      if (k > 0) await page.forward();
      const expected = expectedAfter(frames, position, rows, cols);
      expect(readBoard(page.container), `board after frame ${position}`).toEqual(expected.board);
      expect(readHighlights(page.container), `highlights after frame ${position}`).toEqual(expected.highlights);
    }

    // The last step draws the path line.
    expect(page.container.querySelector("#svgOverlay polyline")).not.toBeNull();
  });

  test.each(pairs)("%s / %s: ⏮ retraces every ⏭ exactly", async (A, B) => {
    const page = mount(A, B);
    await alignPaused(page);

    const snapshots = [];
    const snap = () => ({ board: readBoard(page.container), highlights: readHighlights(page.container) });
    const steps = stepPositions(generateFrames(A, B)).length - 1;

    snapshots.push(snap());
    for (let k = 0; k < steps; k++) {
      await page.forward();
      snapshots.push(snap());
    }

    for (let k = steps - 1; k >= 0; k--) {
      await page.back();
      expect(snap(), `after stepping back to step ${k}`).toEqual(snapshots[k]);
    }

    // Stepping back off the end of the path removes the line.
    expect(page.container.querySelector("#svgOverlay polyline")).toBeNull();
  });

  test("stepping past either end is harmless", async () => {
    const A = "GATTACA";
    const B = "TATGC";
    const page = mount(A, B);
    const frames = generateFrames(A, B);
    const steps = stepPositions(frames).length - 1;

    await alignPaused(page);
    for (let k = 0; k < steps + 5; k++) await page.forward();
    expect(readHighlights(page.container)).toEqual(extractPath(frames, A.length + 1, B.length + 1));

    for (let k = 0; k < steps + 5; k++) await page.back();
    const start = expectedAfter(frames, 0, A.length + 1, B.length + 1);
    expect(readBoard(page.container)).toEqual(start.board);
    expect(readHighlights(page.container)).toEqual(start.highlights);
  });

  test("stepping pauses a running animation", async () => {
    const page = mount();
    await page.align();
    await vi.advanceTimersByTimeAsync(1000);
    await page.forward();
    expect(page.playLabel()).toBe("▶");

    const board = readBoard(page.container);
    await vi.advanceTimersByTimeAsync(5000);
    expect(readBoard(page.container)).toEqual(board);
  });

  // The key picture the animation exists to show: where the passes meet, each
  // cell holds forward + backward = the cost of the best path through it.
  test("the split row shows forward + backward on the page, for odd |A| too", async () => {
    const A = "GATTACA";
    const B = "TATGC";
    const mid = Math.floor(A.length / 2);
    const page = mount(A, B);
    const frames = generateFrames(A, B);
    const positions = stepPositions(frames);

    await alignPaused(page);

    let checked = 0;
    for (const [k, position] of positions.entries()) {
      if (k > 0) await page.forward();
      const last = frames[position - 1];
      // Only the top-level split row: the first sumCell frames, before the
      // first highlight.
      if (last.type !== "sumCell" || frames.slice(0, position).some((f) => f.type === "highlight")) continue;

      const cell = bodyCells(page.container)[last.r][last.c];
      const through = editDistance(A.slice(0, mid), B.slice(0, last.c)) + editDistance(A.slice(mid), B.slice(last.c));
      expect(cell.textContent.trim(), `column ${last.c}`).toBe(String(through));
      expect(cell.classList.contains("sum-pulse"), `column ${last.c} pulses`).toBe(true);
      checked++;
    }
    expect(checked).toBe(B.length + 1);
  });

  test("the sum pulse wears off", async () => {
    const A = "AGTACGCA";
    const B = "TATGC";
    const page = mount(A, B);
    const frames = generateFrames(A, B);

    await alignPaused(page);
    for (const [k, position] of stepPositions(frames).entries()) {
      if (k === 0) continue;
      await page.forward();
      if (frames[position - 1].type === "sumCell") break;
    }

    expect(page.container.querySelectorAll(".sum-pulse")).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(250);
    await tick();
    expect(page.container.querySelectorAll(".sum-pulse")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Editing the inputs while the animation is running
// ---------------------------------------------------------------------------

describe("editing mid-animation", () => {
  test("shrinking a sequence mid-run stops playback and resets the grid", async () => {
    const page = mount("AGTACGCA", "TATGC");
    await page.align();
    await vi.advanceTimersByTimeAsync(2000);

    await fireEvent.input(page.input("seqA"), { target: { value: "GA" } });
    await vi.advanceTimersByTimeAsync(10_000);

    expect(page.playLabel()).toBe("▶");
    expect(readBoard(page.container)).toEqual([
      ["", "", "", "", "", ""],
      ["", "", "", "", "", ""],
      ["", "", "", "", "", ""],
    ]);
    expect(readHighlights(page.container)).toEqual([]);

    // The stale frames are gone, so the buttons don't replay them.
    await page.forward();
    await page.playPause();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(readBoard(page.container).flat().every((v) => v === "")).toBe(true);
  });

  test("shrinking a sequence right after a sum pulse starts doesn't crash", async () => {
    // The pulse is switched off by a timer 200ms later, which writes into the
    // grid. If the grid shrank in the meantime, that write lands on a row
    // that no longer exists.
    const A = "AGTACGCA";
    const B = "TATGC";
    const page = mount(A, B);
    const frames = generateFrames(A, B);

    await alignPaused(page);
    for (const [k, position] of stepPositions(frames).entries()) {
      if (k === 0) continue;
      await page.forward();
      if (frames[position - 1].type === "sumCell") break;
    }

    await fireEvent.input(page.input("seqA"), { target: { value: "G" } });
    await vi.advanceTimersByTimeAsync(500);
    // afterEach fails the test if the timer threw.
  });

  test("a new alignment after editing uses the new sequences", async () => {
    const page = mount("AGTACGCA", "TATGC");
    await page.align();
    await vi.advanceTimersByTimeAsync(1500);

    await fireEvent.input(page.input("seqA"), { target: { value: "gattaca" } });
    await page.align();
    await vi.runAllTimersAsync();

    const frames = generateFrames("GATTACA", "TATGC");
    expect(readHighlights(page.container)).toEqual(extractPath(frames, 8, 6));
  });
});
