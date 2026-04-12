# Loopfront - Specification (Iteration 0)

## Overview
Loopfront is a multiplayer territorial strategy game played on a large square world map. The user controls one moving dot and competes against 3 CPU players. Every player leaves a vulnerable tail while outside owned territory and can claim new territory by completing loops.

This document defines product requirements and rules for the first playable baseline.

## Scope
- Platform: Browser-only, single self-contained HTML game implementation in `index.html`
- Tech: Vanilla HTML/CSS/JS, no external dependencies
- Players at launch: 1 user + 3 CPU players (fixed for initial release)
- Input: Keyboard and touch gestures
- Rendering: High-resolution grid simulation with smooth visual drawing

## Core Gameplay

### World
- The world is a large square map represented by a high-resolution logical grid.
- Cell size is intentionally much smaller than player dot diameter and tail thickness to avoid blocky square-only gameplay.
- The visible game view is a viewport into the larger world.
- A minimap overlay is always visible in one corner and shows the full world state.

### Players
- Total players at launch: 4 (user + 3 CPU).
- Each player has:
  - Unique base color
  - Arrow-shaped avatar that visually points in the player's current movement direction
  - Arrow body is thick (multiple pixels wide) so it is easily visible at game scale
  - Constant movement speed shared by all players
  - Direction represented by a 16-direction heading model
  - Owned territory region
  - Optional active tail path while outside own territory
- User arrow has a fixed high-contrast outline/accent ring to remain distinguishable even inside user-owned territory.

### Spawn and Start
- Game starts with a large square map and 4 players in the 4 corners.
- Each player starts with a small owned safe region at their corner.
- Initial headings move players inward toward the center.
- Movement is continuous from game start; no stationary phase.

### Movement and Direction
- Players move continuously at equal speed.
- Direction model supports 16 headings, not just 4 cardinal directions.
- Desktop input: arrow keys steer direction.
- Mobile input: swipe gestures; heading change is derived from swipe angle/slope.

### Tail and Territory Rules
- While inside own territory, player has no active tail.
- As soon as player exits own territory, tail starts.
- Player can claim territory by returning and closing a valid loop against own territory boundary.
- When a loop closes:
  - Enclosed area + loop path become owned by that player.
  - Region fill color updates to the player color (semi-transparent).
  - Player re-enters safe state (no active tail) once back inside owned territory.
- Territorial expansion can create non-axis-aligned boundaries due to 16-direction motion.

### Elimination Rules
- If any opponent crosses the user active tail, the user is eliminated.
- User self-tail collision is disabled by default in initial release.
- Self-tail collision must remain configurable via a game rule flag.
- CPU elimination uses the same logic as the user:
  - A CPU is eliminated when another player crosses that CPU's active tail.

### Match End Conditions
- Match ends immediately if user is eliminated.
- Match also ends when all CPU players are eliminated.

### Winner Determination
- At match end, winner is determined by largest owned territory area.
- If user has the largest territory, user wins; otherwise user loses.

## Camera and Viewport Requirements
- Camera keeps user in focus but not hard-locked to center.
- Soft follow behavior:
  - If user remains in inner safe viewport zone, camera does not move.
  - If user approaches edge in movement direction, camera pans to keep user visible with look-ahead.
- Goal: preserve clear perception of user movement while preventing abrupt constant re-centering.

## UI and Visualization Requirements
- Main viewport showing local world area.
- Always-visible minimap in corner displaying:
  - Full map ownership colors
  - All active player positions
  - Current viewport rectangle
- Territory rendering uses semi-transparent fills per player.
- Tail rendering should be visually clear and thicker than 1px.
- Player shape is an arrow pointing in current heading direction; arrow rotates smoothly as direction changes.
- User arrow always has a fixed high-contrast accent ring/outline.

## CPU Behavior (Initial Baseline)
- 3 CPU players with simple deterministic behavior.
- CPUs move continuously with same speed as user.
- CPUs perform basic territory expansion attempts (leave area, close loop).
- CPU steering can be simple rule-based in MVP; sophistication deferred.

## Configuration Requirements
Initial implementation must expose constants/config for:
- Number of CPU players (default 3; dynamic scaling deferred)
- `allowSelfTailDeath` (default false)
- Map size and logical cell size
- Player speed
- Camera dead-zone and look-ahead tuning
- Minimap size/position

## Non-Functional Requirements
- Responsive for desktop and mobile
- No external dependencies
- Performance should support smooth gameplay on modern browsers
- Code should be modular enough to iterate by tasks

## Out of Scope for Initial Build
- Online multiplayer
- Network sync
- Matchmaking
- Power-ups and advanced AI personalities
- Dynamic CPU count during active match
