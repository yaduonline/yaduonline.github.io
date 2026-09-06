# Linkgrid — Design

## Files

| File | Role |
| --- | --- |
| `index.html` | Markup, styles, script tags. No game logic. |
| `engine.js` | Pure rules. No DOM. Loaded as a global (`LinkgridEngine`) or via `require`. |
| `game.js` | UI: screens, pointer and keyboard input, canvas rendering, persistence. |
| `puzzles/index.js` | Pack manifest: size, puzzle count, count per difficulty. Loaded eagerly. |
| `puzzles/<size>.js` | One board size's hundred puzzles. Fetched when that pack is opened. |
| `solutions/<size>.js` | Reference solutions, compactly encoded. Loaded only by the tests. |
| `tools/solver.js` | Exact solver and solution counter (Node). |
| `tools/quality.js` | Bend metrics, quality gates, structural validation. |
| `tools/routes.js` | Compact route encoding shared by the build and the tests. |
| `tools/generate.js` | Partition construction and the difficulty search. |
| `tools/pool.js` | CLI: explore one board size, cache the candidates. |
| `tools/build.js` | CLI: band the pools into levels and emit the data files. |
| `tools/legacy.json` | The previous release's puzzles, kept so their ids stay valid. |
| `test/suite.js` | Test suite shared by Node and the browser. |
| `test/run.js` | Node runner, plus the solver-backed uniqueness pass. |
| `test.html` | Browser runner. |

The split exists so that the rules are testable without a DOM and the tests
exercise the same code the game runs — the previous version reimplemented the
rules inside its test page, which meant the tests could pass while the game was
broken.

## Engine model

```
game = {
  size, colors,
  endpoints[color] = [[r,c], [r,c]],   // fixed dots
  owner: Int16Array(size*size),        // colour per cell, -1 empty
  paths[color] = [[r,c], ...],         // ordered route, starts at a dot
  active: { color, before, changed } | null,
  history: [snapshot, ...],            // one entry per completed edit
  moves,
}
```

`owner` and `paths` are two views of the same fact and are kept in step by every
mutation. `owner` answers "what is in this cell" in O(1) for input handling and
solve checks; `paths` keeps the order needed for drawing and for trimming.

### Operations

- `grab(r, c)` — start an edit. On a dot, clear that colour and restart from the
  dot. Part-way along a route, keep the prefix and continue from there. Takes a
  snapshot first so the edit can be cancelled or undone.
- `stepTo(r, c)` — one orthogonal step. Retracing trims; crossing another colour
  trims that colour; another colour's dot and a closed route both refuse.
- `extendTo(r, c)` — walk towards a cell that may be several away, one legal step
  at a time, preferring the axis with the larger remaining distance. This is what
  makes a fast drag behave like a slow one.
- `release()` — end the edit. An edit that drew nothing is rolled back (so a tap
  on a dot does not wipe a finished route); an edit that drew becomes one undo
  step.
- `cancel()`, `undo()`, `restart()` — restore from snapshots.

Snapshots are a copy of `owner` plus a deep copy of `paths`: at most 100 cells,
so cloning per edit is cheaper than any incremental scheme would be to maintain.

### Solve check

A colour is connected when its route's first and last cells are its two dots. A
puzzle is solved when every colour is connected and no cell is empty.

## UI

- **Screens.** Board size → puzzle list → board, switched by toggling `hidden`.
  Focus moves to the first control of the new screen.
- **Loading.** Only the manifest ships up front, so the pack screen can show
  progress without downloading six hundred puzzles. Opening a pack pulls in that
  one size's file via a script tag; a failed fetch leaves a readable message and
  the pack can be opened again.
- **Puzzle list.** One hundred puzzles per pack, grouped into five difficulty
  sections with a solved count per section and a compact numbered chip per
  puzzle.
- **Canvas.** The board area is `min(100%, 560px, 70vh)` with `aspect-ratio: 1`,
  so it stays square at every viewport; the canvas backing store is resized to
  `cssSize × devicePixelRatio` and the context scaled to match, which keeps it
  sharp on retina displays. A `ResizeObserver` relayouts on any size change.
  Hit-testing derives the cell size from the live bounding rect, so the pointer
  always lands on the cell under it.
- **Drawing.** Routes are rounded polylines; unfinished routes are thinner and
  slightly transparent, finished ones full strength with a pale ring inside each
  dot. The head of the route in hand carries a small marker. Redraws are
  coalesced into one `requestAnimationFrame` per frame.
- **Completion.** A solved puzzle raises an overlay offering next / replay /
  puzzle list. Nothing navigates on its own.
- **Announcements.** A single visually hidden `role="status"` region carries all
  spoken feedback; the board's `aria-label` carries progress.

## Persistence

`localStorage["linkgrid-progress-v2"] = { solved: { "8": ["8-1", ...] } }`.
Reads and writes are wrapped in `try`/`catch`. The key stayed at v2 through the
expansion to one hundred puzzles per size: every id from the previous release
still points at the same puzzle, so solved markers carry over.

## Rendering palette

Twelve hues at roughly even spacing, medium saturation. Twelve is the largest
colour count any shipped puzzle uses. Colour alone never carries meaning that is
not also available as shape or text.

## Deliberate omissions

- No hash routing: the browser Back button leaves the game rather than stepping
  between screens.
- No animation beyond the redraw itself.
- No hint or auto-solve, so the solution files are never loaded by the game.
