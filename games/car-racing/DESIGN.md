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
by `atan(curveAt × 0.55)` so it leans into a bend instead of sliding round it
facing up the screen.

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

Best time per track in `localStorage['car-racing-best-v1']`, as an object keyed
by track id. Nothing else is stored and nothing leaves the device.

## Cache busting

`index.html` is served with a short cache lifetime and the scripts with a long
one, so new markup can pair with stale JS. Every script tag carries `?v=N`;
**bump it whenever a `.js` file changes**, or returning players get a broken mix.
