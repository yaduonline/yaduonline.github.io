# Linkgrid - Specification (Iteration 0)

## Overview
Linkgrid is a browser puzzle game inspired by Numberlink-style mechanics. Players connect matching color endpoints on a square grid so that all cells are occupied by non-overlapping paths.

## Scope
- Platform: browser only
- Tech: vanilla HTML/CSS/JS
- Implementation: single self-contained `index.html` with embedded CSS/JS
- Shared shell: include `/style.css` and `/inc/include.js` for site header/footer
- Mode in v1: classic only
- Packs in v1: level packs by grid size

## Core Rules
1. Each puzzle has pairs of same-color endpoints on a square grid.
2. Player draws orthogonal paths (up/down/left/right only) between matching endpoints.
3. Paths cannot overlap or cross.
4. A puzzle is solved only when:
   - every color pair is connected, and
   - every cell in the grid is occupied by exactly one path segment or endpoint.

## Launch Grid Sizes
- 5x5
- 6x6
- 7x7
- 8x8
- 9x9
- 10x10

## Board Topology (v1)
- Open grids only
- No walls
- No bridges
- No warps
- No non-square cell geometry

## Input and Controls
- Desktop:
  - keyboard navigation/actions supported
  - click and drag to draw paths
  - drag back over own active path to undo/backtrack
- Mobile:
  - touch drag to draw paths
  - drag back over own active path to undo/backtrack

## Accessibility
- Basic keyboard-only play support
- Visible focus states for interactive controls
- ARIA labels for primary controls and puzzle board region
- Sufficient contrast for path readability over pastel background

## Progression and Difficulty
- Progression model: packs grouped by board size
- Difficulty tiers: 5 tiers total
- Difficulty is based on puzzle complexity, not time pressure

## Scoring and Completion
- v1 scoring is binary: solved or not solved
- No stars, no move ranking, no timed score in v1

## Visual Direction
- Soft pastel color palette
- Clear path readability over decorative effects

## Out of Scope (v1)
- Hint system
- Timed mode / time trial
- Procedural endless generation as primary mode
- Advanced board modifiers (walls, bridges, warps, hex)
- Leaderboards or cloud sync

## Documentation
- Game folder must include a `prompt.md` describing game-specific rules and features.
