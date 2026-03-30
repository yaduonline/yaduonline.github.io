# Car Racing Game Prompt

## Overview
A top-down car racing game where the player drives one car on a four-lane highway from a start line to a finish line, navigating slower traffic cars and racing against 3 CPU opponents. Supports both keyboard and touch controls for cross-device playability.

---

## What Has Been Built (Current State)

### Layout & UI
- Single HTML file, pure vanilla JS/CSS/HTML, no external dependencies.
- **Meta bar** (48px, dark teal `#2e5c4e`) fixed at the top of the game view showing:
  - Speed (e.g. `87 km/h`) — fixed-width column, always single line, system default font
  - Position (e.g. `2/4`) — updates live every frame based on race order
  - Time — starts as `--`, ticks live at 0.1s precision during race, freezes to 0.01s at finish
  - **Race Again** button (hidden until race is finished)
- **Expand/collapse button** (bottom-right) toggles fullscreen by hiding the site header/footer.

### Road & Terrain
- Four-lane road rendered with CSS, scrolling lane markers.
- Scrolling terrain on both sides (grass, trees, rocks).

### Race States
`countdown → pre → racing → finishing → finished`
- **countdown**: 3-2-1-GO! overlay shown, all input blocked, no cars move.
- **pre**: cars move but timer hasn't started; timer starts the moment the player crosses the start line.
- **racing**: live timer ticking at 0.1s.
- **finishing**: player crosses finish line — timer freezes, car coasts to a stop (`friction × 10`).
- **finished**: Race Again button appears, final position locked in meta bar.

### Player Car
- Top-down teal car with mirrors, headlights, tail lights, spoiler.
- Spawns at the start line on page load with countdown.
- **Keyboard**: Up/Down arrows accelerate/decelerate; Left/Right change lanes.
- **Touch**: Tap/hold to accelerate; swipe left/right to change lanes; swipe down to decelerate.
- Touch events use `passive: false` + `preventDefault()` to prevent page scroll.

### Physics
- `maxSpeed = 160`, `acceleration = 0.6`, `friction = 0.4`
- Speed interpolates toward `targetSpeed` each frame with friction-based braking.

### Traffic Cars
- 8 background traffic cars in 6 color variants, driving at ~55 km/h.
- Spawn ahead of the player and recycle when far behind.
- **Rear-end collision**: player decelerates smoothly with overlap cap; shows flash + "COLLISION" message. Resume by pressing Up or tapping.
- **Sideways collision**: lane change blocked if target lane is occupied.

### Opponent (CPU) Cars
- **3 CPU opponents**: CPU 1 (red, 138 km/h), CPU 2 (amber, 148 km/h), CPU 3 (purple, 155 km/h).
- Spawn at the start line in lanes 0, 2, 3; player starts in lane 1.
- All cars (player + CPU) start from speed 0 after the countdown and accelerate gradually.
- CPU cars accelerate at 70% of player's acceleration rate toward their top speed.
- **Lane-avoidance AI**: each CPU car looks 200 units ahead; if its lane is blocked by traffic or another opponent, it switches to the nearest free adjacent lane. Lane changes use a 45-frame cooldown to prevent jitter.
- **Smooth lane changes**: CSS `transition: left 0.28s cubic-bezier(...)` — `left` is only updated on actual lane changes.
- **Collision with traffic**: same flash animation as player. CPU brakes hard, waits ~1.5s, then immediately tries to change lanes and resumes.
- **Finish**: CPU enters a `finishing` state at the finish line and coasts to a stop (`friction × 10`) like the player.

### Live Position Display
- `getPlayerPosition()` runs every frame during `pre` and `racing` states.
- Compares `totalDistance` (player) vs `worldY` (each opponent); any opponent further ahead = one position above.
- Opponents who have already finished the race count as ahead.
- Final position is frozen in the meta bar when the player finishes.

---

## Planned Future Features (not yet built)
- **Route selection**: city / highway / mountain, affecting terrain visuals and traffic density.
- **Difficulty levels**: 5 levels (Beginner → Master) affecting opponent speed and aggression.
- **Starting lane selection**: player picks their lane before the race begins.
- **High scores**: persist best finish times in `localStorage`.
