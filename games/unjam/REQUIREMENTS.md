# Unjam — Requirements

A sliding-block puzzle in the family of *Unblock Me* and *Rush Hour*. Wooden
blocks sit on a 6 × 6 tray. Each block slides only along its own length — a
horizontal block left and right, a vertical block up and down. One red block
lies across the third row, and the tray has an opening in its right wall level
with that row. Slide the other blocks out of the way and get the red block out.

## Scope

- Browser only, vanilla HTML/CSS/JS, no dependencies, no build step for the
  game. Puzzles are generated offline by a Node script under `tools/` and
  shipped as a plain data file.
- Rules live in `engine.js` with no DOM access, so the tests exercise the same
  code the game runs.
- Shared site shell: `/style.css` for tokens and the back button,
  `/inc/include.js` for the theme. The site header and footer are hidden.
- No user data leaves the browser. No analytics, no network calls after the
  page has loaded, no accounts. Progress lives in `localStorage` only.

## Rules

1. The tray is 6 columns × 6 rows. The exit is in the right wall at row 3
   (index 2).
2. A block is 2 or 3 cells long and lies horizontally or vertically. It keeps
   its orientation and its row (horizontal) or column (vertical) for ever.
3. A block slides any distance along its axis, as long as every cell it passes
   through is empty and it stays inside the tray.
4. Exactly one block is red. It is horizontal, 2 long, and lies in the exit
   row.
5. The puzzle is solved when the red block reaches the right wall — at that
   point nothing stands between it and the opening, and it slides out.

### Counting moves

- A **move** is one slide of one block, whatever the distance. This is how the
  original games count, and how the minimum for each puzzle is computed, so the
  player's count and the target are comparable.
- Consecutive slides of the **same** block are one move. Nudging a block two
  cells in two drags, or with two arrow key presses, does not cost double. A
  slide that returns the block to where that move started cancels the move.
- Undo takes back one move. Restart returns to the start and zeroes the count.

## Puzzles

| Pack | Minimum moves | Puzzles |
| --- | --- | --- |
| Beginner | 3 – 9 | 100 |
| Intermediate | 10 – 16 | 100 |
| Advanced | 17 – 24 | 100 |
| Expert | 25 and up | 100 |

Every shipped puzzle must satisfy the following. The generator enforces them
and the test suite re-checks every one, so a regression in either place fails.

| Requirement | Check |
| --- | --- |
| Well formed | 36 cells, every block 2 or 3 long and straight, inside the tray, no overlaps |
| Red block present | exactly one, horizontal, length 2, in the exit row |
| Not already solved | the red block does not start against the right wall |
| Solvable | a solution exists |
| Minimum is exact | the stored minimum equals a breadth-first search, not an estimate |
| Right pack | the minimum lies in the pack's band |
| Unique | no two puzzles are the same arrangement |
| Ordered | within a pack, puzzles never get easier as the number goes up (by minimum moves) |

Band limits are targets; if the generator cannot fill the top band at a
reasonable cost the limits move and the change is recorded in `DECISIONS.md`.
They held: the shipped Expert pack runs from 25 to 44 moves.

## Play

- **Pack → puzzle list → tray**, with a way back up at each level, plus the
  site-wide back-to-games link at every point.
- Each screen has its own address (`#expert`, `#expert/12`), so the phone's
  back gesture goes up one level rather than out of the game, a reload lands on
  the same puzzle, and a puzzle can be bookmarked.
- The bar shows the current move count and **par**, the puzzle's minimum.
- **Undo**, **Restart**, and **Hint**. A hint shows the next move of an optimal
  solution from the *current* position — not from the start — so it helps
  whatever the player has done so far. Hints are unlimited but counted.
- Solving needs no action to carry on. The red block slides out, a short
  banner in place of the controls gives moves against par (and hints used) and
  names the next puzzle, and after about two seconds the tray fades across to
  it. A solved tray has nothing left to look at, so there is no end screen to
  dismiss.
- Moving on this way adds no history entry: after a run of puzzles, back goes
  to the list. Leaving the puzzle or restarting during the pause cancels the
  move. After the last Expert puzzle it returns to the packs.
- A puzzle solved in exactly the minimum is marked **perfect**. The list shows
  solved and perfect puzzles differently, and each pack shows its tally.
- The last puzzle opened is remembered; returning to the game offers it.

## Input

- **Drag** a block with mouse, pen or finger. It follows the pointer along its
  own axis and stops at whatever is in the way — it never passes through a
  block or the wall. On release it settles into the nearest cell.
- A drag starting anywhere on a block moves it; there is no need to hit an
  edge. A drag that ends where it started is not a move.
- **Keyboard:** Tab picks the next block. Arrow keys *along* the picked
  block's axis slide it one cell; arrow keys *across* it pick the nearest
  block in that direction. With nothing picked, an arrow picks the red block.
  U or Ctrl/⌘+Z undoes, R restarts, H hints. There is no mode to toggle.
- A tap on a block without dragging picks it for the keyboard and is not a move.
- Page scrolling and pinch-zoom must not start from a drag on the tray, and
  must still work everywhere else.

## Screen

- Full screen by default, like every game here: site header and footer hidden,
  the tray takes the space left after one bar of chrome.
- The tray is square and sized from measured space:
  `cell = floor(min(width, height) / (6 + frame))`. No fixed pixel cap that
  binds on a phone.
- **Target:** on a 375 × 812 phone the tray is at least 85% of the viewport
  width; on a landscape phone (812 × 375) the tray is at least 80% of the
  height. Nothing is clipped and the page does not scroll on the play screen.
- Controls a thumb needs (Undo, Restart, Hint) are at least 44px tall. On a
  phone in portrait they sit under the tray; in landscape they move beside it.
- The pack and puzzle-list screens scroll normally.

## Look

- The blocks are wood: warm, grained, with a soft bevel so each reads as a
  solid piece. The tray is a darker wood frame with a visible gap in the right
  wall at the exit row.
- The red block is a muted brick red, not a saturated one, in line with the
  site's soothing palette — distinct from the wood by hue *and* by a marking,
  so it does not depend on colour alone.
- Wood and brick colours are the game and stay the same in both themes. Page,
  bars and buttons follow the site-wide theme, and the page must follow a
  theme change without a reload.
- `prefers-reduced-motion` turns off slide and exit animations.

## Accessibility

- The page stays pinch-zoomable (no `user-scalable=no`).
- Every block is a focusable control with a label naming its colour, length,
  orientation and position, e.g. "Red block, horizontal, 2 long, row 3,
  columns 1 and 2".
- A live region announces moves, hints, undo and the solve.
- All buttons are real buttons with visible focus.
- The in-game Back is at least 44px tall and acts on the first tap.

## Persistence

- `localStorage["unjam-progress"]` holds, per puzzle id, the fewest moves in
  which it has been solved. `localStorage["unjam-last"]` holds the last
  puzzle id. Nothing else is stored.
- Every access is wrapped in try/catch so private browsing degrades to play
  that does not persist, not a broken game.

## Out of scope

- Fixed wall blocks, trays other than 6 × 6, timed modes, sound, leaderboards,
  sharing, a level editor.
