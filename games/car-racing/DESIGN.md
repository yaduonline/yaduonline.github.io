# Car Racing — Design

## Files

| File | Role |
| --- | --- |
| `index.html` | Markup, styles, script tags. No game logic. |
| `engine.js` | Pure simulation. No DOM. Global `RacingEngine`, or `require`. |
| `tracks.js` | Track data. Global `RacingTracks`. |
| `vehicles.js` | Canvas artwork and the vehicle registry. Global `RacingVehicles`. |
| `game.js` | UI: layout, rendering, input, traffic spawning, persistence. |
| `test/suite.js` | Test suite shared by Node and the browser. |
| `test/run.js` | Node runner. |
| `test.html` | Browser runner. |
| `preview.html` | Dev harness: every vehicle drawn large, for working on the art. |

The split exists so the simulation is testable without a DOM, and so the artwork
can be iterated on without running a race.

## Coordinates

Everything in the engine is in **road space**: `y` is distance along the road and
`x` is offset across it, with 0 at the centre line. Bends do not exist in road
space at all — a car in lane 1 has the same `x` whether the road is straight or
turning. That is what lets collision detection stay a plain axis-aligned box
test no matter how the track curves.

The bend is a rendering and physics *effect* layered on top:

- `game.js` draws the road by shifting each sampled row sideways by
  `track.offsetAt(worldY) - track.offsetAt(player.y)`, so the road appears to
  curve away ahead of the player.
- `engine.js` applies a lateral push proportional to `curve × speed²`, so taking
  a corner fast costs you position on the road.

## Track model

A track is a list of `{ length, curve }` sections. `curve` is lateral drift per
unit of forward travel. `createTrack` integrates the centre line once into two
`Float64Array` lookup tables sampled every 20 units, so `offsetAt` and `curveAt`
are an array read plus a lerp rather than a walk over the sections — they are
called for every drawn row of road, every frame.

Each section's curve is eased with `curve × sin(πt)` across the section, so a
bend starts and ends at zero curvature. Without that, the road kinks at every
section boundary.

## Steering, and the two control schemes

The road bends; the car does not follow it on its own. That is the game on four
of the five tracks, and it needs one piece of geometry.

A car has a `heading`: the angle of its travel measured against the map's
forward axis, so a car pointing straight down the screen has heading 0 whatever
the road under it is doing. In road space the centre line itself slides sideways
as you travel, at `curve` units across per unit along, so the car's drift
relative to the road is the difference between where it is pointing and where
the road is going:

```
y       += speed · cos(heading) · dt
lateral += speed · (sin(heading) − curve · cos(heading)) · dt
```

Setting that second line to zero gives the whole feel of the game:

> **holding a line through a bend means holding a heading of `atan(curve)`.**

The sharpest corner shipped is 0.45, so about 24°. `MAX_HEADING` is 0.6 rad
(34°), which leaves room to over-steer past the sharpest corner without letting
anyone spin the car. The first line is not decoration either: point the car
across the road and the cosine takes your forward progress away, so over-steering
costs lap time on its own.

None of that depends on how fast the game runs, which is the point: the angle a
corner demands is a property of the corner.

The numbers around it:

| | | |
| --- | --- | --- |
| `STEER_RATE` | 1.6 rad/s | held. A quarter-second press is about 23° — one corner's worth. |
| `STEER_RETURN` | 0.5 rad/s | released. Slow enough that a long bend still has to be held, fast enough that you are not fighting the car afterwards. |
| `MAX_HEADING` | 0.6 rad | 34°, against 24° needed for the sharpest corner. |

**Two schemes, one physics.** `createTrack` derives `steering` from whether any
section curves — derived rather than declared, so the flag cannot fall out of
step with the sections. On a steering track every car runs the heading model:
the player's from input, everyone else's from `autoSteer`, which aims at the centre of
its target lane.

`autoSteer` is written to be **speed-independent**, and that is deliberate. A
controller expressed as raw gain on the lateral error has to be retuned every
time the pace of the game changes, because the same angle moves a car sideways
proportionally faster; tripling the speed turned the first version into a
weaving mess. So it decides a lateral *speed* — close the gap in `AI_CLOSE_TIME`
seconds, damped by how fast it is already crossing — and then divides by the
car's own speed to get an angle. That is stable at any pace. On the straight track there
is nothing to point at, so cars run `driveOnRails` instead — the kinematic
lane-snap, which is what makes a lane change on that track feel instant, and
which works even for a car crawling out of a shunt. `requestLane` refuses
outright on a track that bends.

`normaliseLane` keeps `lane` as the lane a car is actually nearest to, carrying
the remainder in `lateral`. Free steering would otherwise let `lateral` grow
without bound, and every collision and AI check reads position through `carX`,
which is `laneCenter(lane) + lateral`.

## Simulation

```
state = {
  track, status,          // countdown | racing | finished
  countdown, time,
  cars[],                 // every car, of every kind
  player, racers[], traffic[],
  events[], finishers,
}

car = {
  kind,                   // player | racer | traffic
  type,                   // key into the vehicle registry, for drawing
  lane, targetLane, lateral,
  y, speed, topSpeed, accel,
  length, width,          // matches the artwork
  throttle, braking, offRoad, crashCooldown, laneCooldown,
  finished, finishTime, placed,
}
```

`state.cars` is the single list of everything on the road. `racers` and
`traffic` are views into it, for the AI and for spawning. Every rule that could
possibly be applied inconsistently between kinds of car is written once, against
`state.cars`:

- `overlaps(a, b)` — one box test, used by everything.
- `laneIsClear(state, car, lane, ahead, behind)` — one probe box tested against
  every car. Both the player's lane change and the opponents' overtaking use it,
  so they cannot disagree about whether a gap exists.
- `resolveCollisions(state)` — every pair, `i < j`, no exceptions.

That last one is the fix for the bug this game shipped with. The old build
checked the player against traffic, and opponents against traffic, and nothing
else — so the player and the opponents drove straight through each other. Any
rule keyed on "which kind of car is this" invites that class of bug back, so the
collision code does not ask.

It does ask one question, though: **a car that has finished is not an obstacle.**
It is skipped by collisions, by `laneIsClear` and by the opponents' blocker scan,
and it coasts on rather than braking. Opponents used to brake to a standstill the
moment they crossed the line, which parked three stationary cars across three
lanes a few metres past the finish; the traffic behind piled into them and the
whole field ground to a halt short of the line. The player could sit at zero
until the clock ran out.

Collision resolution runs **two passes** per step. Separating one pair can push a
car into a third, and with a single pass bunched traffic ends up visibly
interpenetrating. Only the first pass reports events, so one shunt is one crash.

### Nudging versus shunting

A rear-end used to throw the car behind down to 55% of the speed of the car in
front, always. Sitting behind slower traffic was then a limit cycle: catch it,
get thrown down, chase it back up, catch it again — and average out *slower than
the car you were stuck behind*. A test run took three minutes to cover a track
that should take thirty-five seconds.

So the response is graded by closing speed. Below `NUDGE_SPEED` you simply
inherit the speed of the car in front — you cannot drive through it, but tucking
in behind is not a crash and raises no event, so the screen does not shake for
it. Above it, the old bounce and a brief cooldown off the power. Being held up
now costs you exactly what it should: the speed of whatever is in your way,
until you get past it.

### Classifying a collision

A rear-end and a side-swipe want opposite responses, and the obvious test — take
whichever penetration is smaller — gets it wrong. Two cars perfectly nose to
tail in the same lane overlap across their *entire* width, so the lateral
penetration is maximal and ties with the longitudinal one; the shunt is then
mistaken for a side-swipe and the cars are flung sideways.

So the classification is on alignment, not penetration: if the lateral gap
between the two centres is under a quarter of their combined width, the cars are
in the same line and it is a rear-end. Otherwise it is a side-swipe.

### Opponent AI

Full throttle, then look ahead over `state.cars` — the player included — within
`140 + speed × 1.4` for anything slower in the way. If there is a blocker, try
the lanes either side using `laneIsClear` with a margin scaled by the driver's
`skill`, and take the first that is free. If neither is, lift off and brake
rather than ram. A cooldown after each change stops the weaving that comes from
re-deciding every frame.

## Traffic

`game.js` keeps the road ahead populated and retires anything well behind. Two
rules govern a spawn: it must not land on top of something already there, and it
must **leave a way through** — at least one lane clear across its stretch of
road. Without the second rule, four lanes' worth of slow traffic can close the
road completely, and since nothing can overtake, the entire field stops. That is
a deadlock, not a difficulty setting.

## Pace

Everything moves at three times the speed it originally did. There was no other
lever: the road is a fixed width in world units and the render scale follows
from that width, so screen scroll rate is `speed × scale` and the only way to
make the game feel faster is to make the cars faster. Top speed is 570 units a
second, which at a phone's scale is 371 pixels a second of road going past.

What had to move with it, and what did not:

| Scales with pace | Stays put |
| --- | --- |
| `ACCEL`, `BRAKE`, `DRAG`, `OFFROAD_DRAG` — so time-to-top-speed is unchanged | `MAX_HEADING`, `STEER_RATE` — the angle a corner demands is a property of the corner |
| `NUDGE_SPEED`, the nudge/shunt threshold | `GRIP`, a rate, not a speed |
| Opponent lookahead and overtaking margins, which are distances | `COLLISION_BUMP`, a ratio |
| Traffic speeds and the gaps they spawn with | |

Opponent top speeds are written as fractions of `MAX_SPEED` rather than
absolute numbers, so changing the pace again cannot quietly leave the whole
field racing at the old one. The braking rule moved from a fixed gap to
time-to-contact for the same reason: closing 400 units a second, one car length
of warning is already too late.

Track sections grew with it — twenty to thirty thousand units, four or five
times what they were — because a race that is over in fifteen seconds is not a
race. The result is roughly the same clock time per race over four times the
road.

## Rendering

`game.js` owns the canvas. The player sits at `cameraFrac` down the screen and
the world scrolls past. The canvas is sized to the stage element with
`devicePixelRatio` capped at 2 — uncapped, a 3× phone screen costs more than the
extra sharpness is worth.

Scale is the *smaller* of two constraints:

- by width, so the road plus a margin of verge fits:
  `width / (ROAD_WIDTH + LANE_WIDTH × 2.4)`
- by height, so at least `MIN_VIEW_AHEAD` units of road stay visible ahead.

The second matters on a short, wide stage — a phone on its side, or a desktop
window. Scaling to width alone there leaves roughly two car lengths of warning,
which is not enough time to react to anything. Letterboxing the road is the
better trade.

The road ribbon's extent is derived from the canvas and the camera rather than
fixed, because the camera moves and a fixed margin behind the player runs out
mid-screen, ending the road in mid air.

Cars are drawn far to near so nearer ones overlap correctly, and each is rotated
by its actual `heading` — seeing your own car point across the road is the whole
feedback loop for steering. On the straight track there is no heading to draw, so
a car leans a token amount towards the lane it is moving to.

### Roadside scenery

Scenery here is not decoration, it is the speed. A pseudo-top-down view has no
perspective and no horizon, so the only thing telling you that you are moving is
objects crossing the frame. Lane dashes and traffic give you some of that, but on
an empty straight they give almost nothing — and the verge used to be a flat fill
with a four-pixel post every 120 units in a colour barely distinct from the
ground, so the game read as stationary at 570 units a second.

Three layers, in rising order of contrast:

1. **Ground bands** — transverse stripes, drawn as sheared quads spanning the
   full width with the road ribbon painted over them. Cheap, and unlike the props
   they are continuous, so there is never a stretch with nothing going past.
2. **Props** — trees, rocks, buildings, cacti, lamp posts, scattered across the
   verge. Placement is a hash of the slot index rather than `Math.random`, so a
   tree stays where it is instead of flickering into a different one each frame.
3. **Edge markers** — red-and-white posts right against the tarmac. The
   strongest of the three: they are where the eye already is, evenly spaced so
   the *rate* is readable, and white against every ground colour.

Two things about props are viewport-dependent, and both matter. They are only
scattered as far out as the screen actually reaches — seeding them into world
space that is never drawn just thins out the verge you can see. And the number
per slot follows the width of the visible verge, because one per side fills a
phone's narrow strip but leaves a desktop window looking empty. Each prop gets
its own band across the verge so they do not clump, and the band nearest the road
is biased towards it, since what passes closest to the eye is what sells the
speed.

Each scenery names a ground colour, a band colour, a marker pair and a weighted
prop table, so a track's environment is data. The prop drawings themselves are
shared: a tree is a tree whether it is a coast palm or a ridge conifer, and every
one carries a drop shadow — against a flat fill, the shadow is most of what makes
a shape read as an object rather than a stain.

### The camera at the finish

The result panel is anchored to the bottom of the stage, which while racing is
exactly where the player's car is. So on finishing, `cameraFrac` eases from 0.78
up to 0.34 and the car — and the line it just crossed — rise clear of the panel.
The alternative, giving the result its own share of the flex column, halves the
stage the instant the player crosses and pushes the finish off screen.

## Vehicle artwork

`vehicles.js` is a registry of `{ length, width, color, draw, klass }` and a set
of drawing functions built from shared helpers: `bodyPath` (a bezier taper from
nose to tail), `paintBody` (a five-stop lateral gradient), `wheels`, `cabin`,
`mirrors`, `lights`.

Two things decide whether a shape reads as a car from above:

- **The greenhouse.** Windscreen, roof and rear window drawn as one connected
  mass, with the windscreen angled and lighter than the rear. A single small
  rectangle of glass reads as a bar of soap. The roof panel spans only the gap
  *between* the two screens — painted edge to edge it covers the windscreen and
  the whole cabin collapses back into a slab.
- **Restraint in the gradient.** A strong centre highlight turns a car into a
  plastic capsule at these sizes.

Colour still has to do some work, though: the traffic hatchback was originally
the same teal as the player's car and read as a second player, and the motorbike
sat within a hair of the red opponent. Traffic keeps clear of the four racing
hues.

Types are then separated by silhouette and detail rather than colour alone: the
truck by its ribbed pale trailer, the bus by window rows down both flanks, the
taxi by a roof sign and chequer flanks, the police car by white doors and a
lightbar that alternates, the motorbike by handlebars and a rider. The racers
are low prototypes with a canopy, livery stripes and a rear wing on end plates.

Drawn size *is* collision size: `VEHICLES[type].length/width` are the same
numbers passed to `createCar`, and a test asserts it. Otherwise cars collide
with air, which is the kind of bug players notice and cannot describe.

## Palette

The page chrome uses the same tokens as Tetris (`--bg: #f4f5f7`, `--panel: #fff`,
`--ink: #1f242b`, `--muted: #6b7480`, `--edge: #d8dce2`, `--accent: #3f5b56`).
The two are the site's full-viewport games, so they are the two places a jump in
theme is most obvious, and the site itself is light — see `games/prompt.md`.

This shell was originally dark, which made arriving at the track picker from
`/games/` feel like landing on a different site. The road stayed dark, because
tarmac is dark: that is canvas content, not the page.

One trap worth naming, since it bit twice here. `#app button` is an id selector,
so a rule like `.track` or `#btnAccel` loses to it and silently does nothing —
which is why the GO and BRAKE buttons had been rendering identical to the arrows
since they were written. Anything overriding a button needs two ids or better.

## Layout

`#app` is a `100dvh` flex column: HUD, progress bar, stage (`flex: 1`), then
either the touch pad or the keyboard hints. The stage takes everything left
over, which is the point — the previous build used about a sixth of a phone
screen for the road.

The shared site stylesheet centres `body` in 800px with padding; both are reset
here, and the site header and footer are hidden, because full screen is the
default rather than a button.

Touch and keyboard are separated with `@media (hover: hover) and (pointer: fine)`:
that query shows the hints line and hides the control pad. The base rules must
come *first* — an equally specific base rule placed after the media query wins
the cascade and silently kills whichever one it duplicates.

## Persistence

Best time per track in `localStorage['car-racing-best-v3']`, as an object keyed
by track id. The key gets bumped whenever a change makes old times meaningless —
once when steering landed, and again when the pace tripled and the tracks grew. Nothing else is stored and nothing leaves the device.

## Cache busting

`index.html` is served with a short cache lifetime and the scripts with a long
one, so new markup can pair with stale JS. Every script tag carries `?v=N`;
**bump it whenever a `.js` file changes**, or returning players get a broken mix.
