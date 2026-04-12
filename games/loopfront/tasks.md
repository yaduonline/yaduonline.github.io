# Loopfront - Iterative Task List

## Workflow
- Complete tasks in strict order within each iteration.
- Each step lists its own embedded tests. Tests go into `test.html` alongside `index.html`.
- Mark a step done only when its implementation AND its tests pass.
- Keep all production code in a single `index.html`; `test.html` is the standalone test runner.

---

## Iteration 1 — Core Playable Baseline

### A. Project Scaffold
- [ ] Create `games/loopfront/index.html` with `<canvas id="game">`, HUD bar, and minimap container.
- [ ] Add color palette constants (CSS variables + JS CONFIG palette block); soothing non-neon tones.
- [ ] Responsive layout: canvas fills available height below HUD; minimap pinned to bottom-right corner.
- [ ] Wire shared site header/footer include script.
- [ ] Create `test.html` stub: imports logic helpers once extracted; shows pass/fail results in browser.
  **Tests (A)**
  - [ ] Page loads without JS errors in Chrome and Firefox.
  - [ ] Canvas element is present and non-zero sized after load.
  - [ ] Minimap container is visible in corner and does not overlap HUD.
  - [ ] Site header and footer are injected.

### B. Config, State, and Spawn
- [ ] Define `CONFIG` block: `MAP_CELLS`, `CELL_SIZE`, `PLAYER_SPEED`, `CPU_COUNT=3`, `PLAYER_RADIUS`, `allowSelfTailDeath=false`, camera tuning, minimap size.
- [ ] Precompute `DIRECTIONS[16]`: unit vectors at 0, 22.5, 45 … 337.5 degrees, normalised.
- [ ] Implement `initState()`: returns full fresh game state with `phase='running'`.
- [ ] Spawn all 4 players at 4 corners; initial heading for each points inward toward map center.
- [ ] Seed square owned territory at each corner (configurable seed size).
- [ ] Mark seeded cells in `ownershipGrid`.
  **Tests (B)**
  - [ ] `DIRECTIONS[16]` — each vector has unit length within floating-point tolerance.
  - [ ] `DIRECTIONS[i]` and `DIRECTIONS[(i+8)%16]` are exact opposites.
  - [ ] `initState()` returns 4 players, each `alive=true`, `tailActive=false`.
  - [ ] Each player's initial `pos` is inside the map bounds.
  - [ ] Each player's initial heading points toward map center (dot product with center-vector is positive).
  - [ ] `ownershipGrid` has each corner's seed cells owned by the correct player id.
  - [ ] Total seeded cells equals `4 × SEED_SIZE²` (no overlap given non-touching corners).

### C. Input
- [ ] Keyboard handler: `ArrowLeft`/`ArrowRight` rotate heading index by ±1; `ArrowUp` rotates by +2 toward turn-left, `ArrowDown` by -2 (or configurable turn step).
- [ ] Prevent double-back: block heading change if new heading is the exact reverse (index offset 8).
- [ ] Touch handler: `touchstart` records start point; `touchend` computes swipe angle and maps to nearest of 16 headings.
- [ ] Minimum swipe distance threshold (20 px default) to ignore accidental micro-taps.
- [ ] `passive:false` + `preventDefault()` on touch events to block page scroll during play.
  **Tests (C)**
  - [ ] `angleToHeadingIndex(angle)` — test all 16 exact heading angles map to correct index.
  - [ ] `angleToHeadingIndex` — angles at midpoints between headings round to nearest index.
  - [ ] Double-back guard: requesting heading index `(current+8)%16` leaves heading unchanged.
  - [ ] Swipe distance below threshold: heading unchanged.
  - [ ] Swipe of 0°, 90°, 180°, 270° each map to the expected cardinal heading index.
  - [ ] Diagonal swipe (45°) maps to index 2 (NE equivalent).

### D. Simulation Core
- [ ] Fixed-timestep game loop using `requestAnimationFrame` + delta accumulator; tick rate configurable.
- [ ] Each tick: advance all alive players by `PLAYER_SPEED × DIRECTIONS[headingIndex]`.
- [ ] Clamp positions to map bounds (players cannot leave the map).
- [ ] `isInsideOwnTerritory(player, ownershipGrid)`: returns true if the player's current cell is owned by that player.
- [ ] Tail lifecycle: enter territory → deactivate tail + clear path; exit territory → activate tail, begin recording path points.
- [ ] Tail sampling: record a path point whenever player has moved at least `TAIL_SAMPLE_DIST` world units since last sample; project occupied cells onto `tailGrid` (separate from ownership).
  **Tests (D)**
  - [ ] Player moves exactly `PLAYER_SPEED` world units per tick (magnitude of position delta).
  - [ ] Position is clamped: player stopped at map edge does not go out of bounds.
  - [ ] `isInsideOwnTerritory` returns true for a cell seeded to that player; false for unowned cell; false for cell owned by a different player.
  - [ ] `tailActive` becomes true after player moves one step outside own territory.
  - [ ] `tailActive` becomes false and `tailPath` clears when player re-enters own territory.
  - [ ] Tail path point count grows as player moves outside territory.
  - [ ] No tail path points accumulate while player is inside own territory.

### E. Capture System
- [ ] `detectLoopClosure(player, ownershipGrid)`: returns true when player with active tail re-enters own territory.
- [ ] On closure: collect all `tailPath` cells plus a flood-fill of the enclosed region.
- [ ] Flood-fill bounded to a padded bounding box of the tail path; fills cell not owned by this player and not on the tail path itself.
- [ ] Mark all captured + path cells with player's owner id in `ownershipGrid`.
- [ ] Deactivate tail and reset path; increment `stats.capturedArea`.
- [ ] Handle edge case: tail re-enters territory through a cell already owned (no dangling partial path).
  **Tests (E)**
  - [ ] Straight-line exit then straight return to territory boundary = closure detected.
  - [ ] A closed rectangular tail path captures all interior cells as owned.
  - [ ] Diagonal tail path (using 45° heading) captures a diamond-like region; no cell outside the path convex hull is incorrectly claimed.
  - [ ] After capture, `tailActive=false` and `tailPath` is empty.
  - [ ] `stats.capturedArea` equals number of newly claimed cells.
  - [ ] Flood-fill does not overwrite cells already owned by the capturing player.
  - [ ] Flood-fill does not escape the bounding box padding boundary.

### F. Elimination and Match End
- [ ] Each tick: for every pair `(A, B)` where A is alive and B has `tailActive`, check if A's current cell intersects any cell in B's `tailGrid`.
- [ ] If intersection: eliminate B (set `alive=false`, `tailActive=false`).
- [ ] Self-tail check: when `allowSelfTailDeath=true`, also check player against their own `tailGrid` cells (skip own head segment).
- [ ] After eliminations: check end conditions.
  - End if user is eliminated.
  - End if all CPUs are eliminated.
- [ ] On end: compute winner as player with highest `stats.capturedArea`; set `phase='ended'` and `winnerId`.
- [ ] Show end overlay: "You Win" / "You Lose" with area stats for all players; Restart button.
  **Tests (F)**
  - [ ] Player B with active tail: player A moving onto a cell in B's tailGrid → B gets `alive=false`.
  - [ ] Player B with no tail: player A moving through B's position → B is NOT eliminated (no tail = safe).
  - [ ] `allowSelfTailDeath=false`: player moving onto own tailGrid → not eliminated.
  - [ ] `allowSelfTailDeath=true`: player moving onto own tailGrid cell → eliminated.
  - [ ] End condition: user eliminated → `phase='ended'`, `winnerId` is whichever player has most territory.
  - [ ] End condition: all 3 CPUs dead, user alive → `phase='ended'`.
  - [ ] Winner computed correctly when two or more players have different area counts.

### G. Camera and Rendering
- [ ] Camera state: `{x, y, viewW, viewH, deadZone, lookAhead, panLerp}`.
- [ ] Camera update: if user exits dead-zone in movement direction, lerp camera toward user + lookAhead offset.
- [ ] Render world background, grid lines (subtle), territory fills (semi-transparent per owner), territory edges.
- [ ] Render tails as thick polylines along `tailPath` points.
- [ ] Render each player as an arrow shape rotated to `headingIndex`; fill with player color.
- [ ] User arrow has an outer accent ring (fixed high-contrast color, e.g. bright white or gold).
- [ ] Minimap: always visible, bottom-right; draw ownership grid at reduced scale; draw player dots; draw viewport rectangle.
  **Tests (G)**
  - [ ] `worldToScreen(worldPos, camera)` — point at camera origin maps to `(0, 0)`.
  - [ ] `worldToScreen` — point one `viewW` to the right of camera origin maps to `(viewW, 0)`.
  - [ ] Camera dead-zone: user moves within dead-zone → camera position unchanged over 10 ticks.
  - [ ] Camera pan: user exits dead-zone forward → `camera.x or y` shifts toward user after a few ticks.
  - [ ] `drawArrow(ctx, heading)` — calling with all 16 headings does not throw; canvas state restored after each call.
  - [ ] Arrow tip pixel for heading 0 is further right (in screen space) than body pixels (directional check).

### H. CPU Baseline
- [ ] CPU steering: each tick, CPU picks a target heading from simple rule set:
  - If inside own territory: head outward (away from owned centroid).
  - If outside territory: head back toward nearest own territory cell to complete loop.
- [ ] CPU applies same heading-change rules as player (no double-back).
- [ ] CPU shares same speed, tail lifecycle, capture, and elimination logic (no special cases).
  **Tests (H)**
  - [ ] CPU with `tailActive=false` inside territory: chosen heading has a positive component away from territory centroid.
  - [ ] CPU with `tailActive=true` outside territory: chosen heading has a positive component toward nearest owned cell.
  - [ ] CPU can successfully capture at least one territory region in a simulated 500-tick run.
  - [ ] CPU is eliminated correctly when user tail is crossed (uses same elimination path as user elimination test).
  - [ ] All 4 players have identical `PLAYER_SPEED` magnitude per tick.

---

## Iteration 2 — Balance and Quality
- [ ] Improve CPU pathing: avoid obvious death paths (check if proposed heading crosses another live player's tail).
- [ ] Add pre-game CPU count selector (1–3) without changing default behavior.
- [ ] Add visual polish: capture flash animation, elimination burst, smoother territory boundary drawing.
- [ ] Add pause (`P` key / two-finger tap) and Restart controls.
- [ ] Better HUD: live territory % per player, player alive indicators.
- [ ] Tests for pause/resume state transitions and CPU count setting.

---

## Current Next Task
- [ ] **1.A** — Implement initial scaffold in `games/loopfront/index.html` and create `test.html` stub.
