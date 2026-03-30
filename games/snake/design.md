# Snake Game — Design Document

> **Current iteration**: Iteration 3 — Food Variety, Speed & Sound  
> Update this file at the start of each new iteration to reflect new components, changed logic, and additional tests.

---

## 1. File Structure

```
games/snake/
├── index.html     # Complete game — HTML + CSS + JS in one file
├── test.html      # Self-contained test runner (no external deps)
├── prompt.md      # Feature specification
└── design.md      # This file — architecture, logic flow, test strategy
```

`index.html` is the only production file. `test.html` is a standalone browser-based test runner that imports only the logic extracted from `index.html` (no rendering, no DOM game loop) and verifies it in isolation.

---

## 2. Components (Iteration 1)

The game is divided into four logical layers. Each layer has a clear responsibility and defined boundary.

---

### 2.1 State

A single `gameState` object is the source of truth for all mutable game data. No game logic reads from the DOM.

```
gameState {
    snake:      Array<{x, y}>   // ordered head-first; snake[0] = head
    direction:  {dx, dy}        // current movement vector, e.g. {dx:1, dy:0} = right
    nextDir:    {dx, dy}        // queued direction from player input, applied next tick
    food:       {x, y}          // single apple position
    score:      number          // current score
    status:     string          // 'idle' | 'playing' | 'paused' | 'game-over'
}
```

**Constants** (not in gameState — fixed for the session):
```
GRID_SIZE        = 20          // number of cells per side
LS_HIGHSCORE_KEY = 'snake_highscore'   // localStorage key

// Speed progression: tick interval by snake length
SPEED_TABLE = [
    { minLen:  3, tickMs: 200 },
    { minLen:  6, tickMs: 170 },
    { minLen: 11, tickMs: 145 },
    { minLen: 16, tickMs: 125 },
    { minLen: 21, tickMs: 110 },
    { minLen: 31, tickMs:  95 },
];
```

`getTickMs(length)` — pure function, returns the correct tick interval for the current snake length. Used by the game loop instead of a fixed `TICK_MS`.

---

### 2.2 Logic

Pure functions that operate on `gameState` data. They take state as input and return new state or a derived value. They do **not** touch the DOM, canvas, or any browser APIs.

| Function | Signature | Description |
|---|---|---|
| `initState()` | `() → gameState` | Returns a fresh initial state: snake at center, facing right, random food, score 0, status 'idle'. |
| `wrapCoord(val, max)` | `(number, number) → number` | Wraps a coordinate using modulo: `((val % max) + max) % max`. Handles negative values, exact-boundary, and multi-step overflows correctly. |
| `nextHead(snake, dir)` | `(Array, {dx,dy}) → {x,y}` | Returns the cell the head will move into next tick, after wrap-around is applied. |
| `isSelfCollision(head, snake)` | `({x,y}, Array) → boolean` | Returns `true` if `head` matches any cell in `snake` (excluding the current head at index 0). |
| `isOppositeDir(a, b)` | `({dx,dy}, {dx,dy}) → boolean` | Returns `true` if `b` is the exact reverse of `a` (e.g. right vs left). Used to block illegal direction reversals. |
| `spawnFood(snake, existing)` | `(Array, {x,y}|null) → {x,y}` | Returns a random grid cell not occupied by the snake or existing food. |
| `tick(state)` | `(gameState) → gameState` | Advances the game by one tick. Returns the updated state. See section 3 for full logic. |
| `getTickMs(length)` | `(number) → number` | Returns the tick interval in ms for the given snake length, using the speed progression table. |
| `spawnSpecialFood(type, snake, existingFoods)` | `(string, Array, Array) → specialFood` | Spawns a cherry or golden apple at a random free cell. Returns `{type, x, y, expiresAt}`. |

---

### 2.3 Meta Bar

A 48px-tall fixed bar above the canvas (dark teal `#2e5c4e`, matching car-racing). Always visible. Contains:

| Element | ID | Description |
|---|---|---|
| Score | `#score-display` | Updates every tick |
| Best | `#best-display` | Loaded from `localStorage` on init; updated when new high score is set |
| Length | `#length-display` | `snake.length`, updates every tick |
| Sound toggle | `#sound-btn` | `🔇` by default; click to toggle `🔊`. Mute state stored in `soundEnabled` variable |
| Restart | `#restart-btn` | Always visible; calls `resetGame()` at any point |

### 2.9 Special Food System (new in iteration 3)

Three food types exist simultaneously on the board:

| Type | Color | Points | Lifespan | Trigger |
|---|---|---|---|---|
| Apple | `#ef4444` red | +1 | Permanent | Always 1 on board |
| Cherry | `#9f1239` dark red | +3 | 10 000ms | Spawns when `applesEaten % 5 === 0` (and > 0) |
| Golden apple | `#fbbf24` gold | +5 | 7 000ms | 15% random chance each time apple is eaten; max 1 at a time |

**State additions:**
```
gameState {
    ...existing fields...
    applesEaten:  number         // counts apple eats; triggers cherry
    cherry:       {x,y,expiresAt} | null
    goldenApple:  {x,y,expiresAt} | null
}
```

**Tick additions:**
- After eating any food, check cherries/golden apple: if `Date.now() > expiresAt`, remove them.
- Check if head overlaps cherry or golden → eat, add points, clear slot.
- On apple eat: maybe spawn cherry (every 5th apple) and maybe spawn golden (15% chance).
- `expiresAt` is a wall-clock timestamp (`Date.now() + durationMs`). The renderer draws a countdown timer as text above each special food cell.

### 2.10 Web Audio Sound System (new in iteration 3)

All sounds synthesized via `AudioContext` + `OscillatorNode` + `GainNode`. No audio files, no external dependencies. Muted by default — `soundEnabled = false`.

```
playSound(type)
  type: 'eat-apple' | 'eat-cherry' | 'eat-golden' | 'game-over' | 'pause'
```

Each call creates a fresh oscillator, connects it to a `GainNode`, schedules the envelope (attack + release), and disconnects on end. The `AudioContext` is created lazily on first user interaction (browser autoplay policy).

| Event | Waveform | Frequency envelope | Duration |
|---|---|---|---|
| eat-apple | sine | 440 → 880 Hz | 80ms |
| eat-cherry | sine | 440 → 660 → 880 Hz (2 notes) | 120ms |
| eat-golden | sine | 440 → 660 → 880 → 1100 Hz (3 notes) | 200ms |
| game-over | sawtooth | 440 → 110 Hz | 400ms |
| pause | sine | 330 Hz flat | 50ms |

---

### 2.4 Renderer

Reads from `gameState` and draws to the `<canvas>`. Called after every tick and after every input that changes visual state. Does not mutate state.

**Responsibilities:**
- Draw the grid background and subtle grid lines.
- Draw each snake segment with rounded corners. Head is visually distinct (brighter green, slightly larger).
- Draw direction eyes on the head to show which way it faces.
- Draw the food item (red circle).
- Draw overlays:
  - `idle`: title + "Press any arrow key to start"
  - `paused`: semi-transparent overlay + "PAUSED" centered
  - `game-over`: overlay + score + "Press any key / Restart to play again"
- Update meta bar DOM elements (score, best, length) after each tick.

**Canvas sizing:** On page load and on `resize` events, recalculate `cellSize = Math.floor(min(canvasWidth, canvasHeight) / GRID_SIZE)`. The canvas is always square; centered in the available area with CSS.

---

### 2.5 Input Handler

Listens to browser events and writes the queued direction change to `gameState.nextDir`. Does not run game logic.

**Keyboard:**
- `ArrowUp` / `W` → `{dx:0, dy:-1}`
- `ArrowDown` / `S` → `{dx:0, dy:1}`
- `ArrowLeft` / `A` → `{dx:-1, dy:0}`
- `ArrowRight` / `D` → `{dx:1, dy:0}`
- `Space` → toggle pause (`playing` ↔ `paused`)
- If `status === 'idle'`, the first directional key sets `status = 'playing'` and starts the tick loop.
- If `status === 'paused'`, directional keys are queued but loop is not running; Space resumes.
- If `status === 'game-over'`, any key calls `resetGame()`.
- Ignore directional input if `isOppositeDir(gameState.direction, newDir)` is true.

**Touch (new in iteration 2):**
- Track `touchstart` (x, y). On `touchend`, compute `(dx, dy)` of swipe.
- If `|dx| > |dy|`: horizontal swipe → left or right.
- If `|dy| > |dx|`: vertical swipe → up or down.
- Minimum swipe distance: 20px (ignore micro-taps as direction changes).
- Tap (swipe distance < 20px): toggle pause (same as Space).
- `passive: false` + `e.preventDefault()` on `touchstart` to block page scroll.
- If `status === 'idle'`, first swipe starts the game.

---

### 2.6 Game Loop

Uses `requestAnimationFrame` with a manual delta accumulator to fire ticks at a consistent interval regardless of display frame rate.

```
loop(timestamp):
    delta += timestamp - lastTimestamp
    lastTimestamp = timestamp
    while delta >= TICK_MS:
        state = tick(state)
        delta -= TICK_MS
    render(state)
    updateMetaBar(state)
    if state.status === 'playing':
        requestAnimationFrame(loop)
```

- Loop runs only while `status === 'playing'`.
- On pause: loop stops (no rAF). On resume: loop restarts with a fresh `lastTs` to avoid a large delta jump.
- On game-over: loop stops; `resetGame()` restarts it fresh.

### 2.7 localStorage — High Score

```
loadBest()   → number | 0           reads 'snake_highscore' from localStorage
saveBest(n)  → void                  writes to localStorage only if n > current best
```

`loadBest()` is called once on init. `saveBest(score)` is called when `status` transitions to `'game-over'`.

---

## 3. Tick Logic (Step-by-Step)

This is the core of the game, executed once per tick interval.

```
tick(state):

1. Apply queued direction
   - If nextDir is set AND not opposite to current direction:
       direction = nextDir
   - Clear nextDir

2. Compute new head position
   - newHead = nextHead(snake, direction)
   - Apply wrap-around via wrapCoord

3. Check self-collision
   - If newHead matches any cell in snake[1..end]:
       status = 'game-over'
       return state  ← stop here, do not move

4. Move the snake
   - Prepend newHead to snake array (new head)
   - If newHead === food position:
       score += 1
       Do NOT remove the tail  ← snake grows
       Spawn new food (not on snake body)
   - Else:
       Remove the last element of snake  ← snake moves without growing

5. Return updated state
```

---

## 4. Data Flow Diagram

```
Browser Events
  (keyboard)
      │
      ▼
Input Handler
  writes nextDir
  starts loop on first key
      │
      ▼
Game Loop (rAF + delta)
  fires tick every TICK_MS
      │
      ▼
tick(state) → new state
  - direction change
  - head movement
  - wrap-around
  - collision check
  - eat food / grow
      │
      ├──────────────────────▶ render(state)
      │                           - clear canvas
      │                           - draw grid
      │                           - draw snake
      │                           - draw food
      │                           - draw score
      │                           - draw overlay if game-over
      │
      ▼
  gameState (updated in place or replaced)
```

---

### 2.8 Fullscreen

- An expand button (`#expand-btn`, bottom-right corner of the canvas wrap) toggles a `fullscreen` class on `<body>`.
- When `body.fullscreen`: `#site-header` and `#site-footer` are hidden (`display:none`); `#game-view` gets `height:100vh`.
- After toggling, `resizeCanvas()` is called so the canvas re-fits the new available area.

---

## 5. Testing Strategy

### Philosophy

Game logic (tick, collision, wrap, food spawn) is **pure and deterministic** — the same inputs always produce the same outputs. These are the highest-value tests and they run with zero UI setup.

Rendering and the game loop are **not unit tested** — they are verified manually by playing the game.

### Test File

`test.html` is a self-contained browser test runner:
- No external test framework (no Jest, Mocha, etc.)
- Inline `<script>` contains the logic functions copy-pasted (or imported via a shared `logic.js` if the project grows).
- A minimal `runTests()` function executes assertions and prints results to the page.
- Open `test.html` directly in a browser to see pass/fail output.

### Test Cases — Iteration 1

#### `wrapCoord(val, max)`
| # | Input | Expected | Reason |
|---|---|---|---|
| W1 | `wrapCoord(20, 20)` | `0` | Exit right → enter left |
| W2 | `wrapCoord(-1, 20)` | `19` | Exit left → enter right |
| W3 | `wrapCoord(0, 20)` | `0` | No wrap needed |
| W4 | `wrapCoord(19, 20)` | `19` | No wrap needed |
| W5 | `wrapCoord(21, 20)` | `1` | Two cells past right edge |

#### `isOppositeDir(a, b)`
| # | a | b | Expected |
|---|---|---|---|
| D1 | right `{1,0}` | left `{-1,0}` | `true` |
| D2 | right `{1,0}` | up `{0,-1}` | `false` |
| D3 | up `{0,-1}` | down `{0,1}` | `true` |
| D4 | up `{0,-1}` | right `{1,0}` | `false` |

#### `nextHead(snake, dir)`
| # | Head | Dir | Expected |
|---|---|---|---|
| N1 | `{x:10, y:10}` | right | `{x:11, y:10}` |
| N2 | `{x:19, y:10}` | right | `{x:0, y:10}` | wrap right→left |
| N3 | `{x:0, y:0}` | up | `{x:0, y:19}` | wrap top→bottom |
| N4 | `{x:0, y:19}` | down | `{x:0, y:0}` | wrap bottom→top |

#### `isSelfCollision(head, snake)`
| # | Head | Snake body | Expected |
|---|---|---|---|
| C1 | `{x:5, y:5}` | `[{x:5,y:5}, {x:4,y:5}, {x:3,y:5}]` | `false` | head at index 0 never collides with itself |
| C2 | `{x:4, y:5}` | `[{x:5,y:5}, {x:4,y:5}, {x:3,y:5}]` | `true` | head moves into neck |
| C3 | `{x:9, y:9}` | `[{x:5,y:5}, {x:4,y:5}]` | `false` | no overlap |

#### `tick(state)` — movement
| # | Scenario | Expected outcome |
|---|---|---|
| T1 | Snake moving right, no food ahead | Head advances right by 1, tail removed, length unchanged |
| T2 | Snake moving right, food at next cell | Head advances, tail NOT removed, length +1, score +1, new food spawned |
| T3 | Snake moving right, next cell wraps grid edge | Head appears at left edge, same row |
| T4 | Snake head about to move into body cell | `status` becomes `'game-over'`, snake positions unchanged |
| T5 | `nextDir` is opposite of current direction | Direction unchanged, `nextDir` cleared, no crash |
| T6 | `nextDir` is valid perpendicular direction | Direction updates to `nextDir` before move |

#### `spawnFood(snake, existing)`
| # | Scenario | Expected |
|---|---|---|
| F1 | Snake occupies 3 cells, food is null | Returns a cell not in those 3 cells |
| F2 | Snake fills 399 of 400 cells | Returns the one remaining free cell |

#### `loadBest()` and `saveBest(n)` — iteration 2
| # | Scenario | Expected |
|---|---|---|
| LS1 | `loadBest()` when localStorage empty | `0` |
| LS2 | `saveBest(10)` then `loadBest()` | `10` |
| LS3 | `saveBest(5)` after `saveBest(10)` then `loadBest()` | `10` (lower score not saved) |
| LS4 | `saveBest(15)` after `saveBest(10)` then `loadBest()` | `15` (higher score overwrites) |

*(Note: localStorage tests run in browser only — not available in pure Node environments.)*

### Running Tests

1. Open `games/snake/test.html` in any browser.
2. Results are printed as a list: ✅ PASS or ❌ FAIL with the expected vs actual values.
3. All tests must pass before committing a build.

---

## 6. Known Limitations (Iteration 3)

- All MVP features are complete. No known limitations.
- Future potential: difficulty select, route/theme select, 2-player mode.
