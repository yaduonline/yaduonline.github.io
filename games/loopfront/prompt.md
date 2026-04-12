# Loopfront Prompt

## Overview
Loopfront is a multiplayer territorial strategy game where players move continuously, leave vulnerable tails outside owned territory, and capture new regions by closing loops. The game starts with 1 user and 3 CPU players on a large square world map.

## Source of Truth
Development for Loopfront should follow these documents in this folder:
- `specification.md` - product requirements and rules
- `design.md` - architecture and gameplay systems design
- `tasks.md` - iterative implementation checklist

## Initial Constraints
- Single-file browser game implementation in `index.html`
- Vanilla HTML/CSS/JS only, no external dependencies
- High-resolution grid simulation + smooth rendering
- 16-direction movement model
- User-focused camera with dead-zone + look-ahead
- Always-visible minimap overlay

## Match Rules (Initial)
- End match when user is eliminated OR all CPU players are eliminated.
- Tail-cut elimination logic applies to all players.
- User self-tail death disabled by default but configurable.
- Winner determined by largest territory when match ends.

## Development Process
1. Implement tasks from `tasks.md` in order.
2. Keep each change scoped and testable.
3. Validate desktop and mobile controls after each major milestone.
4. Update docs when rules/design change.
