# Car Racing Game Prompt

## Overview
A top-down car racing game where the player drives one car on a four-lane highway from a start line to a finish line, navigating slower traffic cars. The game supports both keyboard and touch controls for cross-device playability. Future phases will add opponent AI cars, route selection, and difficulty levels.

---

## What Has Been Built (Current State)

### Layout & UI
- Single HTML file, pure vanilla JS/CSS/HTML, no external dependencies.
- **Meta bar** (48px, dark teal `#2e5c4e`) fixed at the top of the game view showing:
  - Speed (e.g. `87 km/h`) — fixed-width column, always single line
  - Position (e.g. `1/1`) — will update when opponents are added
  - Time — starts as `--`, ticks live at 0.1s precision during race, freezes to 0.01s at finish
  - **Race Again** button (hidden until race is finished)
- **Expand/collapse button** (bottom-right) toggles fullscreen by hiding the site header/footer.
- All meta bar text uses the system default font.

### Road & Terrain
- Four-lane road rendered with CSS, scrolling lane markers.
- Scrolling terrain on both sides (grass, trees, rocks).

### Player Car
- Top-down teal car with mirrors, headlights, tail lights, spoiler.
- Spawns at the **start line** on page load.

### Race
- **Start line**: white line where the car spawns.
- **Finish line**: checkered line 25,000 scroll-units ahead.
- **Race states**: `pre → racing → finishing → finished`
  - `racing` begins the moment the car crosses the start line.
  - `finishing` triggers at the finish line: timer freezes, car coasts to a stop using high friction (`friction × 10`).
  - `finished`: Race Again button appears.
- Race can be restarted via the Race Again button; timer resets to `--`.

### Controls
- **Keyboard**: Up/Down arrows accelerate/decelerate; Left/Right arrows change lanes.
- **Touch**: Tap/hold to accelerate; swipe left/right to change lanes; swipe down to decelerate.
- Touch events use `passive: false` + `preventDefault()` to prevent page scroll.
- `user-select: none` and `-webkit-tap-highlight-color: transparent` on the game canvas.

### Physics
- `maxSpeed = 160`, `acceleration = 0.6`, `friction = 0.4`
- Speed interpolates toward `targetSpeed` each frame with friction-based braking.

### Traffic Cars
- 8 background traffic cars (`TRAFFIC_COUNT = 8`) in 6 color variants.
- Drive in the same direction as the player at `TRAFFIC_BASE_SPEED = 55`, slower than max player speed.
- Spawn ahead of the player and recycle when far behind.
- **Rear-end collision**: player car stops smoothly; overlap is capped so the player can't pass through. Resume by pressing Up or tapping.
- **Sideways collision**: prevented — lane change is blocked if the target lane is occupied.
- Collision flash effect and "COLLISION" message shown on impact.

---

## Next Step: Opponent Cars

Add **3 computer-controlled opponent cars** that race from start to finish alongside the player.

### Behaviour
- Opponents start at the start line alongside the player.
- Each opponent drives at a speed slightly varied around a base opponent speed (e.g. ±10–20% of player max speed), making them competitive.
- Opponents change lanes autonomously to overtake traffic cars (simple AI: if a traffic car is close ahead, change to an adjacent free lane).
- Opponents do not collide with each other or stop — they simply slow behind traffic if stuck.
- Opponents finish the race when they cross the finish line; their finish time is recorded.

### Position Display
- The **Position** value in the meta bar updates live (e.g. `2/4`, `1/4`) based on how far each car has travelled relative to the finish line.
- At race end, show the player's final finishing position.

### Visual Distinction
- Opponent cars look identical to the player car in shape but use different colors (not teal).
- A small label or indicator above each opponent car shows their number (e.g. "CPU 1").

---

## Planned Future Features (not yet built)
- **Route selection**: city / highway / mountain, affecting terrain visuals and traffic density.
- **Difficulty levels**: 5 levels (Beginner → Master) affecting opponent speed and aggression.
- **Starting lane selection**: player picks their lane before the race begins.
- **High scores**: persist best finish times in `localStorage`.
