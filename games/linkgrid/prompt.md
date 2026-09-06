# Linkgrid

Connect every pair of dots and cover the whole board.

## How to play

- Drag from a coloured dot to its twin. The route follows your finger or pointer
  one cell at a time, up/down/left/right only.
- A puzzle is solved when every pair is joined **and** every cell is covered.
  Joining all the pairs is not enough.
- Drag back along the route you are drawing to shorten it.
- Grab a route part-way along to keep that much and redraw the rest.
- Drawing across another colour takes the cell and erases that colour from there
  on. Dots themselves can never be overwritten.
- Tapping a dot without dragging leaves its route alone.

## Controls

| | |
| --- | --- |
| Mouse / touch | Press, drag, release |
| Arrow keys | Move the board cursor |
| Space / Enter | Start a route, then finish it |
| Esc | Cancel the route in progress |
| U or Ctrl/⌘+Z | Undo the last route |
| R | Restart the puzzle |

## Content

Six packs (5×5 to 10×10), one hundred puzzles each: twenty at each of five
difficulty levels. Every puzzle has exactly one intended solution, uses the
whole board, and is built to bend often and mostly away from the edges — see
`GENERATION.md`.

Difficulty is relative to the board size. A 5×5 has 25 cells and very little
room to hide a hard puzzle, so its level 5 is nothing like a 10×10 level 5.

Solved puzzles are remembered in this browser only. Nothing is sent anywhere.

## Working on it

- `REQUIREMENTS.md` — rules, quality bar, accessibility, scope
- `DESIGN.md` — file layout, engine model, UI
- `GENERATION.md` — how puzzles are made, and what was tried and rejected
- `RELATED-WORK.md` — the generator measured against the published literature
- `node test/run.js` — full test suite (`--quick` skips the solver pass,
  `--sample` solves every tenth puzzle); `test.html` runs most of it in a browser
- `node tools/pool.js <size>` then `node tools/build.js` — regenerate puzzles
