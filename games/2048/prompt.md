# 2048 Game Prompt

## Overview
Create a fully playable 2048 sliding tile puzzle game as a single HTML file (`index.html`) in the `games/2048/` directory. The game should be responsive, work on desktop and mobile, and integrate with the site's shared header/footer via JS includes.

## Game Rules
- 4x4 grid of tiles.
- Start with two random tiles (2 or 4).
- Slide tiles in four directions (up, down, left, right) using keyboard arrows or touch swipe.
- Merge identical tiles by sliding into each other (e.g., 2+2=4).
- Each merge adds the sum to the score.
- New tile (2 or 4) appears after each move.
- Win when 2048 is reached, but game continues (no end).
- Game over when no legal moves remain.
- Score and best score persist in localStorage.

## Features
- **Controls**: Keyboard (arrow keys) + touch swipe (mobile).
- **Buttons**: New Game.
- **UI Elements**: Score display, Best score display, banner for messages.
- **Test Mode**: "Large Numbers Test" button visible only with `?test=true` URL parameter. Populates board with high values (2 to 65536) for testing.
- **Animations**: Smooth flowing tile movements on swipe using CSS transitions (grid-row/column).

## Visual Design
- **Colors**: Classic beige theme.
  - Grid background: #cdc1b4
  - Empty tiles: #eee4da
  - Tile heatmap: progressively darker backgrounds as values increase (e.g., 2: light, 2048: dark).
- **Typography**: Uniform font size (3.5rem desktop, 2rem mobile) for all tiles, wrap multi-line for large numbers (e.g., 4-digit values).
- **Layout**: Responsive grid, centered main content, minimal margins.
- **Mobile**: Prevent page scroll during swipes (with cancelable check), responsive nav (wrap links to avoid horizontal overflow).

## Technical Requirements
- **File Structure**: Single HTML file with inline `<style>` and `<script>`.
- **JS Includes**: Load shared header/footer from `/inc/header.html` and `/inc/footer.html` via fetch.
- **Touch Handling**: Use `touchstart`, `touchmove`, `touchend` with `preventDefault` (only if cancelable) for swipes.
- **CSS**: Grid layout for tiles with transitions, flex for controls, media queries for mobile.
- **No External Dependencies**: Pure vanilla JS/CSS.

## Development Notes
- Font size adjusted to 3.5rem desktop, 2rem mobile for better visibility.
- Added flowing swipe animation with CSS transitions on grid-row and grid-column.
- Merge animation attempted but removed due to scaling issues on empty tiles.
- Fixed touchmove preventDefault error by checking e.cancelable.
- Ensured large numbers wrap without shrinking font.
- Responsive design with media queries.

## Testing
- Desktop: Arrow keys, button clicks.
- Mobile: Swipe gestures, no page scroll or console errors.
- Test mode: Access via `?test=true` to verify large number display and animations.