<script>
  import { onDestroy, tick } from "svelte";
  import Article from "./Article.svelte";
  import { applyFrame, createBoard, generateFrames, pathCells } from "./lib/hirschberg.js";

  export let seqA = "AGTACGCA";
  export let seqB = "TATGC";

  // ---------------------------------------------------------------------------
  // Input checks
  // ---------------------------------------------------------------------------

  // Longer sequences make the table too wide for the page and the animation
  // run for minutes.
  const MAX_LEN = 20;

  // Nucleotides only (U so RNA works too). Anything else is dropped.
  const cleanSeq = (seq) => seq.toUpperCase().replace(/[^ACGTU]/g, "").slice(0, MAX_LEN);

  $: seqA = cleanSeq(seqA);
  $: seqB = cleanSeq(seqB);

  // Tells the user why a keystroke didn't show up. This reads the raw input,
  // before cleanSeq strips it.
  let inputNotice = "";
  let noticeTimer;
  function explainRejectedInput(event) {
    const raw = event.target.value.toUpperCase();
    if (/[^ACGTU]/.test(raw)) inputNotice = "Only A, C, G, T and U are allowed.";
    else if (raw.length > MAX_LEN) inputNotice = `Sequences are capped at ${MAX_LEN} bases.`;
    else return;
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => (inputNotice = ""), 2500);
  }

  // The box grows with the sequence but is never narrower than the placeholder.
  const boxWidthInChars = (seq) => Math.max(seq.length, 8) + 1;

  // ---------------------------------------------------------------------------
  // The board
  // ---------------------------------------------------------------------------

  // One extra row and column for the empty prefix.
  $: rows = seqA.length + 1;
  $: cols = seqB.length + 1;

  // Recreated whenever the sequences change size, so the grid can never be
  // indexed against old dimensions.
  $: board = createBoard(rows, cols);
  $: pulsing = Array.from({ length: rows }, () => Array(cols).fill(false));

  function resetBoard({ withCorners }) {
    board = createBoard(rows, cols);
    pulsing = Array.from({ length: rows }, () => Array(cols).fill(false));
    // The two corners are always on the alignment path.
    if (withCorners) {
      board.highlights[0][0] = true;
      board.highlights[rows - 1][cols - 1] = true;
    }
    pathPoints = "";
  }

  // Replays pass animate = false. Pulsing every cell along the way would also
  // restart the gold animation on cells already on the path.
  function showFrame(index, animate = true) {
    const frame = frames[index];
    applyFrame(board, frame);
    if (animate && frame.type === "sumCell") pulse(frame.r, frame.c);
    board = board;
  }

  function pulse(r, c) {
    pulsing[r][c] = true;
    // 200ms matches the CSS animation. The grid may have shrunk by then if an
    // input was edited, so check the row still exists.
    setTimeout(() => {
      if (pulsing[r]) pulsing[r][c] = false;
    }, 200);
  }

  // ---------------------------------------------------------------------------
  // Playback
  // ---------------------------------------------------------------------------

  const FRAME_MS = 150;
  // Linger on each new path cell. updateBounds draws nothing, so don't wait on it.
  const extraDelay = { highlight: 250, updateBounds: -FRAME_MS };

  let frames = [];
  let currentFrame = 0;
  let playing = false;

  // The sequences the current frames were built from. Editing an input
  // invalidates the frames, since they hold coordinates into the old table.
  let framesFor = null;
  $: if (framesFor && (framesFor.a !== seqA || framesFor.b !== seqB)) clearAll();

  const atEnd = () => frames.length > 0 && currentFrame >= frames.length;

  function align() {
    playing = false;
    currentFrame = 0;
    resetBoard({ withCorners: true });
    frames = generateFrames(seqA, seqB);
    framesFor = { a: seqA, b: seqB };
    if (frames.length > 0) togglePlay();
  }

  function clearAll() {
    playing = false;
    frames = [];
    framesFor = null;
    currentFrame = 0;
    resetBoard({ withCorners: false });
  }

  function togglePlay() {
    if (playing) playing = false;
    else if (frames.length > 0) play();
  }

  // Each call to play() takes a new run number. A loop that was asleep when
  // playback was paused and restarted sees a newer run and quits, instead of
  // seeing `playing` is true again and running alongside the new loop.
  let playRun = 0;

  // A loop still asleep when the page goes away would wake up and draw into
  // elements that no longer exist.
  onDestroy(() => playRun++);

  async function play() {
    const run = ++playRun;
    playing = true;

    while (playing && run === playRun && currentFrame < frames.length) {
      const frame = frames[currentFrame];
      showFrame(currentFrame++);
      await tick();
      await new Promise((resolve) => setTimeout(resolve, FRAME_MS + (extraDelay[frame.type] ?? 0)));
    }

    if (run === playRun && atEnd()) {
      playing = false;
      drawPath();
    }
  }

  // updateBounds frames change nothing on screen, so one click steps past them
  // instead of appearing to do nothing.
  function stepForward() {
    playing = false;
    while (currentFrame < frames.length) {
      const frame = frames[currentFrame];
      showFrame(currentFrame++);
      if (frame.type !== "updateBounds") break;
    }
    if (atEnd()) drawPath();
  }

  // A frame can't be undone, so stepping back replays from the start up to the
  // previous position.
  function stepBackward() {
    playing = false;
    if (currentFrame <= 0) return;

    let target = currentFrame - 1;
    while (target > 0 && frames[target - 1].type === "updateBounds") target--;

    resetBoard({ withCorners: true });
    currentFrame = target;
    for (let i = 0; i < currentFrame; i++) showFrame(i, false);
  }

  // ---------------------------------------------------------------------------
  // The finished path, drawn as a line through the centers of the gold cells
  // ---------------------------------------------------------------------------

  let wrapperEl;
  let tableEl;
  let pathPoints = "";

  function drawPath() {
    const origin = wrapperEl.getBoundingClientRect();
    const centers = pathCells(board.highlights).map(([r, c]) => {
      // +1 skips the row's letter header.
      const cell = tableEl.tBodies[0].rows[r].cells[c + 1].getBoundingClientRect();
      return `${cell.left + cell.width / 2 - origin.left},${cell.top + cell.height / 2 - origin.top}`;
    });
    pathPoints = centers.length >= 2 ? centers.join(" ") : "";
  }
</script>

<h1>Hirschberg Algorithm Explainer</h1>

<div class="main-container">
  <div class="input-block">
    <label for="seqA">DNA Sequence A</label>
    <textarea id="seqA" bind:value={seqA} on:input={explainRejectedInput} style="--chars: {boxWidthInChars(seqA)}"
      placeholder="ACGTACGT" spellcheck="false" autocomplete="off"></textarea>
    <span class="count">{seqA.length}/{MAX_LEN}</span>
  </div>

  <div class="input-block">
    <label for="seqB">DNA Sequence B</label>
    <textarea id="seqB" bind:value={seqB} on:input={explainRejectedInput} style="--chars: {boxWidthInChars(seqB)}"
      placeholder="AGTACG" spellcheck="false" autocomplete="off"></textarea>
    <span class="count">{seqB.length}/{MAX_LEN}</span>
  </div>

  <p class="input-notice" role="status">{inputNotice}</p>

  <button on:click={align}>Align</button>

  <div class="dp-wrapper" bind:this={wrapperEl}>
    <table class="dp-table" id="dpTable" bind:this={tableEl}>
      <thead>
        <tr>
          <td></td>
          <td class="seq-header">—</td>
          {#each seqB as base}
            <td class="seq-header">{base}</td>
          {/each}
        </tr>
      </thead>
      <tbody>
        {#each Array(rows) as _, r}
          <tr>
            <td class="seq-header">{r === 0 ? "—" : seqA[r - 1]}</td>
            {#each Array(cols) as _, c}
              <td class:on-path={board.highlights[r][c]} class:sum-pulse={pulsing[r][c]}>
                {board.table[r][c]}
              </td>
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>

    <svg id="svgOverlay">
      {#if pathPoints}
        <polyline
          points={pathPoints}
          fill="none"
          stroke="white"
          stroke-width="3"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      {/if}
    </svg>
  </div>

  <div class="bottom-buttons">
    <button on:click={stepBackward}>⏮ </button>
    <button on:click={togglePlay}>{playing ? "⏸" : "▶"}</button>
    <button on:click={stepForward}>⏭ </button>
    <button on:click={clearAll}>Clear</button>
  </div>

  <Article />
</div>

<style>
  @import url("https://fonts.googleapis.com/css2?family=Architects+Daughter&display=swap");

  :global(body) {
    font-family: "Architects Daughter", cursive;
  }

  h1 {
    text-align: center;
    text-decoration: underline;
    font-size: 64px;
    margin: 30px 0 40px 0;
    letter-spacing: 2px;
  }

  .main-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 20px;
    padding: 20px;
  }

  /* Inputs */

  .input-block {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 12px;
    /* Fixed width with the label pinned left, so a growing box extends to the
       right instead of re-centering the whole row on every keystroke. */
    width: 420px;
  }
  .input-block label {
    font-weight: 600;
    font-size: 14px;
    color: #e0e0e0;
    min-width: 120px;
  }
  .input-block textarea {
    /* One character is 1ch plus the 2px letter-spacing. */
    width: calc(var(--chars) * (1ch + 2px));
    height: 15px;
    padding: 3px 6px;
    white-space: pre;
    overflow: hidden;
    resize: none;
    font-family: "Courier New", monospace;
    font-size: 14px;
    font-weight: 100;
    letter-spacing: 2px;
    text-transform: uppercase;
    color: #4ec9b0;
    background-color: #1e1e1e;
    border: 2px solid #3a3a3a;
    border-radius: 12px;
    transition: all 0.3s ease;
  }
  .input-block textarea:hover {
    border-color: #4a4a4a;
  }
  .input-block textarea:focus {
    outline: none;
    border-color: #4ec9b0;
    background-color: #252525;
    box-shadow: 0 0 20px rgba(78, 201, 176, 0.15);
  }
  .count {
    font-size: 12px;
    color: #888;
  }
  .input-notice {
    min-height: 1.4em; /* keeps the layout still when the message clears */
    margin: 0;
    font-size: 14px;
    color: #e5a04b;
  }

  /* The DP table and the path drawn over it */

  .dp-wrapper {
    position: relative;
    display: inline-block;
  }
  .dp-table {
    position: relative;
    z-index: 1;
    border-collapse: collapse;
    font-size: 18px;
    margin-top: 20px;
  }
  #svgOverlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 10;
    pointer-events: none;
  }
  td {
    border: 2px solid #333;
    width: 35px;
    height: 35px;
    text-align: center;
    vertical-align: middle;
  }
  thead td,
  .seq-header {
    font-weight: bold;
    color: black;
    background: #fafafac6;
  }

  .on-path {
    background-color: #cfb700;
    animation: pulse 0.2s ease-out forwards;
  }
  @keyframes pulse {
    0%   { background-color: #cfb700; transform: scale(1); }
    50%  { background-color: rgba(255, 217, 0, 0.805); transform: scale(1.12); }
    100% { background-color: #cfb700; transform: scale(1); }
  }

  /* Declared after .on-path so it wins on a cell that is both. */
  .sum-pulse {
    animation: sumPulse 0.1s ease-out;
  }
  @keyframes sumPulse {
    0%   { transform: scale(1);    background-color: inherit; opacity: 1; }
    50%  { transform: scale(1.15); background-color: inherit; opacity: 0.9; }
    100% { transform: scale(1);    background-color: inherit; opacity: 1; }
  }

  @media (prefers-color-scheme: light) {
    .input-block label {
      color: #333;
    }
    .input-block textarea {
      color: #146356;
      font-weight: 600;
      background-color: #ececec;
      border-color: #cfcfcf;
    }
    .input-block textarea:hover {
      border-color: #b5b5b5;
    }
    .input-block textarea:focus {
      background-color: #f4f4f4;
      border-color: #2a9d86;
      box-shadow: 0 0 20px rgba(42, 157, 134, 0.15);
    }
    .input-notice {
      color: #a35c00;
    }
  }
</style>
