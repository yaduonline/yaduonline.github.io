# Snake Game Prompt

## Overview

Snake is a single-player game played on a fixed rectangular grid. The player controls a snake — a chain of connected segments — that moves continuously in one direction across the grid. The player can change the snake's direction at any time using the controls.

Food items appear on the grid. When the snake's head moves into a cell occupied by food, the snake eats it: the score increases and the snake grows one segment longer. As the snake grows longer, it moves faster, making the game progressively harder.

The game ends when the snake's head moves into a cell already occupied by its own body. The goal is to eat as much food as possible before that happens.

This implementation is a single-player browser game. Pure vanilla JS/CSS/HTML, single self-contained file, no external dependencies.

---

## Core Rules

### The Grid
- The playing field is a **20×20 grid** of square cells.
- The grid is rendered on a `<canvas>` element that fills the available game area, with each cell sized to maintain a perfect square aspect ratio.
- All positions on the grid are described as `(column, row)` coordinates, where `(0, 0)` is the top-left cell.

### The Snake
- The snake is a sequence of grid cells. The **head** is the leading cell; the **tail** is the last cell.
- At game start, the snake occupies **3 cells** in a horizontal line at the center of the grid, facing right.
- Every movement tick, the snake advances one cell in its current direction:
  - The head moves into the next cell in the current direction.
  - Every other segment shifts to the position the segment ahead of it just vacated.
  - The tail cell is removed — **unless** the snake just ate food, in which case the tail stays, making the snake one cell longer.
- The snake always moves. The player can only change direction — they cannot stop the snake.

### Direction & Controls
- The snake can face one of four directions: **Up, Down, Left, Right**.
- The player changes direction using:
  - **Keyboard**: Arrow keys or WASD
  - **Touch**: Swipe in the desired direction on the game canvas
  - **Space bar / tap on canvas**: Pause or resume the game
- **Constraint**: The snake cannot reverse into itself. If the snake is moving right, the player cannot immediately turn left (that would move the head directly into the neck). Up and Down are still valid. This applies to all four directions symmetrically.
- If the player queues a direction change during a tick, it is applied at the start of the next tick.

### Wrap-Around (Edge Behavior)
- The grid has **no walls**. When the snake's head exits one edge of the grid, it re-enters from the opposite edge.
  - Exit right edge → re-enter from the left edge, same row.
  - Exit bottom edge → re-enter from the top edge, same column.
  - The same applies in reverse for left and top exits.
- Wrapping through an edge is never treated as a collision.

### Collision & Game Over
- The game ends immediately if the snake's **head moves into any cell already occupied by its own body** (including the neck segment).
- Wrapping around an edge is **not** a collision — only body overlap triggers game over.

### Movement Speed
- The snake moves once per **tick**. The tick interval (time between moves) shrinks as the snake grows longer, making the game progressively faster.
- See the **Speed Progression** table for exact intervals by length.

---

## Food System

| Type | Appearance | Points | Behavior |
|------|-----------|--------|----------|
| Apple | Red circle | +1 | Always present; respawns immediately on eat |
| Cherry | Dark red, paired dots | +3 | Appears after every 5 apples eaten; disappears after 10 seconds |
| Golden apple | Gold circle with shimmer | +5 | Rare (~15% chance to appear); disappears after 7 seconds; only one at a time |

- At most 3 food items on the board at any time (1 apple always + optional cherry + optional golden apple).
- Food never spawns on the snake body.
- Countdown timer shown next to timed food items (cherry, golden apple).

---

## Speed Progression

| Snake length | Tick interval |
|---|---|
| 3–5 | 200ms |
| 6–10 | 170ms |
| 11–15 | 145ms |
| 16–20 | 125ms |
| 21–30 | 110ms |
| 31+ | 95ms |

---

## UI / Layout

- Same site header/footer integration as other games.
- **Meta bar** (matches car-racing style — dark teal `#2e5c4e`, 48px tall) containing:
  - **Score** — current session score
  - **Best** — all-time high score from `localStorage` (shows `--` if none)
  - **Length** — current snake length
  - **Sound** button — muted by default; clicking toggles on/off (🔇 / 🔊)
  - **Restart** button — always visible; resets the game to `idle` state at any point (mid-game, paused, or game-over)
- **Expand button** (bottom-right) — toggles fullscreen (hides site header/footer), same as car-racing.
- Game canvas fills the remaining space below the meta bar.

---

## Game States

| State | Description |
|---|---|
| `idle` | Initial state. Snake visible, not moving. Press any arrow / swipe to begin. |
| `playing` | Snake moving, timer ticking. |
| `paused` | Space/tap toggles. Overlay shows "PAUSED". |
| `game-over` | Self-collision. Score + best shown. Use **Restart** in the meta bar to play again. |

---

## Sound Effects

All sounds are synthesized via the **Web Audio API** (no audio files, no external dependencies). Muted by default — user clicks the 🔇 button to unmute.

| Event | Sound |
|---|---|
| Eat apple | Short ascending blip (~80ms) |
| Eat cherry | Two-tone ascending blip (~120ms) |
| Eat golden apple | Triumphant 3-note ascending tone (~200ms) |
| Game over | Descending wail (~400ms) |
| Pause / resume | Soft click (~50ms) |

---

## Planned Iterations

### Iteration 1 — Core MVP
- 20×20 grid rendered on `<canvas>` or CSS grid
- Snake starts at center, length 3, moving right
- Arrow keys + WASD movement; no reverse direction
- Wrap-around on all edges
- Single apple food item, respawns on eat
- Self-collision → game over
- Score counter (plain, no meta bar yet)
- No sounds yet
- "Play Again" resets the game

### Iteration 2 — Polish & Persistence
- Meta bar (Score / Best / Length / Sound toggle)
- Rounded snake head + body segments (distinguishable head direction)
- Classic minimalist color scheme: dark background, green snake, colored food
- Game states: `idle → playing → paused → game-over`
- `localStorage` high score persistence
- "PAUSED" overlay
- Expand/fullscreen button
- Touch swipe controls

### Iteration 3 — Food Variety, Speed & Sound
- Cherry food type (timed, +3)
- Golden apple food type (rare, timed, +5)
- Countdown timers displayed next to timed food
- Speed progression table (see above)
- Web Audio API sound effects (all 5 events)
- Muted by default; sound toggle button in meta bar

---

## Visual Style

- **Background**: `#1a1a2e` (very dark navy)
- **Grid lines**: subtle `#1f1f3a` (barely visible)
- **Snake body**: `#4ade80` (classic green)
- **Snake head**: `#22c55e` (slightly brighter green, distinct)
- **Apple**: `#ef4444` (red)
- **Cherry**: `#9f1239` (dark red)
- **Golden apple**: `#fbbf24` (gold/amber)
- **Text / UI**: matches car-racing meta bar palette (`#6aabbb` labels, `#b8dde8` values)

---

## Technical Notes

- Single `index.html` file, no external dependencies.
- Prefer `<canvas>` rendering for the game grid.
- `requestAnimationFrame` loop with manual delta-time tick accumulator for consistent speed across frame rates.
- Sound: Web Audio API `OscillatorNode` + `GainNode`, created and discarded per sound event.
- `localStorage` key: `snake_highscore`.
