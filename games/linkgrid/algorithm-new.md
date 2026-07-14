# Linkgrid Puzzle Generation Algorithm (Proposed)

## Overview
Generate puzzles by creating non-overlapping pipes that completely fill the grid, then extract endpoints to form the puzzle.

## Algorithm Steps

### 1. Initialize Grid
- Create empty N×N grid
- Each cell has state: `empty`, `pipe-{colorId}`, or `endpoint-{colorId}`
- Initialize `pipes = []` (list of completed pipes)
- Initialize `colorId = 0`

### 2. Generate Pipes (Iterative Loop)
Repeat until grid is reasonably filled OR we decide to stop:

#### Step 2a: Place Starting Endpoint
- If grid is mostly empty: pick random empty cell, mark as `endpoint-{colorId}`
- If grid is partially filled: try to place endpoint in empty region (or use any empty cell as fallback)
- Record pipe start position: `pipes[colorId].start = [row, col]`

#### Step 2b: Draw Pipe with Backtracking
- Use DFS/backtracking to grow a path from the starting endpoint
- **Grow Constraints**:
  - Each move must go to an orthogonally adjacent cell (up/down/left/right)
  - Move only into `empty` cells (no overlaps with other pipes or endpoints)
  - Between consecutive turns in the path, maintain **minimum spacing of 2 cells** in Manhattan distance
    - Exception: relax this constraint if we hit a dead end (no valid moves without spacing)
  - Allow 1–3 turns depending on grid size (more turns = more interesting paths)
    - Formula: `maxTurns = 1 + Math.floor(gridSize / 4)` (rough estimate)

- **Backtracking**:
  - If we get stuck (no valid moves), backtrack to the last branching point
  - Try alternate directions
  - If all directions exhausted, mark current cell as endpoint and end pipe
  - If we backtrack to start without drawing anything, pick a new starting cell

#### Step 2c: Mark Pipe
- All cells in the grown path are marked as `pipe-{colorId}`
- Final cell of the pipe is marked as `endpoint-{colorId}` (the ending dot)

#### Step 2d: Increment Color
- `colorId += 1`
- Continue looping until reasonable fill or explicit stop condition

### 3. Fill Remaining Empty Cells (Optional Optimization)
If significant cells remain empty after pipe generation:
- Extend/shorten existing pipes to fill gaps (greedy expansion)
- Aim to cover the entire grid, but it's acceptable if some small pockets remain empty

### 4. Extract Endpoints and Build Puzzle
- For each completed pipe:
  - Extract `start` endpoint (the colored dot we placed in step 2a)
  - Extract `end` endpoint (the final cell from step 2c)
  - Create puzzle endpoint pair: `{color: colorId, a: start, b: end}`
- Remove all pipe markings from the grid (cells return to conceptual empty state)
- Initialize new grid with only the endpoint pairs
- Return puzzle with these endpoints as the solving starting state

## State Representation

### Grid Cell States
- `empty` – available for drawing
- `pipe-{colorId}` – part of a drawn pipe
- `endpoint-{colorId}` – endpoint of a pipe (acts as blocking marker during growth)

### Pipe Object
```
{
  colorId: number,
  path: [[r1, c1], [r2, c2], ...],  // all cells in the path
  start: [r, c],                     // starting endpoint
  end: [r, c]                        // ending endpoint
}
```

## Configuration Parameters
- `gridSize` – N for N×N grid
- `minSpacing` – minimum Manhattan distance between turns (default: 2)
- `maxTurns` – maximum turns allowed in a single pipe
- `fillThreshold` – percentage of grid to attempt to fill (e.g., 80–100%)
- `maxAttempts` – max backtracking attempts before giving up on a pipe

## Pseudocode

```
function generatePuzzle(gridSize) {
  grid = initializeGrid(gridSize)
  pipes = []
  colorId = 0
  
  while (not enough fill or not max colors) {
    startCell = pickRandomEmptyCell(grid)
    grid[startCell] = `endpoint-${colorId}`
    
    pipe = {colorId, path: [startCell], start: startCell}
    current = startCell
    turns = 0
    maxTurns = calculateMaxTurns(gridSize)
    
    while (canGrow && turns < maxTurns) {
      neighbors = getOrthogonalNeighbors(current)
      validMoves = neighbors.filter(n => 
        grid[n] == empty && 
        manhattanDistance(lastTurn, n) >= minSpacing
      )
      
      if (validMoves.empty && canRelaxSpacing) {
        validMoves = neighbors.filter(n => grid[n] == empty)
      }
      
      if (validMoves.empty) {
        // Dead end, mark current as endpoint and close pipe
        grid[current] = `endpoint-${colorId}`
        pipe.end = current
        break
      }
      
      next = pickRandomFrom(validMoves)  // or greedy choice
      grid[next] = `pipe-${colorId}`
      pipe.path.push(next)
      current = next
      if (wasATurn(lastDirection, nextDirection)) turns++
    }
    
    pipes.push(pipe)
    colorId++
  }
  
  // Extract endpoints
  endpoints = pipes.map(p => ({
    color: p.colorId,
    a: p.start,
    b: p.end
  }))
  
  return {size: gridSize, endpoints, tier: calculateTier(endpoints.length)}
}
```

## Algorithm Properties
- **Deterministic option**: Use seeded random for reproducibility
- **Solvability**: By construction, each puzzle has exactly one solution (the original pipe paths)
- **Difficulty**: Can scale by adjusting maxTurns, minSpacing, and number of colors
- **Flexibility**: Works for any grid size; no hardcoding needed

## Advantages
- Generates solvable puzzles automatically
- Works for all grid sizes
- Puzzle difficulty can be tuned via parameters
- No manual design needed
- Each puzzle is unique (if using true randomness)
