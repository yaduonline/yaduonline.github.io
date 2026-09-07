# Tetris — Requirements

A browser Tetris built to be played on a phone first. The playfield is the game;
everything else on screen has to earn its space.

## Scope

- Browser only, vanilla HTML/CSS/JS, no dependencies, no build step.
- Rules live in `engine.js` with no DOM access, so the tests exercise the same
  code the game runs.
- Standard 10 × 20 playfield with hidden spawn rows above it.
- Seven standard tetrominoes, four blocks each.

## Rules

1. Pieces fall from the top. The player moves and rotates them to fill rows.
2. A full row clears and everything above drops down.
3. The game ends when a new piece cannot be placed.
4. Gravity accelerates with level; level rises every 10 lines.

### Mechanics that must be present

| Mechanic | Behaviour |
| --- | --- |
| Rotation | Clockwise and counter-clockwise, with SRS wall kicks (separate tables for I and for JLSTZ) |
| Lock delay | 500ms after landing; each successful move or rotation resets it, capped at 15 resets so it cannot be stalled forever |
| Ghost piece | Shows where the piece will land |
| Next preview | The upcoming piece |
| Randomiser | 7-bag: every piece appears once per bag, so there are no long droughts |
| Hard drop | Instant lock at the landing position |
| Soft drop | Faster fall while held |

### Scoring

- 1/2/3/4 lines: 100 / 300 / 500 / 800, multiplied by level.
- Soft drop: 1 point per row. Hard drop: 2 points per row.
- Best score persists in `localStorage`.

## Screen real estate

This is the requirement the previous version failed, and the reason for the
rewrite. Measured on the old build:

| | Phone (375×812) | Desktop (813×462) |
| --- | --- | --- |
| Playfield share of viewport | 42% | 12.5% |
| Unused width beside the board | 121px (32%) | 659px (81%) |
| Controls | clipped off the bottom | — |

The rules below are testable, and the test suite checks them:

1. **Nothing is clipped.** The sum of the chrome bands and the board must fit
   the viewport, including the iOS safe-area inset.
2. **The board takes the space that is left.** Block size is
   `floor(min(availableWidth / 10, availableHeight / 20))` against space that
   was *measured*, not guessed at with constants.
3. **No arbitrary ceiling.** The old build capped blocks at 30px and floored
   them at 15px, so it both wasted a large screen and overflowed a small one.
   A cap may only exist to stop the board becoming absurd on a very large
   display, and must be well above the size a phone will ask for.
4. **Chrome is minimal and horizontal.** Score, level, lines and the next piece
   share one bar. Keyboard hints are not shown on a device with no keyboard.
5. **Target:** the playfield occupies at least 60% of viewport area on a
   375×812 phone, and at least 55% of the height on any viewport taller than
   it is wide.
6. The board is rendered at `devicePixelRatio` (capped at 2) so it is sharp on
   a phone without paying for a 3× backing store.

## Input

- **Keyboard:** arrows to move and soft drop, Up or X to rotate clockwise, Z
  counter-clockwise, Space to hard drop, P or Escape to pause.
- **Touch:** on-screen buttons for left, right, rotate, soft drop and hard drop,
  with auto-repeat on the directions. Buttons are at least 44px.
- Swipe and tap gestures on the board are **not** used: they conflict with the
  buttons and misfire during fast play. Buttons only, so the input is
  predictable.
- Horizontal auto-repeat uses a delay before it starts (DAS) and a faster
  repeat after (ARR), so a single tap moves exactly one column.

## Accessibility

- The page must remain pinch-zoomable. The old build set `user-scalable=no`.
- Controls are real buttons, reachable by keyboard and labelled for screen
  readers.
- A live region announces level changes, line clears and game over.
- Colour is not the only signal: pieces are also distinguishable by shape, and
  state is reported as text.
- `prefers-reduced-motion` suppresses the line-clear flash.

## Persistence

- Best score in `localStorage`, wrapped in try/catch so private browsing
  degrades to a session that does not persist rather than a broken game.

## Out of scope

- Hold piece, T-spin scoring, combo/back-to-back bonuses, multiplayer,
  leaderboards.
- Sound is retained from the previous build but stays off by default.
