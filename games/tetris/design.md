# Tetris (Dusk Slate) — Design Document

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
const CONFIG = {
    BUFFER_ROWS: 2,
    GRID_WIDTH: 10,   // Internal configuration for columns
    GRID_HEIGHT: 20   // Internal configuration for rows
};

gameState = {
    grid: Array(CONFIG.GRID_HEIGHT + CONFIG.BUFFER_ROWS).fill().map(() => Array(CONFIG.GRID_WIDTH).fill(0)),
    activePiece: {
        type: 'I',
        pos: {x: 3, y: 0},
        rotation: 0,
        matrix: [...]
    },
    nextPiece: { ... },
    score: 0,
    level: 1,
    linesCleared: 0,
    status: 'idle', // 'idle' | 'playing' | 'paused' | 'game-over'
    dropCounter: 0,
    lastTime: 0
};
```

### 2.2 Piece Definitions (Polyominoes)
Pieces are defined as matrices. Since we are using custom polyominoes (I=3, J=5, L=5, T=5, others=4), the matrix sizes vary.
- **I**: 3 blocks (Short straight line).
- **J**: 5 blocks (Mirror of L corner).
- **L**: 5 blocks (3 blocks vertical, 3 blocks horizontal, sharing a corner).
- **O**: 4 blocks (Standard square).
- **S**: 4 blocks (Standard S-shape).
- **Z**: 4 blocks (Standard Z-shape).
- **T**: 5 blocks (Extended T-shape).

### 2.3 Core Logic (Pure Functions)
- `rotate(matrix, dir)`: Returns a new rotated matrix.
- `checkCollision(grid, piece, offset)`: Returns `true` if piece overlaps blocks or bounds.
- `clearLines(grid)`: Returns `{newGrid, linesClearedCount}`.
- `getGhostPosition(grid, piece)`: Projects the piece downward until it hits something.

### 2.4 Rendering
- **Layered Drawing**: 
    1. Grid background and locked blocks.
    2. Ghost piece (outline).
    3. Active piece.
    4. HUD (Next piece, Score, Level).
    5. **Touch Overlay**: On-screen buttons (Left, Right, Rotate) visible only on touch-capable devices.

## 3. Test Plan

The `test.html` will verify:

| Test Case | Description |
|---|---|
| **Collision** | Piece cannot move through walls or existing blocks. |
| **Rotation** | Standard rotation and basic wall kicks (shift if blocked). |
| **Line Clear** | Full rows are removed, rows above shift down correctly. |
| **Hard Drop** | Piece moves to the exact bottom-most valid position. |
| **Game Over** | New piece spawning on an occupied cell triggers game-over. |

## 4. Input Handling
- **Debouncing**: Short delay on horizontal movement to prevent "zipping" across the board on single taps.
- **DAS (Delayed Auto Shift)**: Holding Left/Right starts moving slowly, then speeds up after a delay (Standard Tetris feel).
- **Touch Buttons**: Large hit areas for mobile navigation to minimize accidental drops.

## 5. Visual Effects
- **Line Clear Flash**: Briefly turn cleared rows white/bright before removal.
- **Drop Particles**: (Optional) small pulse when piece locks.

## 6. Implementation Notes
- Configurable grid dimensions are stored in the `CONFIG` object.
- `BUFFER_ROWS` are used for spawning pieces before they enter the visible `GRID_HEIGHT`.
