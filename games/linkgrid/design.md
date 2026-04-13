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
