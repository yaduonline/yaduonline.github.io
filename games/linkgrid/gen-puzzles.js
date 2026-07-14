#!/usr/bin/env node
// Puzzle generator with backtracking-based pipe generation algorithm

/**
 * Configuration for puzzle generation
 */
const CONFIG = {
  minSpacing: 2,           // Min Manhattan distance between turns
  fillThreshold: 0.85,     // Target fill percentage (0-1)
  maxBacktrackAttempts: 100,
  maxTurnsPerSize: (size) => 1 + Math.floor(size / 4),
};

/**
 * Cell state constants
 */
const CELL_STATE = {
  EMPTY: -1,
  ENDPOINT: 'endpoint',
  PIPE: 'pipe',
};

/**
 * Utility: Manhattan distance between two cells
 */
function manhattanDistance(a, b) {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
}

/**
 * Utility: Get orthogonal neighbors of a cell
 */
function getOrthogonalNeighbors(cell, gridSize) {
  const [r, c] = cell;
  const neighbors = [];
  const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  
  for (const [dr, dc] of directions) {
    const nr = r + dr;
    const nc = c + dc;
    if (nr >= 0 && nr < gridSize && nc >= 0 && nc < gridSize) {
      neighbors.push([nr, nc]);
    }
  }
  return neighbors;
}

/**
 * Utility: Pick random element from array
 */
function pickRandom(arr) {
  if (arr.length === 0) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Utility: Count filled cells in grid
 */
function countFilledCells(grid, gridSize) {
  let count = 0;
  for (let i = 0; i < gridSize; i++) {
    for (let j = 0; j < gridSize; j++) {
      if (grid[i][j] !== CELL_STATE.EMPTY) {
        count++;
      }
    }
  }
  return count;
}

/**
 * Get all empty cells in grid
 */
function getEmptyCells(grid, gridSize) {
  const empty = [];
  for (let i = 0; i < gridSize; i++) {
    for (let j = 0; j < gridSize; j++) {
      if (grid[i][j] === CELL_STATE.EMPTY) {
        empty.push([i, j]);
      }
    }
  }
  return empty;
}

/**
 * Initialize empty grid
 */
function initializeGrid(gridSize) {
  const grid = [];
  for (let i = 0; i < gridSize; i++) {
    grid[i] = [];
    for (let j = 0; j < gridSize; j++) {
      grid[i][j] = CELL_STATE.EMPTY;
    }
  }
  return grid;
}

/**
 * DFS backtracking to grow a pipe from start cell
 * Returns {path, end} where path is array of cells and end is final endpoint
 */
function drawPipe(grid, gridSize, startCell, colorId, maxTurns) {
  const path = [startCell];
  let current = startCell;
  let prevDirection = null;
  let turns = 0;
  const visited = new Set();
  visited.add(`${startCell[0]},${startCell[1]}`);
  
  let attempts = 0;
  
  while (attempts < CONFIG.maxBacktrackAttempts) {
    attempts++;
    
    // Check if we've reached max turns
    if (turns >= maxTurns) {
      break;
    }
    
    const neighbors = getOrthogonalNeighbors(current, gridSize);
    
    // Filter valid moves: must be empty and respect spacing
    let validMoves = neighbors.filter(neighbor => {
      const key = `${neighbor[0]},${neighbor[1]}`;
      if (visited.has(key)) return false;
      if (grid[neighbor[0]][neighbor[1]] !== CELL_STATE.EMPTY) return false;
      
      // Check spacing constraint if last move was a turn
      if (path.length >= 2) {
        const lastCell = path[path.length - 1];
        const secondLast = path[path.length - 2];
        const direction = [neighbor[0] - current[0], neighbor[1] - current[1]];
        const lastDirection = [lastCell[0] - secondLast[0], lastCell[1] - secondLast[1]];
        
        // Check if this is a turn (direction change)
        const isTurn = direction[0] !== lastDirection[0] || direction[1] !== lastDirection[1];
        if (isTurn && path.length >= 2) {
          // Must be at least minSpacing away from previous turn
          let lastTurnIndex = path.length - 1;
          for (let i = path.length - 2; i >= 0; i--) {
            const prev = path[i];
            const next = path[i + 1];
            const dir = [next[0] - prev[0], next[1] - prev[1]];
            const prevDir = i > 0 ? [path[i][0] - path[i-1][0], path[i][1] - path[i-1][1]] : null;
            
            if (prevDir && (dir[0] !== prevDir[0] || dir[1] !== prevDir[1])) {
              lastTurnIndex = i + 1;
              break;
            }
          }
          
          const distFromTurn = manhattanDistance(neighbor, path[lastTurnIndex]);
          if (distFromTurn < CONFIG.minSpacing) {
            return false;
          }
        }
      }
      
      return true;
    });
    
    if (validMoves.length === 0) {
      // Try relaxing spacing constraint if we're stuck
      validMoves = neighbors.filter(neighbor => {
        const key = `${neighbor[0]},${neighbor[1]}`;
        if (visited.has(key)) return false;
        if (grid[neighbor[0]][neighbor[1]] !== CELL_STATE.EMPTY) return false;
        return true;
      });
    }
    
    if (validMoves.length === 0) {
      // Dead end - stop here
      break;
    }
    
    // Pick random valid move
    const next = pickRandom(validMoves);
    
    // Check if this is a turn
    if (path.length >= 2) {
      const lastCell = path[path.length - 1];
      const secondLast = path[path.length - 2];
      const lastDir = [lastCell[0] - secondLast[0], lastCell[1] - secondLast[1]];
      const newDir = [next[0] - current[0], next[1] - current[1]];
      
      if (lastDir[0] !== newDir[0] || lastDir[1] !== newDir[1]) {
        turns++;
      }
    }
    
    path.push(next);
    visited.add(`${next[0]},${next[1]}`);
    current = next;
  }
  
  return { path, end: current };
}

/**
 * Generate a single puzzle for given grid size and difficulty tier
 */
function generatePuzzle(gridSize, tier) {
  const grid = initializeGrid(gridSize);
  const pipes = [];
  const targetFill = CONFIG.fillThreshold;
  const targetCellsFilled = Math.floor(gridSize * gridSize * targetFill);
  
  // Determine number of colors based on tier
  const colorCount = tier === 5 ? 5 : tier >= 3 ? 4 : 3;
  const maxTurns = CONFIG.maxTurnsPerSize(gridSize);
  
  let colorId = 0;
  let attempts = 0;
  const maxPipeAttempts = colorCount * 3;
  
  while (colorId < colorCount && attempts < maxPipeAttempts) {
    attempts++;
    
    const emptyCells = getEmptyCells(grid, gridSize);
    if (emptyCells.length === 0) break;
    
    // Pick random empty cell for start
    const startCell = pickRandom(emptyCells);
    
    // Mark as endpoint
    grid[startCell[0]][startCell[1]] = `${CELL_STATE.ENDPOINT}-${colorId}`;
    
    // Draw pipe
    const turnsForThisPipe = Math.floor(maxTurns * (0.5 + Math.random() * 0.5)); // Vary between 50-100% of max
    const { path, end } = drawPipe(grid, gridSize, startCell, colorId, turnsForThisPipe);
    
    // Mark all cells in path (except start which is already marked)
    for (let i = 1; i < path.length; i++) {
      const cell = path[i];
      grid[cell[0]][cell[1]] = `${CELL_STATE.PIPE}-${colorId}`;
    }
    
    // Mark end as endpoint
    grid[end[0]][end[1]] = `${CELL_STATE.ENDPOINT}-${colorId}`;
    
    pipes.push({
      colorId,
      path,
      start: startCell,
      end
    });
    
    colorId++;
  }
  
  // Extract endpoints for puzzle
  const endpoints = pipes.map(pipe => ({
    color: pipe.colorId,
    a: pipe.start,
    b: pipe.end
  }));
  
  return { endpoints, pipes, grid };
}

/**
 * Generate puzzle pack for a given size
 */
function generatePuzzlePack(gridSize, puzzlesPerTier = 3) {
  const puzzles = [];
  
  for (let tier = 1; tier <= 5; tier++) {
    for (let idx = 1; idx <= puzzlesPerTier; idx++) {
      const puzzleNum = (tier - 1) * puzzlesPerTier + idx;
      const { endpoints } = generatePuzzle(gridSize, tier);
      
      puzzles.push({
        id: `${gridSize}-${puzzleNum}`,
        size: gridSize,
        tier,
        endpoints
      });
    }
  }
  
  return puzzles;
}

/**
 * Generate all puzzle packs
 */
function generatePuzzles() {
  const puzzles = {};
  
  for (const size of [5, 6, 7, 8, 9, 10]) {
    puzzles[size.toString()] = generatePuzzlePack(size);
  }
  
  return puzzles;
}

// Export for Node.js or generate if run directly
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    generatePuzzles,
    generatePuzzlePack,
    generatePuzzle,
    generatePuzzles_v2: generatePuzzles, // For testing/comparison
  };
}

// If run as CLI script
if (require.main === module) {
  const puzzles = generatePuzzles();
  console.log(JSON.stringify(puzzles, null, 2));
}
