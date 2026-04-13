# Linkgrid - Iterative Task Plan

## Workflow
- Implement in strict order for each iteration.
- Keep production in `index.html`.
- Keep tests in `test.html`.
- Mark task done only when implementation and tests pass.

---

## Iteration 1 - Playable Classic v1

### A. Scaffold and Layout
- [ ] Create `games/linkgrid/index.html` with board area and top controls.
- [ ] Include shared shell (`/style.css`, `#site-header`, `#site-footer`, `/inc/include.js`).
- [ ] Add soft pastel theme tokens.
- [ ] Create basic views: pack select, level select, puzzle.
- [ ] Add responsive layout for desktop and mobile.
- [ ] Create `games/linkgrid/prompt.md` with game-specific rules and features.

Tests (A)
- [ ] App loads without JS errors.
- [ ] Puzzle board area is visible and non-zero sized.
- [ ] Layout remains usable on narrow mobile viewport.
- [ ] Header and footer inject correctly via include script.

### B. Data and State
- [ ] Define config for sizes 5x5 to 10x10.
- [ ] Add puzzle pack schema and seed initial levels for each size.
- [ ] Implement state containers for screen, selected pack/level, puzzle state, progress.
- [ ] Add localStorage load/save for solved levels.

Tests (B)
- [ ] Puzzle schema validation rejects malformed endpoint pairs.
- [ ] State initializes with valid defaults.
- [ ] Solved progress persists across reload.

### C. Input Engine
- [ ] Implement pointer down/move/up handling for mouse + touch.
- [ ] Implement keyboard cursor + path actions (arrow/space/enter/escape).
- [ ] Start edit from endpoint or own segment.
- [ ] Enforce orthogonal adjacency.
- [ ] Implement drag-back undo behavior.

Tests (C)
- [ ] Diagonal drag does not create segments.
- [ ] Non-adjacent jump does not create segments.
- [ ] Dragging backward trims active path.
- [ ] Keyboard-only path edit works for a simple 5x5 puzzle.

### D. Path Rules
- [ ] Block overlap with other colors.
- [ ] Replace old path of active color when starting new trace.
- [ ] Lock completed endpoint-to-endpoint path state.
- [ ] Keep endpoint ownership valid at all times.

Tests (D)
- [ ] Path cannot enter cell owned by another color.
- [ ] Re-drawing same color replaces previous route.
- [ ] Endpoints remain connected to their own color only.

### E. Solve Validation
- [ ] Implement full validation: all pairs connected + board fully occupied.
- [ ] Trigger solved state and mark level complete.
- [ ] Unlock next level in same pack.

Tests (E)
- [ ] Complete board and valid pairing marks solved.
- [ ] Full board with one unconnected pair does not solve.
- [ ] Connected pairs with unfilled cells does not solve.

### F. UI Polish and Flow
- [ ] Level tiles show solved/not solved.
- [ ] Add restart puzzle action.
- [ ] Add back navigation between views.
- [ ] Add solved banner/overlay.
- [ ] Add ARIA labels and visible focus states for controls/board.

Tests (F)
- [ ] Restart clears all non-endpoint path cells.
- [ ] Solved marker appears in level select after completion.
- [ ] Navigation does not lose persisted solved progress.
- [ ] Tab order reaches all interactive controls.

---

## Iteration 2 - Content and Quality
- [ ] Expand puzzle counts per pack and tier.
- [ ] Improve rendering aesthetics (path joins, endpoint glow, transitions).
- [ ] Add keyboard accessibility for navigation and actions.
- [ ] Add regression tests for puzzle edge cases.
