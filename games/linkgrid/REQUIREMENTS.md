# Linkgrid — Requirements

Linkgrid is a browser puzzle game in the Numberlink / Flow family. The player
joins each pair of matching dots with an orthogonal route, and every cell of the
board must end up covered.

## Scope

- Browser only, vanilla HTML/CSS/JS, no dependencies, no build step for the game
  itself. Puzzle data is generated offline by Node scripts under `tools/`.
- Shared site shell: `/style.css` and `/inc/include.js` (header and footer).
- Board sizes 5×5 through 10×10, fifteen puzzles each, five difficulty tiers.
- Open square grids only: no walls, bridges, warps or non-square cells.

## Rules

1. A puzzle places two dots of each colour on an N×N grid.
2. A route is a sequence of orthogonally adjacent cells running from one dot of a
   colour to its twin. Routes may not cross or share cells.
3. A puzzle is solved when every colour is joined dot to dot **and** every cell
   of the board belongs to exactly one route.
4. Drawing rules the player can rely on:
   - A route starts by grabbing one of its dots, or any cell of a route already
     drawn. Grabbing part-way along keeps everything up to that cell.
   - Dragging back along the active route shortens it. This is the undo gesture.
   - Drawing across another colour's route takes the cell and erases that
     colour's route from the crossed cell onward.
   - Another colour's *dot* is never overwritten; a route cannot pass through it.
   - Once a route reaches its second dot it is closed: it cannot be extended past
     the dot, only shortened.
   - Grabbing a dot and releasing without drawing leaves the existing route
     alone. Only an actual drag replaces it.

## Puzzle quality

Every shipped puzzle must satisfy all of the following, measured on its intended
solution. These are enforced at generation time and re-asserted by the test
suite, so a regression in either place fails the build.

| Requirement | Threshold |
| --- | --- |
| Covers the whole board | every cell used exactly once |
| Solvable, and hard to solve by accident | exactly one solution in which no route runs alongside itself |
| Few straight connections | fewer than 25% of colours have zero bends |
| Bends concentrated in the middle | interior bend density ≥ 1.2 × border bend density |
| Genuinely winding | at least 0.3 bends per cell |
| Bends in different directions | all four corner orientations present, none above 40% of bends |
| No trivial or dominating colours | every route ≥ 3 cells; no route covers ≥ 40% of the board |

"Bend density" is bends per available cell in a region, so the interior/border
comparison is fair even though the two regions differ in size. Border cells are
those in row or column 0 or N−1.

## Difficulty

- Five tiers per board size, three puzzles per tier.
- Tiers are assigned from *measured* difficulty, not assumed: candidates are
  ranked by how much search a solver needs once the obvious deductions run out,
  plus mean route length and bend density. See `GENERATION.md`.

## Input

- Pointer (mouse, touch, pen): press on a dot or route, drag, release. A drag
  that outruns the browser's sampling is filled in cell by cell, so a fast drag
  draws the same route as a slow one.
- Keyboard: arrows move a board cursor, Space/Enter starts and finishes a route,
  Esc cancels the route in progress, U (or Ctrl/⌘+Z) undoes, R restarts.
- Undo covers completed routes; the drag-back gesture covers the route in hand.

## Accessibility

- The board is keyboard operable end to end, including solving a puzzle.
- Visible focus rings on every control and on the board.
- A polite live region announces what the cursor is on, what was drawn, whether
  a move was blocked, and completion.
- The board's `aria-label` carries the current progress (colours joined, cells
  filled).
- Colour is never the only signal: routes are drawn thicker once joined, joined
  dots gain a pale centre ring, and progress is reported as text.

## Progress

- Solved puzzles persist in `localStorage` under `linkgrid-progress-v2`.
- Storage failures (private browsing, disabled storage) degrade to a session
  that simply does not persist, never to a broken game.

## Out of scope

- Hints, timers, scoring beyond move count, leaderboards, cloud sync.
- Board modifiers (walls, bridges, warps, hex grids).
- In-game puzzle generation: puzzles are generated offline and shipped as data.
