# Car Racing — Requirements

A top-down race down a four-lane road: three rivals, traffic that will not move
for you, and a track that bends. Played on a phone as often as a desktop, so the
road gets the whole viewport and the controls have to earn their strip of it.

## Scope

- Browser only, vanilla HTML/CSS/JS, no dependencies, no build step.
- Simulation lives in `engine.js` with no DOM access, so the tests exercise the
  same code the game runs.
- Artwork lives in `vehicles.js` as canvas drawing code, with no game logic in it.
- Tracks are data in `tracks.js`, not code.

## The race

1. The player picks a track, then races from the start line to the finish line.
2. Three CPU rivals race the same distance. Everyday traffic drives slower and
   is in the way; it is not racing.
3. The race ends for the player at the finish line. Position is by distance
   covered while running, and by finish time once cars are home.
4. A countdown holds everyone on the line; no input is accepted until it ends.

### Rules that must hold

| Rule | Behaviour |
| --- | --- |
| Steering | On a track that bends, the road turns and the car does not. Left and right are the wheel, held for as long as you want the car turning; letting go unwinds it slowly. Failing to steer runs you off the outside of the corner. |
| Lane changes | On a bending track there is no such thing: getting across the road is a steering manoeuvre and it takes time. That is fine. |
| The straight track | Exactly one track has no bends. There, left and right change lane outright and the change should feel instant. |
| Collisions | **Every** pair of cars collides, whatever kind they are. Player into rival, rival into player, either into traffic, rival into rival. |
| Rear-end | The car behind is thrown down to a fraction of the car ahead's speed and cannot accelerate for a moment. |
| Side-swipe | Both cars are shoved apart across the road and both lose speed. |
| Lane requests | On the straight track, refused if the target lane is occupied, off the road, or a change is already under way. |
| Following | Catching a slower car gently means inheriting its speed, not losing a chunk of your own. Only a real impact is a crash. |
| Opponent AI | Looks ahead over every car including the player, pulls out when there is a gap, and slows rather than ramming when boxed in. |
| Cornering | A bend pushes a car towards the outside; the faster it is going the more it costs. Grip pulls it back. |
| Off road | The verge is much slower than the tarmac, but never brings a car to a standstill — steering only works while moving, so a stopped car off the road could never get back on. No car can leave the world. |
| Frame clamp | A single step is capped, so a backgrounded tab cannot teleport cars through each other. |
| Finishers clear off | A car that has crossed the line stops being an obstacle and rolls on. It must never park across a lane just past the finish. |
| A way through | Traffic never seals all four lanes across one stretch of road. Dense enough to fill every lane is not a challenge, it is a wall. |

## Pace

- The game runs at an arcade pace: top speed is 570 world units a second, and
  the road is a fixed width in those units, so that number *is* the scroll rate
  — there is no zoom to make it look faster without being faster.
- Accelerations scale with it, so the time to reach top speed is unchanged.
- Zooming out to buy back reaction time is self-defeating: it takes away the
  sense of speed it was bought for. The view only widens far enough to keep a
  short, wide window playable.

## Tracks

- Tracks are long: tens of thousands of units, giving races of roughly 35 to 60
  seconds at racing pace.
- More than one track, each with a name and a one-line description.
- Exactly one of them is dead straight, offered first, and is the place to start.
- Whether a track needs steering follows from whether it bends. It is not a
  separate switch that could disagree with the sections.
- A track is a list of `{ length, curve }` sections. Curves are eased in and out
  so a bend arrives smoothly rather than as a kink.
- Curve magnitude stays within about ±0.45: beyond that the road leaves the
  screen faster than a car can follow it and the corner becomes a coin toss.
- Traffic density is per track, so a city loop feels busier than a desert run.

## Vehicles

- The player and the three rivals are race cars, told apart by colour.
- Traffic is visibly varied: saloons, hatchbacks, SUVs, vans, trucks, buses,
  taxis, police cars and motorbikes.
- Each type must be recognisable as what it is at the size it is drawn in play,
  not only when enlarged. A vehicle's drawn size is its collision size.

## Presentation

- Full screen is the default, not a button. The site header and footer are
  hidden and the road takes the viewport.
- A HUD strip carries speed, position, time and the track name; a progress bar
  shows how far through the race the player is.
- Touch devices get an on-screen control pad. Devices with a fine pointer get a
  line of keyboard hints instead, and no pad.
- The hints and the pad's labels say which of the two control schemes is in play.
- The player's car visibly points where it is steering.
- Enough road is always visible ahead to react to what is coming, whatever the
  shape of the viewport.
- The result is shown without hiding the finish: the player should be able to
  see where they crossed the line.
- Best time per track is remembered locally.

## Not in scope

- Multiplayer, damage models, tyre wear, pit stops, engine sound.
- Any network call or analytics. Nothing about a race leaves the device.
