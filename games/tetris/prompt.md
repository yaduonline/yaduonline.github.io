# Tetris

Fit the falling pieces together. Fill a row and it clears.

## How to play

- Pieces fall faster as you level up — one level every 10 lines.
- A piece does not lock the instant it lands: you get half a second to slide or
  spin it into place.
- The faint outline shows where the piece will land.
- The next piece is shown in the top bar.

## Controls

| | |
| --- | --- |
| Arrows | Move left/right, or soft drop |
| Up or X | Rotate clockwise |
| Z | Rotate anticlockwise |
| Space | Hard drop |
| P or Esc | Pause |

On a touch screen the buttons along the bottom do the same things. In landscape
they move to the side so the board keeps the full height.

## Scoring

- 1 / 2 / 3 / 4 lines: 100 / 300 / 500 / 800, times your level.
- Soft drop: 1 a row. Hard drop: 2 a row.
- Your best score is kept in this browser only. Nothing is sent anywhere.

## Working on it

- `REQUIREMENTS.md` — rules, the screen-space bar, accessibility, scope
- `DESIGN.md` — file layout, engine model, and how the board is sized
- `node test/run.js` — the test suite; `test.html` runs the same suite in a browser
