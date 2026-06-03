# Games Folder Prompt

## Overview
This `games/` folder contains simple, self-contained HTML games that can be played directly in any modern web browser. Each game is implemented as a single HTML file with embedded CSS and JavaScript, requiring no external dependencies, frameworks, or backend services.

## Common Rules for All Games
- **Self-Contained**: Each game is a single `.html` file containing all HTML, CSS, and JavaScript code.
- **Soothing Color Palette**: Avoid bright-primary and neon colors. Use desaturated, warm-neutral tones to minimize eye strain. Prefer muted blue-green or sage tones for active game elements, warm dark backgrounds (not pure black), warm off-white for text, and avoid saturated reds, limes, or pure yellows. Research on color perception shows desaturated blue-green hues are rated most calming and warm-neutral dark backgrounds reduce blue-light fatigue compared to high-contrast pure-black or cold-indigo backgrounds.
- **No External Dependencies**: No frameworks (e.g., React, Vue), libraries (e.g., jQuery), or CDN resources. Pure vanilla JavaScript, HTML, and CSS only.
- **Browser-Only**: Games run entirely in the browser with no server-side components, databases, or API calls.
- **No Authentication**: No login, user accounts, or session management.
- **No Advertisements**: Clean, ad-free gaming experience.
- **Offline Playable**: Copy the `games/` folder to any computer and open game files directly in a browser to play.
- **Responsive and Mobile-Friendly**: Games should work seamlessly on desktop and mobile devices, adapting layout and controls appropriately.
- **Controls**: Support keyboard (arrow keys, space, etc.), mouse clicks, and touch gestures for full cross-device playability.
- **Accessibility**: Basic keyboard and screen reader support where feasible.
- **Performance**: Lightweight code with minimal resource usage.
- **Scoring/Persistence**: Use localStorage for high scores or game state if needed.
- **Open Source**: Code is readable and modifiable.

## Game Development Guidelines
- **File Structure**: `games/{game-name}/index.html` (single file per game).
- **Shared Resources**: Use `/style.css` and `/inc/` includes for common site elements (header/footer) if applicable.
- **Testing**: Ensure games work in latest Chrome, Firefox, Safari, and Edge.
- **Documentation**: Each game folder should have a `prompt.md` with game-specific rules and features.
- **Updates**: Maintain backward compatibility; avoid breaking changes to existing games.

## Current Games
- **2048**: Sliding tile puzzle game with smooth animations and touch controls.
- **Car Racing**: Top-down 4-lane race against 3 CPU opponents with traffic, countdown, and live position ranking.
- **Snake**: Classic wrap-around snake with multiple food types, speed progression, and Web Audio sound effects (in development).
- **Tetris**: Classic tile-matching puzzle game with custom polyominoes, ghost piece, and "Dusk Slate" styling.

## Future Games
New games should follow these guidelines to maintain consistency and simplicity across the collection.