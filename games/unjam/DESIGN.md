# Unjam — Design

## Files

| File | Role |
| --- | --- |
| `index.html` | Markup and styles. No game logic. |
| `engine.js` | Pure rules and the solver. No DOM. A global (`UnjamEngine`) or `require`. |
| `puzzles.js` | Generated puzzle data (`UNJAM_PACKS`). Do not edit by hand. |
| `game.js` | UI: screens, layout, pointer and keyboard input, persistence. |
| `tools/generate.js` | Offline generator: builds `puzzles.js` from a fixed seed. |
| `test/suite.js` | Test suite shared by Node and the browser. |
| `test/run.js` | Node runner (`--quick` skips re-solving every shipped puzzle). |
| `test.html` | Browser runner for the same suite. |
| `/tests/unjam.spec.js` | Playwright: layout budgets, mouse and touch drag, keyboard, solves, hints, routing, theme, no third-party requests. |
| `/playwright.games.config.js` | Runs that spec on its own server and port (see DECISIONS.md). |

## Puzzle encoding

A puzzle is a 36-character string, row by row: `.` is empty, `A` is the red
block, and `B`, `C`, … are the other blocks, each letter repeated over the
cells it covers.

```
....B.
....B.
AA..B.     <- exit row; the opening is to the right of the last column
.CCC..
......
......
```

→ `"....B.....B.AA..B..CCC............."`

It is readable in a diff, easy to type into a test, and it is the format the
published Rush Hour databases use, so a puzzle can be checked against them.

## Engine model

A block's shape never changes, and it only ever moves along one axis, so a
block is split into what is fixed and what moves:

```
pieces[i] = { horiz, len, line }   // line: its row if horizontal, else its column
pos[i]    = column if horizontal, row if vertical   // the only thing that moves
```

Piece 0 is always the red block. A position is just `pos`, an array of small
integers, which makes a state cheap to copy, compare and hash.

```
game = {
  puzzle,              // { id, board, min }
  pieces, start, pos,  // start is the initial pos, never mutated
  history: [ { piece, from, to } ],   // one entry per counted move
  moves,               // == history.length
  hints,
  solved,
}
```

### Operations

- `range(pieces, pos, i)` — the lowest and highest `pos[i]` the block can reach
  from where it is, found by walking outwards until a wall or an occupied cell.
  Drag clamps to this range, so a block cannot pass through anything.
- `slide(game, i, to)` — move block `i` to `to` if `to` is in range. If the last
  history entry is the same block, the entry is extended instead of a new one
  pushed; if that returns the block to the entry's `from`, the entry is
  removed. This is the "same block is one move" rule, and it applies to drags
  and keys alike.
- `undo(game)`, `restart(game)`.
- `isSolved(pieces, pos)` — the red block's right end is at the wall.

### Solver

Breadth-first search over positions. A position's key is
`Σ pos[i] · 6^i`: at most 16 blocks on a 6 × 6 tray means at most 6^16, which
fits exactly in a double, so a `Map` keyed by number does the work of a string
key with no allocation. Neighbours are every slide of every block to every cell
in its range — each is one move, matching how moves are counted.

- `solve(pieces, pos)` returns the minimum and the list of moves.
- `hint(game)` is `solve` from the current position, taking the first move.

Hint runs in the browser on demand. The largest state space in the shipped set
is measured by the generator and asserted by the tests to stay small enough
that a hint answers in well under a frame budget on a phone.

## Generator

The published approach (Fogleman's exhaustive Rush Hour database) is to take a
set of blocks, find every position reachable from one arrangement — its
*cluster* — and then measure every position's distance from the nearest solved
position. The hardest puzzle a set of blocks can make is the position farthest
away. `tools/generate.js` does that per random arrangement:

1. Seeded PRNG (so a rebuild is reproducible). Place the red block in the exit
   row, then attempt to place a random number of 2- and 3-long blocks at random.
2. Breadth-first search the whole cluster from that arrangement. Discard it if
   the cluster has no solved position or grows beyond a cap.
3. Multi-source breadth-first search from every solved position in the cluster,
   giving each position its exact minimum.
4. Keep the position with the largest minimum (ties broken by encoding), and
   renumber its blocks in reading order so the same arrangement always
   encodes the same way. Duplicates collapse on that string.
5. Bucket by minimum into the packs, keep the target count per pack with a
   spread across the band, sort by minimum, write `puzzles.js`.

No horizontal block is ever placed in the exit row: to the right of the red
block it makes the puzzle unsolvable, and to the left it can never matter.

**Density matters.** Measured over 15 seconds per setting:

| Blocks placed | Arrangements | Hardest ≥ 17 moves | ≥ 25 moves |
| --- | --- | --- | --- |
| 8 | 816 | 3 | 0 |
| 10 | 784 | 16 | 2 |
| 12 | 1,566 | 57 | 5 |
| 14 | 12,162 | 108 | 9 |
| 16 | 13,042 | 113 | 13 |

Dense arrangements have small clusters, so they are quick to explore, and are
far likelier to hide a long puzzle. The generator places 12–15 blocks four
times in five and 6–11 otherwise, which fills the easy packs as a side effect.
The shipped build tried 54,215 arrangements (27,649 distinct hardest
positions) in about seven minutes:

```
moves  3-9: 19,935   10-16: 7,262   17-24: 744   25+: 100 (up to 44)
```

Within a pack, puzzles are taken round-robin across the move counts present,
so a pack climbs through its band rather than bunching at its easy end. The
largest cluster shipped is 142,135 positions; solving from its start explores
about 10,000 and takes ~15 ms in Node, so hints are computed live.

Because every cluster contributes its *hardest* position, Expert puzzles come
from clusters that genuinely need long solutions rather than from an easy
puzzle with its start shuffled backwards.

## UI

### Screens

Packs → puzzle list → tray, swapped with `hidden` and driven by the URL hash
(`#`, `#expert`, `#expert/12`). Every navigation sets the hash and a
`hashchange` handler draws the screen, so the browser's back and forward, a
reload and a bookmark all behave. The bar always holds the site's
back-to-games link; beside it, an in-game Back goes up one level. The puzzle
list lands focus on the first unsolved puzzle.

### The tray

The tray is DOM, not canvas:

- Each block is a `<button>` absolutely positioned in cell units. That gives
  focus, keyboard, labels and screen reader support for free, which a canvas
  would have to rebuild.
- Wood grain, bevel and the brick red are CSS gradients and shadows; they scale
  to any cell size with no redraw.
- The theme is just CSS. Nothing has to re-read tokens when it changes.

`layout()` measures the tray's container (a flex child, so bars and safe areas
are already subtracted), computes

```
cell  = floor(min(width, height) / (6 + 2 × 0.4))     // 0.4 cell of wall each side
frame = round(0.4 × cell),  gap = max(1, round(0.05 × cell))
```

capped at 110px, and sets `--cell`, `--frame` and `--gap` on the tray. Each
block is placed with a `transform: translate(pos × cell, line × cell)` from a
fixed origin inside the wall; there is no other geometry. Transforms carry a
short transition so a released block settles rather than jumps — but while
`layout()` runs the tray carries a `still` class that turns transitions off,
or every block would glide in from the corner when a puzzle opens and across
the tray on every resize.

Measured: the tray is 94% of the width of a 375 × 812 phone and 94% of the
height of an 812 × 375 one, and neither scrolls.

### Drag

Pointer events with `setPointerCapture`, so a finger leaving the block does not
drop it. On `pointerdown` the engine's `range` for that block is fetched once;
on `pointermove` the block's offset along its axis follows the pointer, clamped
to that range, applied as a `transform` so nothing re-lays out. On `pointerup`
the offset rounds to the nearest cell and becomes an engine `slide`. The tray
has `touch-action: none` so a drag on it never scrolls or zooms the page; the
rest of the page is left alone.

### Keyboard

Blocks are buttons, so Tab walks them. An arrow along the focused block's axis
is a one-cell `slide` (merged into one move by the engine); an arrow across it
moves focus to the nearest block whose centre lies that way, scored as
`distance ahead + 2 × distance aside`.

### Hint

`Engine.hint` from the current position. The block is outlined and pulses, a
dashed ghost marks where it should go, and the live region says it in words.
The next move of any kind clears both. Asking twice from the same position
counts once.

### Solve

When the red block reaches the wall it slides on through the opening (a CSS
transition off the tray's edge), then the finish panel appears under the tray,
not over it, so the solved position stays visible.

### Layout

```
portrait                         landscape / short
┌───────────────────────────┐    ┌──────┬──────────────┬──────┐
│ bar: back · title · moves │    │ bar  │              │ ctrl │
├───────────────────────────┤    │      │     tray     │      │
│        tray (flex: 1)     │    │      │              │      │
├───────────────────────────┤    └──────┴──────────────┴──────┘
│ Undo · Restart · Hint     │
└───────────────────────────┘
```

## Persistence

`unjam-progress` is a JSON object `{ puzzleId: fewestMoves }`; `unjam-last` is
one puzzle id. Both are read and written through try/catch helpers.
