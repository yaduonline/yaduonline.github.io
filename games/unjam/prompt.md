# Unjam

Slide the wooden blocks out of the way and get the red block out through the
gap in the right wall.

## How to play

- Each block slides only along its length: horizontal blocks left and right,
  vertical blocks up and down. Nothing jumps, turns or passes through anything.
- The red block sits in the third row, level with the gap. Once it reaches the
  right wall it slides out and the puzzle is solved.
- A **move** is one slide of one block, any distance. Sliding the same block
  again straight after is still the same move.
- **Par** is the fewest moves the puzzle can be solved in. Match it for a
  perfect solve (★).
- Solve one and the next arrives by itself after a moment; there is nothing
  to press. Back from there goes to the puzzle list.

## Stuck?

- **Hint** shows the next move of a shortest solution from where you are now,
  as a dashed outline. As many as you like; the finish panel counts them.
- **Undo** takes back a move; **Restart** starts over.

## Controls

| | |
| --- | --- |
| Drag | Slide a block (mouse, pen or finger) |
| Tab | Pick the next block |
| Arrows along a block | Slide it one cell |
| Arrows across a block | Pick the nearest block that way |
| U or Ctrl/⌘+Z | Undo |
| R | Restart |
| H | Hint |

## Content

Four packs of 100: Beginner, Intermediate, Advanced and Expert, from 3 to 44
moves. Every puzzle's par is exact — found by searching every position, not
estimated — and every Expert puzzle is the hardest position its blocks can
make. See `DESIGN.md` → Generator.

Progress is kept in this browser only. Nothing is sent anywhere.

## Working on it

- `REQUIREMENTS.md` — rules, puzzle quality bar, screen, input, accessibility
- `DESIGN.md` — files, engine model, solver, generator, layout
- `DECISIONS.md` — calls made along the way, and why
- `node test/run.js` — rules and every shipped puzzle (`--quick` skips re-solving
  them); `test.html` runs the same suite in a browser
- `npx playwright test -c playwright.games.config.js` (from the repo root) —
  the game in Chromium, Firefox and WebKit
- `node tools/generate.js` — rebuild `puzzles.js` (about seven minutes;
  `--survey` prints the distribution without writing)
