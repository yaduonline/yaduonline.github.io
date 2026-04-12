# Loopfront - Game Design (Iteration 1 Plan)

## Design Goals
- Keep the first build deterministic and testable.
- Preserve visual smoothness while using a high-resolution grid for robust territory logic.
- Separate simulation from rendering to support iterative feature delivery.

## Architecture

### Modules (single-file logical sections)
Even though production is a single `index.html`, code is organized in sections:
1. Config
2. Types and state model
3. Input system
4. Simulation (movement, tails, capture, elimination)
5. Camera system
6. Rendering (world, players, tails, minimap, UI)
7. CPU behavior
8. Game loop/state transitions

## State Model

### Global State
- `gamePhase`: `running | ended`
- `winnerId`: player id or `null`
- `tick`: simulation tick count
- `world`: ownership grid + metadata
- `players`: array of player objects
- `camera`: viewport origin + dimensions + follow tuning
- `config`: runtime constants

### Player State
- `id`
- `type`: `user | cpu`
- `alive`: boolean
- `color`: base territory color
- `accentColor`: outline color (user uses fixed high-contrast value)
- `pos`: floating-point world position (for smooth movement)
- `headingIndex`: integer [0..15]
- `speed`: scalar (same for all at baseline)
- `ownedSeed`: initial owned corner zone reference
- `tailActive`: boolean
- `tailPath`: ordered array of sampled points/cells while outside territory
- `stats`: captured area, eliminations

### World State
- `width`, `height` in logical cells
- `ownershipGrid`: per-cell owner id or `-1` for unowned
- Optional render cache for territory layers

## Simulation Model

### High-Resolution Grid + Smooth Motion
- Ownership/collision evaluated on logical grid cells.
- Player moves in world units each tick using a 16-direction unit vector table.
- Player dot and tail thickness rendered in pixels, larger than a single cell.
- Tail path is sampled at fixed spatial intervals and projected to touched cells.

### Direction System (16-way)
- Precompute 16 evenly spaced direction vectors.
- Keyboard arrows adjust heading by step(s):
  - Left/right keys rotate heading index.
  - Up/down can bias forward steering behavior in MVP mapping.
- Touch swipe computes angle from start/end points and maps to nearest heading index.

### Tail Lifecycle
- If current position is inside own territory: `tailActive = false`, `tailPath` cleared.
- On first step outside own territory: activate tail and start path.
- While outside territory: append path samples.
- Loop closure candidate occurs when player re-enters own territory with an active tail.

### Loop Capture (MVP approach)
1. Build a temporary barrier from tail path + touched boundary contact.
2. Flood-fill regions on a local bounding box.
3. Select enclosed region that should be captured by the returning player.
4. Mark enclosed cells + path cells as owned by that player.
5. Clear tail path and deactivate tail.

Notes:
- This gives deterministic captures and supports non-square looking territory due to dense grid + 16-direction travel.

### Elimination Logic
- A player with active tail is vulnerable.
- If player A intersects vulnerable tail of player B:
  - B is eliminated (alive=false), unless B already dead.
- Initial default rule: self-tail death disabled.
- Config flag `allowSelfTailDeath` can enable self-elimination checks.

### End Conditions
- If user eliminated: end match immediately.
- Else if all CPUs eliminated: end match immediately.
- On end: compute winner by largest owned cell count.

## Camera Design

### Behavior
- Camera has a dead-zone rectangle inside viewport.
- While user remains in dead-zone, camera does not pan.
- If user exits dead-zone in movement direction, camera pans smoothly with look-ahead offset.
- User is kept visible and generally in focus but not fixed at center.

### Data
- `camera.x`, `camera.y`
- `camera.viewWidth`, `camera.viewHeight`
- `camera.deadZone` (left/right/top/bottom padding)
- `camera.lookAheadDistance`
- `camera.panLerp`

## Rendering Design

### Layers (back to front)
1. World background grid
2. Territory fills (semi-transparent by owner)
3. Territory boundaries
4. Tails
5. Player arrows (rotated to heading; user with high-contrast accent ring/outline)
6. HUD and always-visible minimap

### Arrow Shape Design
- Each player avatar is a chevron/arrow shape, not a circle.
- Arrow tip points in the current heading direction.
- Drawn via canvas path: a pointed front, flared rear wings.
- Arrow is rotated by `headingIndex * (2π / 16)` radians at render time.
- Arrow fill is the player's base color; stroke is accentColor (user) or a darker shade of base color (CPU).
- Size: arrow fits within a radius of `PLAYER_RADIUS` world units (configurable).

### Minimap
- Fixed corner overlay.
- Shows full ownership map at reduced scale.
- Draw players as small dots.
- Draw camera viewport rectangle.
- Always visible on desktop and mobile.

## CPU Baseline Design
- Rule-based lightweight steering:
  - Prefer moving outward from own region briefly.
  - Attempt return path to close loop.
  - Avoid immediate boundary traps.
- CPU quality target for iteration 1:
  - Must reliably create and close small loops.
  - Must respect same movement/tail/elimination rules.

## Performance Strategy
- Fixed timestep simulation (for deterministic rules).
- Decouple simulation update rate from render frame rate.
- Use dirty-rect or cached ownership texture updates where possible.
- Keep flood-fill bounded to local candidate region instead of full map.

## Testing Strategy (during implementation)
- Unit-like checks for:
  - Heading mapping
  - Tail activation/deactivation
  - Loop closure and area capture
  - Tail intersection elimination
  - End-condition evaluation
- Manual gameplay checks on desktop keyboard and mobile touch swipe.

## Iteration Boundaries
- Iteration 1: playable core with one HTML file, user controls, 3 CPUs, capture/elimination/end-state, minimap, camera dead-zone follow.
- Iteration 2+: AI quality, balancing, polish, effects, optional dynamic CPU count setting UI.
