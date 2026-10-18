# Hirschberg algorithm explainer

An animated, in-browser explanation of
[Hirschberg's algorithm](https://en.wikipedia.org/wiki/Hirschberg%27s_algorithm).
Hirschberg finds an optimal sequence alignment in `O(nm)` time and only
`O(n + m)` space. Plain Needleman-Wunsch needs `O(nm)` space for the same
answer.

I built it for CAP5510 (Bioinformatics). Most explanations of this algorithm are
pseudocode. Here you watch the two linear-space passes move toward each other,
meet at the split row, fix one cell of the alignment path, and recurse.

It is a static Svelte + Vite site with no backend.

## Running it

```bash
npm install
npm run dev
```

Then open the URL Vite prints (usually <http://localhost:5173>).

```bash
npm run build     # static bundle into dist/
npm run preview   # serve the built bundle
npm run deploy    # publish dist/ to the gh-pages branch
```

Each input takes up to 20 bases. Only A, C, G, T, and U are accepted, so RNA
works too. Anything else is dropped as you type, with a short note saying why.
The cap keeps the table on screen and a full run under about three minutes.

## Tests

The tests run on [Vitest](https://vitest.dev/). The page tests mount the real
component into [jsdom](https://github.com/jsdom/jsdom), a fake browser DOM, so
no real browser is needed.

```bash
npm test             # run everything once
npm run test:watch   # rerun on save
```

`tests/hirschberg.test.js` checks the algorithm against a plain
Needleman-Wunsch reference.

- **The two passes.** The forward pass returns prefix distances and the
  backward pass returns suffix distances. They agree on the total at the split
  column, and each writes only its own rectangle of the table.
- **The alignment.** The highlighted path is connected, with every step one
  cell down, right, or diagonal. It runs corner to corner, scores exactly the
  edit distance, and gives back the original sequences when the gaps are
  removed. This is checked over named cases, textbook pairs like
  `kitten`/`sitting`, 500 seeded random pairs, and 25 longer ones.
- **Edge cases.** Empty sequences, single characters, identical sequences,
  sequences with nothing in common, and lopsided lengths.
- **What the frames draw.** Every number written is the correct DP value for
  its cell. Nothing lands outside the table, and each path cell is highlighted
  once. The split row still holds its forward scores when the backward pass adds
  to them. The board never shows more than three rows while the passes run,
  which is the linear-space claim made visible.
- **`planRowClear`.** The function that decides which rows the animation
  erases, tested at each hand-off point between the passes.

`tests/App.test.js` mounts `App.svelte` and clicks its buttons, with fake timers
standing in for the playback delay.

- Every press of ⏭ leaves the page showing exactly what the headless replay
  (`renderFrames`) says it should, cell for cell.
- ⏮ retraces every ⏭ exactly, back to the start.
- Playing through draws the optimal path and the white line over it.
- Pause, resume, Align again, and Clear all leave the page in the right state.
- The split row shows forward + backward on the page for odd-length sequences
  too.
- Editing a sequence mid-animation resets the grid without crashing.
- Restarting playback (pause then play, Align mid-run, step then play) never
  leaves a second playback loop running.
- Input checks drop letters other than A, C, G, T, and U, cap sequences at 20
  bases, and widen the box as the sequence grows.

Any error thrown inside a click handler or timer fails the test, even though it
never reaches the test code directly.

Every random case is seeded (`makeRng` in `tests/helpers.js`), and a failing
assertion names the exact sequence pair, so failures reproduce.

## Layout

| Path | What it is |
| --- | --- |
| `src/lib/hirschberg.js` | The algorithm and the frame logic. Plain JavaScript with no Svelte or DOM code. The tests import it. |
| `src/App.svelte` | The inputs, the DP grid, the playback controls, and the path overlay. |
| `src/Article.svelte` | The written explainer below the animation. |
| `tests/hirschberg.test.js` | Algorithm and frame tests. |
| `tests/App.test.js` | Page tests. Mounts `App.svelte` and drives its buttons. |
| `tests/helpers.js` | Shared test cases and the seeded random generator. |

### How the animation works

`src/lib/hirschberg.js` does not return an alignment directly. It runs the
algorithm and records each step as a **frame**.

| Frame | Meaning |
| --- | --- |
| `setCell` | Write a DP value into a cell. |
| `sumCell` | Add a backward score onto the forward score already in the cell. |
| `updateBounds` | Switch to a new sub-rectangle, and say which row inside it is the split row. |
| `highlight` | Mark a cell as a confirmed point on the alignment path. |
| `clearTable` | Wipe the board before the next subproblem. |

What each frame does to the board is defined once, in `applyFrame()`. The
component calls it on a timer. The tests call it headlessly through
`renderFrames()` and inspect the resulting board. So the tests check the same
code the user sees, not a parallel implementation of it.

## A bug worth knowing about

The animation erases rows as the passes move past them. That erasure is the
point of the picture, because it is the memory Needleman-Wunsch would still be
holding. To know which rows are safe to erase, the renderer needs the **split
row**. That is the row where the forward and backward passes meet, and its
values have to survive until the backward pass adds to them.

An earlier version computed the split row from the sub-rectangle's row count.

```js
Math.floor(local_nrows / 2)   // local_nrows === n + 1
```

The algorithm splits at `mid = Math.floor(n / 2)`. The two agree when `n` is
even and differ by one when `n` is odd. For odd-height regions, the renderer
erased the forward pass's last row too early. When the `sumCell` frames arrived,
the numbers they should have added to were gone. The split row showed the
backward score alone, which hid the main idea the animation exists to show:
forward + backward is the cost of the best path through that cell.

Every region with an odd number of rows was affected, including sub-regions of
an even-length input. The default demo (`AGTACGCA` / `TATGC`) happened to work,
which is why nobody noticed.

The fix is that each `updateBounds` frame now carries `midRow`, computed from
the same `mid` the recursion splits on. The renderer measures everything against
that value instead of working it out again.

The final alignment was always correct. The split-point search, the recursion,
the gold path, and the white line were all right. Only the intermediate display
was wrong.

### Other fixes

- **Stepping back crashed.** `clearAll()` emptied the frame list, and
  `stepBackward()` called it and then tried to replay frames from the empty
  list. Clearing the board and dropping the frames are now separate.
- **Stepping past either end crashed.** Both step handlers skipped
  `updateBounds` frames with an unguarded loop that could run off either end of
  the array.
- **Editing a sequence mid-animation crashed.** The queued frames still pointed
  into the old, larger table. Editing an input now drops the frames, and the
  grid is always rebuilt at the current size.
- **Degenerate strips left gaps in the path.** A region with zero rows returned
  without highlighting anything, so the drawn path jumped several cells at once.
- **Restarting playback ran it at double speed.** Pausing and resuming within
  one frame's delay started a second playback loop while the first was still
  asleep. Each `play()` call now takes a run number, and an outdated loop quits.
- **Editing a sequence right after a sum pulse crashed.** A timer turns the
  pulse off 200ms later. If the grid shrank in the meantime, the timer wrote
  into a row that no longer existed. It now checks that the row is there.
- **Stepping back replayed the gold pulse.** The replay re-ran every sum pulse,
  and when those ended the gold cells restarted their animation. Replays no
  longer animate.

## References

- Hirschberg, D. S. (1975). "A linear space algorithm for computing maximal
  common subsequences." *Communications of the ACM*, 18(6), 341-343.
- Myers, E. W. & Miller, W. (1988). "Optimal alignments in linear space."
  *CABIOS*, 4(1), 11-17.
