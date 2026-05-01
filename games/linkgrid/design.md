# Linkgrid - Design (Iteration 1)

## Design Goals
- Deterministic puzzle behavior with clear, reversible input.
- Mobile-first interaction parity with desktop.
- Fast puzzle reset, undo-by-drag-back, and reliable completion checks.
- Clean pastel visual language with high contrast between paths and grid.

## Architecture
Single-page game in `index.html` with embedded CSS/JS and shared shell includes (`/style.css` and `/inc/include.js`) with logical sections:
1. Config and theme tokens
2. Puzzle pack data
3. State model
4. Input handling
5. Path editing engine
6. Validation engine
7. Rendering
8. UI flow (pack select, level select, puzzle)
9. Persistence

## State Model

### Global App State
- `screen`: `pack-select | level-select | puzzle`
- `selectedPackId`
- `selectedLevelId`
- `puzzleState`
- `progress`

### Puzzle State
- `size`: grid size `N`
- `endpoints`: map of color id to two endpoint cells
- `ownerGrid`: cell owner color id or `-1`
- `pathsByColor`: ordered cell arrays
- `activeColor`: color currently being dragged
- `activePath`: in-progress path for active color
- `isSolved`: boolean

### Progress State
- `solvedByPack`: set of solved level ids
- persisted in `localStorage`

## Puzzle Data Format
Each puzzle entry:
- `id`
- `size`
- `tier` (1..5)
- `endpoints`: array of `{ color, a: [r,c], b: [r,c] }`

Packs are grouped by size (`5x5` ... `10x10`).

## Puzzle Generation Algorithm (Iteration 2)

### Overview
Puzzles are generated algorithmically by creating non-overlapping pipes that fill the grid, then extracting the pipe endpoints as the puzzle starting state. This ensures all generated puzzles are solvable by construction.

### Algorithm Steps

#### 1. Initialize Grid
- Create empty N×N grid
- Each cell has state: `empty`, `pipe-{colorId}`, or `endpoint-{colorId}`
- Initialize `pipes = []` (list of completed pipes)
- Initialize `colorId = 0`

#### 2. Generate Pipes (Iterative Loop)
Repeat until grid is reasonably filled:

**2a. Place Starting Endpoint**
- Pick random empty cell, mark as `endpoint-{colorId}`
- Record pipe start position

**2b. Draw Pipe with Backtracking**
- Use DFS/backtracking to grow a path from the starting endpoint
- Move only into `empty` cells (orthogonal: up/down/left/right)
- Maintain **minimum spacing of 2 cells** between consecutive turns (relaxed at dead ends)
- Allow `maxTurns = 1 + Math.floor(gridSize / 4)` turns per pipe
- Use backtracking if stuck; mark final cell as endpoint and end pipe

**2c. Mark Pipe**
- All cells in the path are marked as `pipe-{colorId}`
- Final cell is marked as `endpoint-{colorId}` (the ending dot)

**2d. Increment Color**
- Continue until grid reaches `fillThreshold` or max colors reached

#### 3. Fill Remaining Empty Cells (Optional Optimization)
- Greedily extend/shorten existing pipes to fill gaps
- Aim for complete coverage, but acceptable if small pockets remain empty

#### 4. Extract Endpoints and Build Puzzle
- For each completed pipe, extract start and end endpoints
- Create puzzle endpoint pairs: `{color: colorId, a: start, b: end}`
- Remove all pipe markings (return to clean grid)
- Return puzzle with endpoint pairs as solving starting state

### Configuration Parameters
- `gridSize` – N for N×N grid
- `minSpacing` – minimum Manhattan distance between turns (default: 2)
- `maxTurns` – maximum turns allowed in a single pipe
- `fillThreshold` – percentage of grid to attempt to fill (default: 80–100%)
- `maxAttempts` – max backtracking attempts before giving up on a pipe

### Difficulty Calculation
- Tier 1–2: fewer colors (2–3), shorter pipes
- Tier 3–4: more colors (3–4), medium pipes with more turns
- Tier 5: maximum colors (4–5), longest pipes with many turns

### Properties
- **Solvable**: By construction, each puzzle has exactly one solution (original pipe paths)
- **Scalable**: Works for any grid size without manual design
- **Tunable**: Difficulty controlled via parameters (turns, spacing, colors)
- **Deterministic**: Supports seeded random for reproducibility

## Input and Path Editing

### Start
- Pointer down on an endpoint or existing segment of a color starts editing that color.

### Extend
- Drag to orthogonally adjacent cells only.
- Diagonal movement is ignored.
- Extending into empty cells paints ownership for active color.

### Replace / Trim Rules
- If crossing own path: backtrack trims to that point.
- If entering a cell occupied by another color: blocked.
- If dragging into non-adjacent cell: ignored.
- If both endpoints for a color are connected, path is marked complete.

### Undo in v1
- Undo is gesture-based by dragging backward on the same active color path.
- No separate global undo stack in v1.

### Keyboard Support (v1)
- Focusable board with visible focus ring.
- Keyboard cursor moves with arrow keys.
- Space/Enter starts or extends active color path at cursor.
- Escape cancels active drag/edit state.

## Validation Engine
On every stable path update:
1. Check each color is connected endpoint-to-endpoint exactly once.
2. Check all grid cells are occupied.
3. If both true, set `isSolved=true`.

## UI Flow
1. Pack Select: choose board size pack.
2. Level Select: grid of levels with solved badge.
3. Puzzle Screen:
   - board canvas/SVG
   - restart button
   - back button
   - solved banner on completion
   - keyboard focus and ARIA labels for board/actions

## Rendering
- Board rendered as square cells with rounded path corners.
- Endpoints rendered as filled circles in pastel tones.
- Paths rendered thicker than grid lines for readability.
- Soft pastel background and low-contrast grid lines.

## Difficulty Mapping
Five tiers used across all sizes:
1. Beginner
2. Easy
3. Medium
4. Hard
5. Expert

Complexity factors:
- number of colors
- path interaction density
- forced corridor structure

## Persistence
- Save solved state in `localStorage` keyed by game id and pack id.
- On load, hydrate solved markers in level select.

## Non-Functional
- Smooth pointer interaction on mobile and desktop.
- No external libraries.
- Deterministic behavior for reproducible tests.
- Basic accessibility: keyboard operability and semantic labels where feasible.
