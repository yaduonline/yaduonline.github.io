# Games Folder Prompt

## Overview
This `games/` folder contains simple, self-contained HTML games that can be played directly in any modern web browser. Each game is implemented as a single HTML file with embedded CSS and JavaScript, requiring no external dependencies, frameworks, or backend services.

## Common Rules for All Games
- **Self-Contained**: No build step and no external dependencies. Small games are a single `.html` file. Larger ones (Linkgrid, Tetris, Car Racing) split into `index.html` plus plain `.js` files loaded with `<script>` tags — rules in an `engine.js` with no DOM access, presentation in a `game.js`, and a test suite that runs both in Node and in the browser against the same engine the game runs. Either shape is fine; the rule is that you can copy the folder and open it.
- **One Theme, Chosen Site-Wide**: The visitor picks light, dark, or follow-the-browser from the control in the site header, and *every* page and game obeys it. A game must never carry its own theme switch or flip the page on its own; moving from `/games/` into a game should not feel like changing sites.

  How it works, and what a new game has to do:

  - `/style.css` defines the site tokens in three states: bare `:root` is light, `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) }` covers a dark browser, and `:root[data-theme="dark"]` lets an explicit choice beat a light browser. Follow that exact shape — a colour defined *only* inside the media query never applies in the un-stamped "system" state, which is how you end up with one theme's text on the other theme's background.
  - Each page carries a two-line inline script in `<head>` that stamps the saved choice before first paint. Without it, a dark-theme visitor gets a flash of white.
  - `/inc/include.js` owns the control and the `theme` key in `localStorage`. "System" stores nothing.
  - **Canvas is not covered by CSS.** A game that paints its board on a canvas must read its colours from CSS custom properties (see `readTheme()`/`themeToken()` in Tetris, Linkgrid and Loopfront) and re-read them when the theme changes — watch `data-theme` on `<html>` with a `MutationObserver` *and* listen for `change` on `matchMedia('(prefers-color-scheme: dark)')`, because "system" changes neither attribute nor storage.
  - Tetris and Car Racing share one palette (`--bg: #f4f5f7`, `--panel: #fff`, `--ink: #1f242b`, `--muted: #6b7480`, `--edge: #d8dce2`, `--accent: #3f5b56`, and the dark values in those files); Linkgrid keeps a warmer cream on the light side. Reuse one rather than inventing a third.
  - Colours that *are* the game — 2048's tiles, Linkgrid's path hues, Loopfront's four territories, Tetris's pieces — stay fixed in both themes. They are how you tell one thing from another, and they read on either ground.
- **Soothing Colors**: Avoid bright-primary and neon. Desaturated, warm-neutral tones to minimise eye strain; muted blue-green or sage for active elements; avoid saturated reds, limes and pure yellows. In the dark theme, use a warm dark rather than pure black. Content that is genuinely dark regardless of theme — Car Racing's tarmac, for instance — stays dark in both.
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
- **Loopfront**: Territory-capture game on a large scrolling map against three CPU players.
- **Snake**: Wrap-around snake with multiple food types, speed progression and Web Audio effects.
- **Tetris**: Standard rules — SRS kicks, lock delay, 7-bag, ghost and next preview — laid out to give a phone screen to the playfield.

## Future Games
New games should follow these guidelines to maintain consistency and simplicity across the collection.