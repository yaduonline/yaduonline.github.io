# Unjam — Decisions

Choices made while building the game that were not obvious from the brief, and
why. Newest at the bottom.

### 1. Name: "Unjam", not "Unblock Me"

*Unblock Me* is a commercial product name. The site's games use their own
names (Linkgrid rather than Flow Free), so this one does too. "Unjam" says what
you do, is one word, and fits the site's folder naming (`/games/unjam/`).

### 2. The tray is DOM, not canvas

The other puzzle game (Linkgrid) and Tetris paint on a canvas. Here the blocks
are few (at most 16), rectangular, and each is something the player grabs, so
they are `<button>`s. That buys keyboard focus, accessible labels and theme
following for free, and the wood look is CSS. The cost — a handful of elements
repositioned per move — is nothing.

### 3. Consecutive slides of the same block are one move

A move is a slide of one block any distance (as in the original games and in
the solver). Without merging, sliding a block two cells in two nudges, or with
two arrow presses, would cost two moves, which punishes keyboard players and
anyone who drags in steps. With merging, the player's count is directly
comparable to the computed minimum.

### 4. Solved = the red block reaches the wall

In the original the red block is dragged out through the opening. Here reaching
the wall solves it and the block then slides out on its own. Once it is at the
wall nothing can block it, so asking the player to drag it further adds nothing
but a fiddly gesture near the screen edge.

### 5. Muted brick red, plus a marking

The brief asks for a red block; the site asks for no saturated reds. The block
is a muted brick (`#a4493d` family) and also carries an arrow pointing to the
exit, so it is not told apart by colour alone.

### 6. Hints are unlimited, computed live

Linkgrid caps hints at five because its hint reveals a whole route. Here a hint
is one move, and it is computed from where the player *is*, not replayed from a
stored solution, so it is useful after any amount of wandering. Capping it
would only force a restart. The number used is shown on the finish panel, and
a hinted solve can still be perfect — the count is the player's, the hint is
advice.

### 7. Puzzles are generated from clusters, keeping the hardest position

See DESIGN.md → Generator. Random arrangements are almost always short to
solve; keeping the farthest position in each arrangement's reachable set is the
approach behind the published hardest-puzzle database, and it is what makes an
Expert band reachable at all.

### 8. Keyboard: arrows along a block slide it, arrows across it pick another

The first draft had a pick mode and a slide mode toggled with Space. A block
only moves on one axis, so the other axis is free: using it to move between
blocks means there is no mode to remember or announce, and the whole tray is
reachable from the arrow keys.

### 9. Screens live in the URL hash

With the site nav hidden, a phone's back gesture was the only "up" a player
would reach for — and without history entries it would leave the game
altogether. `#pack/n` gives back/forward, reload and bookmarks the obvious
meaning at the cost of one `hashchange` handler.

### 10. Generator biased to dense boards; the planned bands held

Pure random arrangements (6–14 blocks) yielded about two Expert puzzles a
minute. Measuring yield by density (DESIGN.md → Generator) showed dense boards
are both faster and far richer in long puzzles, so the generator now places
12–15 blocks most of the time. All four packs filled at the planned bands
(3–9, 10–16, 17–24, 25+) in about seven minutes; no band had to move.

### 11. "Par" in the bar

"Best possible" pushed the puzzle title into an ellipsis on a 375px phone.
"Par" is short, familiar from golf and other puzzle games, carries a tooltip,
and the finish panel spells it out ("It can be done in 20").

### 12. The browser tests run on their own server

`playwright.config.js` reuses whatever already listens on port 8000. On this
machine that was another project's server, so every page was a 404 and the
tests failed for reasons that had nothing to do with the game — and on a
different day could as easily have passed against the wrong site.
`playwright.games.config.js` starts its own server and never reuses one, so a
clash fails loudly. (It first used 8002 — which turned out to be where a
server gets started by hand to try a game on a phone. It is now 8765,
overridable with `GAMES_TEST_PORT`.) The root config ignores `unjam.spec.js`
so it is not run twice against the wrong server. The existing Tetris specs
were left as they are; they target element ids the current Tetris no longer
has, which is a separate fix.

### 13. Puzzles are stored canonically

`serialize` letters blocks in reading order, and the tests require every
shipped board to equal its own re-encoding. Two puzzles that differ only in
lettering would otherwise dodge the duplicate check.

### 14. A solve moves on by itself

Asked for after play-testing: a solved tray is mostly the absence of the red
block, so there is nothing to admire, and a "Next puzzle" button was a tap
spent on nothing. The finish panel's buttons are gone; a banner shows the
result for about two seconds with a filling strip, then the tray crossfades
to the next puzzle.

- **No history entry per puzzle** (`replaceState`). Otherwise back after ten
  solves would step through ten puzzles before reaching the list.
- **"Play again" went with the buttons.** Replaying is one tap from the list,
  where solved puzzles are marked, and keeping a button would mean either a
  pause long enough to reach it or a race against the timer.
- **Cancelled by leaving or restarting**, and re-checked when the timer fires,
  so the game never moves on after the player has chosen somewhere else.

### 15. Back acts on the first tap, by the Linkgrid fix

Reported: Back beside the title needed two taps on a phone. It could not be
reproduced here — no double tap in desktop or emulated browsers, nothing
overlapping the button, and the iOS simulator could not be used (disk full at
the time). So this is the fix with a track record, not a confirmed diagnosis:
Linkgrid's finish-panel buttons had the same symptom, were likewise shown at
the instant a tap ended, and were fixed by accepting a touch's `pointerup` as
a press as well as `click`, deduplicated. Back is shown or re-laid-out exactly
that way — by the tap that opens a pack or a puzzle. Deduplication matters
more here than there: a doubled Back would go up two levels.

Also raised to a 44px touch target; it was 37px, at the very top edge of the
screen, where a slightly high tap lands on nothing.
