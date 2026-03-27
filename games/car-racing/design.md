# Car Racing Game Design

## UI Layout Sketch
```
+-----------------------------+
| Game Title: Car Racing      |
+-----------------------------+
| Route: [Selected Route]     |
| Difficulty: [Level]         |
| Speed: [Current Speed]      |
| Lane: [Current Lane]        |
+-----------------------------+
|                             |
|   Lane 1 | Lane 2 | Lane 3 | Lane 4
|   [Car]  |        |        |
|          | [Opp1] |        |
|          |        | [Traffic]
|          |        |        |
|   [Opp2] |        |        |
|          |        | [Opp3] |
|                             |
+-----------------------------+
| Controls: Use arrows or touch |
+-----------------------------+
```

- **Top Bar**: Displays selected route, difficulty level, current speed, and current lane.
- **Game Area**: Vertical highway with 4 lanes. Cars move upwards (perspective: highway scrolls down).
- **Cars**: Simple rectangles or CSS shapes. User's car has a star symbol. Colors: User (blue with star), Opponents (red, green, yellow), Traffic (gray).
- **Responsive**: On mobile, lanes stack or adjust width; touch zones for controls.

## Game Loop
- **Update Function**: Called via `requestAnimationFrame`.
  - Update car positions based on speed.
  - Scroll highway background.
  - Check collisions.
  - Handle AI for opponents.
  - Spawn traffic randomly.
- **Render**: Update DOM positions or canvas.

## AI Logic for Opponents
- **Basic Behavior**:
  - Accelerate periodically to maintain speed.
  - Change lanes randomly or to avoid traffic.
  - Difficulty affects: Speed multiplier, lane change frequency, reaction time.
- **Difficulty Scaling**:
  - Beginner: Slow base speed, rare lane changes.
  - Intermediate: Moderate speed, occasional changes.
  - Advanced: Faster, more changes.
  - Expert: High speed, aggressive changes.
  - Master: Max speed, unpredictable changes (random factors).

## Data Structures
- **Car Object**: { id, lane, yPos, speed, color, isUser, stopped }
- **Game State**: { route, difficulty, userCar, opponents[], traffic[], speed, lane }
- **Routes**: Array of route objects with background images or colors, traffic density.

## Controls Handling
- **Keyboard**: Event listeners for arrow keys.
- **Touch**: Touchstart/touchend for swipes and taps, prevent default to avoid scrolling.
- **Acceleration**: On up/touch, increase speed while held; on release, stop accelerating.

## Collision Detection
- Check if user car's position overlaps with any other car's position in the same lane.
- On collision: Set userCar.stopped = true; display restart prompt.

## Routes and Difficulty Selection
- Pre-game menu: Select route (dropdown), difficulty (buttons), starting lane (buttons).
- Store selections in game state.

This design provides a foundation for the prototype phase.