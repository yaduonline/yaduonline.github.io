# Car Racing Game Prompt

## Overview
Create a simple car-racing game where the player controls one car in a four-lane highway, competing against three computer-controlled opponents. The game features random traffic obstacles, multiple routes, difficulty levels, and supports both keyboard and touch controls for cross-device playability.

## Game Features
- **Lanes**: Four parallel lanes on the highway.
- **Players**: One user-controlled car and three computer-controlled cars.
- **Traffic**: Non-playing cars appear randomly on each lane as obstacles.
- **Collision**: If the user's car collides with any other car (opponent or traffic), the user's car stops, however game continues. User has to press upward keyboard button or touch screen again to start the car again.
- **Lane Changing**: User can change lanes to avoid collisions.
- **Acceleration/Deceleration**: 
  - Up arrow or simple touch on the screen or upward swipe: Accelerate the car. Constant press against the screen means car keeps accelerating until the press is over.
  - Down arrow or downward swipe: Decelerate the car.
- **Routes**: Multiple predefined routes (e.g., city, highway, mountain). User selects a route before starting.
- **Difficulty Levels**: Five named levels from beginner to expert, affecting opponent AI behavior (e.g., speed, lane-changing frequency).
- **Starting Lane**: User selects their starting lane at the beginning.
- **Game End**: Game continues until collision; no win condition beyond survival.

## Controls
- **Keyboard**:
  - Left/Right arrows: Change lanes.
  - Up arrow: Accelerate (hold to keep accelerating).
  - Down arrow: Decelerate.
- **Touch/Mobile**:
  - Swipe left/right: Change lanes.
  - Touch (tap or swipe up): Accelerate (hold to keep accelerating).
  - Swipe down: Decelerate.
- Ensure touch controls prevent page scrolling and are responsive on mobile devices.

## User Interface
- **Simple Design**: Clean, minimalistic interface.
- **Cars**: All cars look identical except for color. User's car has a distinctive symbol (e.g., a star or unique shape) to differentiate it.
- **Display**: Show current speed, selected route, difficulty level, and lane position.
- **Responsive**: Adapts to different screen sizes, with touch-friendly controls on mobile.

## Difficulty Levels
1. **Beginner**: Slow opponents, fewer traffic cars, easy lane changes.
2. **Intermediate**: Moderate opponent speed and traffic.
3. **Advanced**: Faster opponents, more frequent traffic.
4. **Expert**: High-speed opponents with aggressive lane changes, dense traffic.
5. **Master**: Maximum difficulty with unpredictable AI and constant obstacles.

## Implementation Guidelines
- **Self-Contained**: Single HTML file with embedded CSS and JavaScript.
- **No External Dependencies**: Pure vanilla JS, HTML, CSS.
- **Responsive and Mobile-Friendly**: Works on desktop and mobile, with proper touch handling.
- **Cross-Device Controls**: Support keyboard and touch seamlessly.
- **Performance**: Smooth animations, no lag on mobile devices.
- **Persistence**: Use localStorage for high scores or settings if added later.
- **Testing**: Ensure compatibility across browsers and devices.
- **Code Quality**: Readable, commented code for maintainability.

## Development Phases
1. **Design**: Sketch UI layout, define game loop, AI logic for opponents.
2. **Prototype**: Basic movement, collision detection, controls.
3. **Polish**: Add routes, difficulty levels, animations, responsive design.
4. **Testing**: Cross-device testing, bug fixes.

This prompt will be reviewed before proceeding to design and implementation.