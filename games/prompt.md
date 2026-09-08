# Games Folder Prompt

## Overview
This `games/` folder contains simple, self-contained HTML games that can be played directly in any modern web browser. Each game is implemented as a single HTML file with embedded CSS and JavaScript, requiring no external dependencies, frameworks, or backend services.

## Common Rules for All Games
- **Self-Contained**: No build step and no external dependencies. Small games are a single `.html` file. Larger ones (Linkgrid, Tetris, Car Racing) split into `index.html` plus plain `.js` files loaded with `<script>` tags — rules in an `engine.js` with no DOM access, presentation in a `game.js`, and a test suite that runs both in Node and in the browser against the same engine the game runs. Either shape is fine; the rule is that you can copy the folder and open it.
- **Consistent, Light Color Scheme**: The site is light (`/style.css`: white page, `#333` text), and games follow it. A game's chrome — menus, HUD, buttons, dialogs — must not flip the page to a dark theme; moving from `/games/` into a game should not feel like changing sites. Tetris and Car Racing share one palette (`--bg: #f4f5f7`, `--panel: #fff`, `--ink: #1f242b`, `--muted: #6b7480`, `--edge: #d8dce2`, `--accent: #3f5b56`); Linkgrid uses a warmer cream of the same character. Reuse one of those rather than inventing a third.
- **Soothing Colors**: Avoid bright-primary and neon. Desaturated, warm-neutral tones to minimise eye strain; muted blue-green or sage for active elements; avoid saturated reds, limes and pure yellows. Dark surfaces are for game *content* that is genuinely dark — a road, a night sky — not for the page around it, and never pure black.
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
- **2048**: Sliding tile puzzle with smooth animations and touch controls.
- **Car Racing**: Top-down four-lane race against three CPU opponents and traffic, over five tracks. One is dead straight with arcade lane changes; the rest bend, and you steer them.
- **Linkgrid**: Numberlink-style path puzzles, 100 per board size across five difficulty levels, with hints.
- **Loopfront**: (dark-themed — the one game not on the light palette above.)
- **Snake**: Wrap-around snake with multiple food types, speed progression and Web Audio effects.
- **Tetris**: Standard rules — SRS kicks, lock delay, 7-bag, ghost and next preview — laid out to give a phone screen to the playfield.

## Future Games
New games should follow these guidelines to maintain consistency and simplicity across the collection.