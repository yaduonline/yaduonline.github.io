# Tetris — Design

## Files

| File | Role |
| --- | --- |
| `index.html` | Markup, styles, script tags. No game logic. |
| `engine.js` | Pure rules. No DOM. Loaded as a global (`TetrisEngine`) or via `require`. |
| `game.js` | UI: layout, canvas rendering, input, persistence. |
| `test/suite.js` | Test suite shared by Node and the browser. |
| `test/run.js` | Node runner. |
| `test.html` | Browser runner. |

The split exists so the rules are testable without a DOM. The previous
`test.html` reimplemented `checkCollision`, `rotateMatrix`, `clearLines` and
`getGhostPosition` inside itself, so the tests passed against a copy and could
not have caught a bug in the game.

## Engine model

```
game = {
  grid[row][col]   // piece type letter, or null. 22 rows: 20 visible + 2 spawn
  piece { type, matrix, rotation, pos }
  nextType
  score, level, lines
  status           // ready | playing | paused | clearing | over
  gravityMs        // clock 1: when to fall
  lockMs           // clock 2: how long we have rested on something
  lockResets, grounded
  clearing[], clearMs
  events[]         // drained by the UI
}
```

**Two separate clocks** is the important part. The previous build had one
counter and reset it on every successful move, so nudging a piece sideways
stopped gravity entirely — a player could hold a piece up forever. Gravity now
runs on `gravityMs` and is never reset by player input; the lock timer runs on
`lockMs` and *is* reset by input, but only 15 times, so a piece can be slid into
place at the last moment without stalling the game.

`tick(game, deltaMs)` advances both clocks. The UI calls it once per frame; the
tests call it with explicit deltas, which is how the 500ms lock delay is
verified without a browser.

Grid cells hold the piece *type letter*, not a colour. Colour is a rendering
concern, and keeping it out of the model makes the grid comparable in tests.

Other rules the old build got wrong, now fixed and covered by tests:

- **7-bag randomiser.** It drew uniformly at random, so the same piece could
  come up many times over and the one you needed could stay away for ages.
- **Lock delay.** It locked the instant gravity failed, with no grace period,
  despite the spec calling for one.
- **Real SRS kick tables**, with a separate table for I, rather than one ad-hoc
  list of offsets tried for every piece.
- **Counter-clockwise rotation**, which the spec asked for and the code lacked.
- **Soft and hard drop scoring**, likewise specified and missing.
- The soft-drop button moved the piece **two** rows per press, because the
  handler moved once and then tested by moving again.

## Layout: the actual problem

Measured on the old build, this is what the rewrite had to fix:

| | Phone 375×812 | Desktop 813×462 |
| --- | --- | --- |
| Playfield share of viewport | 42% | 12.5% |
| Unused width beside the board | 121px | 659px |
| Controls | clipped off screen | — |

Four separate causes:

1. **A hard cap and floor on block size** (`min(max(15, …), 30)`). The cap
   wasted big screens; the floor overflowed small ones, which is why the touch
   controls were cut off rather than the board shrinking to fit.
2. **Space was guessed at, not measured** — `reservedHeight` summed a handful of
   `offsetHeight` reads plus a magic `+ 70`, computed before layout had settled.
3. **Too many full-width bands stacked vertically**, each using a sliver of its
   width: a six-item meta bar, then the board, then a row holding the next-piece
   preview *and keyboard hints*, then the controls.
4. **The shared stylesheet** puts `max-width: 800px` and `padding: 20px` on
   `body`. That pushed this full-height layout off the bottom of the screen and
   capped the board on a wide display. It is reset on this page.

### How it works now

The page is a flex container pinned to `100dvh`, in three parts:

```
portrait                          landscape / short
┌──────────────────────────┐      ┌────┬──────────────┬─────┐
│ bar: back · stats · next │      │bar │              │ctrls│
├──────────────────────────┤      │    │    board     │     │
│                          │      │    │              │     │
│   board (flex: 1)        │      │    │              │     │
│                          │      └────┴──────────────┴─────┘
├──────────────────────────┤
│ controls (touch only)    │
└──────────────────────────┘
```

`layout()` measures the board's own container with `getBoundingClientRect` —
the space the flexbox actually gave it — and sets

```
block = floor(min(width / 10, height / 20))
```

There is no floor, and the only cap is 48px, far above anything a phone asks
for, so it exists purely to stop the board becoming absurd on a large monitor.
Because the container is a flex child, the browser has already subtracted the
bars and the safe-area inset; nothing is guessed.

The next-piece preview lives *in the top bar* rather than in a band of its own,
which is what buys most of the vertical space back. Keyboard hints appear only
when a keyboard is likely (`hover: hover and pointer: fine`); on a narrow phone
the Lines and Best readouts drop out so the bar stays on one line instead of
letting the labels overlap, which is what the old build did.

**Landscape** turns the stack on its side. A 10×20 board is height-limited, so
stacking vertically in a short wide window wasted the entire width — measured at
14.8% of screen with 662px of nothing beside the board. As a row it reaches
21.7%, and the board gets the full height.

The canvas backing store is `cssSize × min(devicePixelRatio, 2)`. Capping at 2
keeps a phone sharp without paying for a 3× buffer, the same tradeoff made in
Linkgrid.

### Results

| | Before | After |
| --- | --- | --- |
| Phone 375×812 | 42% | **75.9%** |
| Phone 320×568 | — | 48.5% |
| Landscape 812×375 | 14.8% | **21.7%** |
| Desktop 813×462 | 12.5% | **25.8%** |

Nothing is clipped and the page does not scroll at any of them.

### Site chrome

The shared site header and footer are hidden on this page. A Tetris board wants
every vertical pixel, and the nav was costing roughly a third of the screen on a
phone. The bar keeps a link back to `/games/`, so the page is not a dead end.
This was already being done by hand in the working copy; it is now deliberate
and documented rather than a local edit.

## Input

Keyboard and on-screen buttons drive the same engine calls. Gestures on the
board were removed: swipe-to-move and tap-to-rotate competed with the buttons
and misfired during fast play, and `preventDefault` on every `touchstart` over
the board made the page feel stuck.

Horizontal repeat uses DAS (a delay before repeat starts) and ARR (the repeat
interval), so a tap moves exactly one column and a hold slides smoothly.
Buttons respond to `pointerdown` for immediate feedback, with `pointerup`,
`pointercancel` and `pointerleave` all ending the repeat so it can never run
away.

## Rendering

One canvas for the board, one small canvas for the next piece. Each frame:
clear, grid lines, locked cells, ghost outline, active piece, and the clear
flash if a row is vanishing. A single `requestAnimationFrame` loop drives both
`tick` and the draw, with the delta clamped to 100ms so a backgrounded tab does
not resume by dropping the piece through the floor.

## Persistence

`localStorage["tetris-best"]`, wrapped in try/catch so private browsing degrades
to a session that does not persist rather than a broken game.
