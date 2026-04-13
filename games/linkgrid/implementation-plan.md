# Linkgrid - Implementation Plan (Execution Order)

## Phase 1: Foundation
1. Create `index.html` and `test.html`.
2. Build theme tokens and responsive shell.
3. Implement view router (pack, level, puzzle).

Exit criteria:
- App boots, views switch, no puzzle logic yet.

## Phase 2: Puzzle Core
1. Add puzzle schema and starter packs (5x5 to 10x10).
2. Implement puzzle state initialization from selected level.
3. Implement path editing engine with adjacency rules.
4. Implement overlap blocking and same-color redraw behavior.

Exit criteria:
- Player can draw and edit paths correctly.

## Phase 3: Validation and Progress
1. Implement solver checks (all pairs connected + all cells filled).
2. Trigger solved state and persistence update.
3. Wire solved badges on level select.

Exit criteria:
- Completing a puzzle marks progress and persists it.

## Phase 4: UX and Stability
1. Add restart and back controls.
2. Improve visuals for endpoints and path joins.
3. Add test coverage for core rules and regressions.

Exit criteria:
- v1 playable quality achieved with passing tests.

## Immediate Next Coding Step
- Start Phase 1 and scaffold `games/linkgrid/index.html` + `games/linkgrid/test.html`.
