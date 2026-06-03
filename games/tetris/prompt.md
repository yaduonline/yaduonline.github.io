# Tetris Game Prompt

## Overview
Tetris is a classic tile-matching puzzle game. Randomly shaped pieces (tetrominoes) fall from the top of a 10x20 grid. The player moves and rotates them to create solid horizontal lines. When a line is completed, it disappears, and the player earns points. The game ends when the pieces stack up to the top of the grid.

This implementation follows the site's guidelines: vanilla JS/CSS/HTML, single self-contained file, responsive, and using a soothing color palette.

---

## Core Rules

### The Grid
- **Configurable dimensions** in code (default: 10 columns × 20 rows).
- **Configurable "buffer" rows** at the top for spawning pieces (default: 2).
- Rendered on a `<canvas>` centered in the view.

### Game Pieces (Polyominoes)
Seven distinct shapes (Tetrominoes), each consisting of 4 blocks:
- **I**: 4 blocks (Straight line).
- **J**: 4 blocks (L-shape mirrored).
- **L**: 4 blocks (L-shape).
- **O**: 4 blocks (Standard square).
- **S**: 4 blocks (Standard S-shape).
- **Z**: 4 blocks (Standard Z-shape).
- **T**: 4 blocks (Standard T-shape).

### Movement & Controls
- **Left/Right**: Move piece horizontally.
- **Down**: Soft drop (increase falling speed).
- **Up / X**: Rotate clockwise.
- **Z**: Rotate counter-clockwise.
- **Space**: Hard drop (instantly lock piece at bottom).
- **P / Escape**: Pause.
- **Touch**: 
  - Swipe Left/Right to move.
  - Tap to rotate.
  - Swipe Down for hard drop.
  - **On-screen buttons**: Dedicated Left, Right, and Rotate buttons provided for alternative touch input.

### Mechanics
- **SRS (Super Rotation System)**: Simplified version for wall kicks (allowing rotations near walls/blocks).
- **Ghost Piece**: A transparent shadow showing where the piece will land.
- **Next Piece**: Preview of the upcoming tetromino.
- **Lock Delay**: Brief moment after landing where the player can still move/rotate before the piece locks.

### Scoring
- 1 Line: 100 × Level
- 2 Lines: 300 × Level
- 3 Lines: 500 × Level
- 4 Lines (Tetris): 800 × Level
- Points for soft/hard drops.

### Leveling
- Start at Level 1.
- Advance level every 10 lines cleared.
- Gravity (speed) increases with each level.

---

## Color Palette (Dusk Slate)

| Element | Color | Hex |
|---|---|---|
| Background | Warm dark slate | `#1c2030` |
| Grid Lines | Subtle slate | `#232840` |
| I-Piece | Muted Sage | `#6ec6a2` |
| J-Piece | Soft Blue | `#6aabbb` |
| L-Piece | Terracotta | `#e0856a` |
| O-Piece | Warm Amber | `#d4a855` |
| S-Piece | Soft Mint | `#9ad4bf` |
| Z-Piece | Slate Blue | `#7a8fa8` |
| T-Piece | Rose Mauve | `#c47088` |
| Ghost Piece | Border only | `rgba(200, 208, 224, 0.2)` |
| UI Text | Warm off-white | `#c8d0e0` |

---

## UI / Layout
- **Meta Bar**: Score, Level, Best (High Score), Sound toggle, Restart.
- **Sidebar/Overlay**: "Next" piece preview, "Paused" or "Game Over" states.
- **Responsive**: Scales to fit mobile screens with touch-friendly zones and a dedicated button overlay for mobile users.

---

## Sound Effects (Web Audio API)
- Move/Rotate: Soft clicks.
- Line Clear: Harmonious chime.
- Tetris (4 lines): Triumphant chord.
- Game Over: Low frequency fade-out.

---

## Implementation Plan

### Iteration 1 — Core Gameplay
- Grid logic & Tetromino definitions.
- Gravity and basic movement (Left/Right/Down).
- Collision detection.
- Simple rotation.
- Line clearing.

### Iteration 2 — Polish & Mechanics
- SRS Wall kicks.
- Ghost piece.
- Next piece preview.
- Scoring & Leveling logic.
- "Dusk Slate" styling.

### Iteration 3 — Mobile & Audio
- Touch controls.
- Web Audio API sounds.
- `localStorage` high score.
- Animation effects (clear flash, piece landing).

---

## Technical Requirements
- Single file `index.html`.
- Pure vanilla JavaScript (no libraries).
- `requestAnimationFrame` for smooth rendering.
```

### 2. Engineering Design (`/games/tetris/design.md`)
This details the architectural layers and the state object.

```diff
# Tetris — Design Document

## 1. File Structure
```
games/tetris/
├── index.html     # Game — HTML + CSS + JS
├── test.html      # Test runner for core logic
├── prompt.md      # Specification
└── design.md      # Architecture & Logic
```

## 2. Components

### 2.1 State
```javascript
gameState = {
    grid: Array(20).fill().map(() => Array(10).fill(0)), // 0 = empty, else colorIndex
    activePiece: {
        type: 'I',
        pos: {x: 3, y: 0},
        rotation: 0,
        shape: [...]
    },
    nextPiece: { ... },
    score: 0,
    level: 1,
    linesCleared: 0,
    status: 'idle', // 'idle' | 'playing' | 'paused' | 'game-over'
    dropCounter: 0,
    lastTime: 0
}
```

### 2.2 Core Logic (Pure Functions)
- `rotate(matrix, dir)`: Returns a new rotated matrix.
- `checkCollision(grid, piece, offset)`: Returns `true` if piece overlaps blocks or bounds.
- `clearLines(grid)`: Returns `{newGrid, linesClearedCount}`.
- `getGhostPosition(grid, piece)`: Projects the piece downward until it hits something.

### 2.3 Rendering
- **Layered Drawing**: 
    1. Grid background and locked blocks.
    2. Ghost piece (outline).
    3. Active piece.
    4. HUD (Next piece, Score).

## 3. Test Plan

The `test.html` will verify:

| Test Case | Description |
|---|---|
| **Collision** | Piece cannot move through walls or existing blocks. |
| **Rotation** | Standard rotation and basic wall kicks (I-piece at edge). |
| **Line Clear** | Full rows are removed, rows above shift down correctly. |
| **Hard Drop** | Piece moves to the exact bottom-most valid position. |
| **Game Over** | New piece spawning on an occupied cell triggers game-over. |

## 4. Input Handling
- **Debouncing**: Short delay on horizontal movement to prevent "zipping" across the board on single taps.
- **DAS (Delayed Auto Shift)**: Holding Left/Right starts moving slowly, then speeds up after a delay (Standard Tetris feel).

## 5. Visual Effects
- **Line Clear Flash**: Briefly turn cleared rows white/bright before removal.
- **Drop Particles**: (Optional) small pulse when piece locks.
```

### 3. Execution Plan (`/games/tetris/tasks.md`)
The step-by-step roadmap.

```diff
# Tetris - Iterative Task List

## Iteration 1 — Core Playable Baseline

### A. Scaffold & State
- [ ] Create `games/tetris/index.html` with Canvas and Meta bar.
- [ ] Define Tetromino shapes and basic `gameState`.
- [ ] Implement `render()` for grid and active piece.
- [ ] **Test**: Page loads, grid draws, and a static piece is visible.

### B. Movement & Gravity
- [ ] Implement basic gravity (tick-based falling).
- [ ] Implement Keyboard input (Left, Right, Down).
- [ ] Implement `checkCollision`.
- [ ] **Test**: Piece stops at bottom, cannot go through walls.

### C. Rotation & Locking
- [ ] Implement rotation logic.
- [ ] Implement line clearing logic.
- [ ] Implement piece locking and next-piece spawning.
- [ ] **Test**: Full lines disappear, pieces stack up, game ends when stack hits top.

## Iteration 2 — Polish & Features

### A. Advanced Mechanics
- [ ] Implement Ghost Piece (shadow).
- [ ] Implement Hard Drop (Space).
- [ ] Implement SRS Wall Kicks (basic version).
- [ ] **Test**: Piece can rotate even when touching a wall.

### B. UI & Leveling
- [ ] Implement Leveling (speed increase every 10 lines).
- [ ] Implement Next Piece preview UI.
- [ ] Apply "Dusk Slate" color palette and CSS styling.
- [ ] **Test**: Score/Level updates correctly; UI looks polished.

## Iteration 3 — Mobile & Audio
- [ ] Implement Touch controls (Swipe/Tap).
- [ ] Implement Web Audio API sound effects.
- [ ] Implement `localStorage` persistence for High Score.
- [ ] **Test**: Playable on mobile; high score persists across refreshes.
```

I'll wait for your review of these documents. Once approved, I will begin **Iteration 1, Task A** (Creating the scaffold and state).

<!--
[PROMPT_SUGGESTION]The specification and design for Tetris look great. Proceed with Iteration 1, Task A.[/PROMPT_SUGGESTION]
[PROMPT_SUGGESTION]Can we add a 'Hold' piece mechanic to the specification before we start?[/PROMPT_SUGGESTION]
