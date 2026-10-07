# FLEX CODE Living Identity V5

Interactive media. The poster watches a body through the camera, and you decide what it watches and what that changes.

Author: Jingyang Liu, Ph.D., XJTLU Design School

Live: https://leoliujingyang.github.io/arc409-interactive-media/

Made for the ARC409 Computational Media week.

## The idea

Three things are always on screen together:

1. **Sense** (left): what the camera sees, with the tracked hand, face or body marked on it by a few dots, and a live meter for every reading
2. **Poster** (middle): the design, answering in real time, with the same dots laid faintly over it
3. **Rules** (right): the links between the two, each one a sentence: *when* this reading, *drives* this element, *to* do this

Earlier versions adapted one design to several formats. That is gone. There is one poster, and all the attention goes to the conversation between a person and it.

## Run

The live page above needs nothing installed, and being https it can use the camera. To run it on your own machine:

```bash
cd living_identity_v5
python3 serve.py
```

Open the Local address it prints. On Windows use `py serve.py` or double click `start.bat`; on a Mac you can double click `start.command`.

Two things this version needs that earlier ones did not:

- **A connection, for the trackers.** The tracking library and three model files (about 17 MB of models, plus the library) are fetched from the web the first time each tracker is switched on with the camera. Pointer needs nothing.
- **localhost or https, for the camera.** Browsers only hand out the camera on `localhost` or an `https` address. Students opening `http://192.168.x.x:8080` from the classroom address will get everything except the camera. The live page, or each student running it locally, solves that.

## Sense: where the body comes from

| Source | What it is |
| --- | --- |
| Camera | You. The browser asks for permission once |
| Pointer | Your pointer plays one hand: move over the sensor view, press to pinch, scroll to open and close. In Perform it works directly on the poster. It is what the tool opens on, so something moves before any camera is allowed |

The fine corners in the sensor view mark the window the poster listens to: the middle of the camera frame, in the poster's proportions.

What is tracked is drawn as quietly as possible: a dot on each fingertip and one on the palm, a thin ring around the head with a dot on the nose, dots on shoulders, elbows, wrists and hips. A hairline joins thumb and index as they pinch. A mark turns orange when one of your rules is following it, the same orange dot that marks used signals in the list.

**Track** switches three trackers on and off: Hand, Face, Body. Run only what your rules use; each one costs frame rate.

## Signals: what can be read

Every signal is a number from 0 to 100, shown live. A dot marks the ones your rules already use, and the plus beside any signal starts a rule from it.

- **Hand**: Pinch, Open hand, Hand across, Hand height, Twist, Hand closeness, Hand speed, Fingers up, Hands apart, and three gestures that are either on or off: Fist, Peace sign, Pointing
- **Face**: Mouth open, Smile, Eyebrows up, Eyes closed, Head tilt, Head turn, Head nod, Face closeness, Face across
- **Body**: Arms raised, Left arm, Right arm, Arm span, Lean, Body closeness, Body across, Movement
- **Clock**: Slow wave, Beat, Drift. These need no body, for motion that should carry on when nobody is there

There are also **points**, which are places rather than amounts: Fingertip, Palm, Second fingertip, Nose, Left wrist, Right wrist, Chest.

## Rules: what the readings do

A rule has a source, a target and an effect.

**A signal driving an element** (one element, all type, all shapes, or every element): Move sideways, Move up, Size, Rotate, Stretch, Opacity, Colour blend, Echo copies, Echo spacing, and for type Letter wave and Depth. You set the value at the low end of the signal and at the high end.

**A point pulling an element**: Follow, Pull toward, Push away, Turn to face.

**A signal driving the whole poster**: Trails, Slice, Wave, Split, Mosaic, Grain, Zoom, Tilt.

**A signal firing an event** when it crosses a level: Mutate layout, Next palette, Pulse.

Open a rule to change any of it. **Tune the reading** holds the calibration: smoothing, the part of the signal's range to listen to (useful when your pinch only ever reaches 70), and the response curve.

When the source of a rule leaves the frame, the rule fades out and the poster settles to its rest design.

### Suggestions

Seven ready sets of rules, written against roles so they fit whatever is on the poster:

| Suggestion | Tracks | What happens |
| --- | --- | --- |
| Conductor | Hand | Pinch stretches the headline, a dot follows your fingertip, a ring backs away, twisting turns a bar, fast moves leave trails |
| Face type | Face | Mouth opens the headline, a smile changes its colour, eyebrows roll the letters, tilting your head turns the shapes, a blink makes everything jump |
| Body sculpt | Body | Raised arms lift the shapes, arm span stretches the headline, leaning tilts the poster, one wrist pulls and the other pushes |
| Come closer | Face | Coarse blocks from across the room, sharp when you step up |
| Magnets | Hand | Two hands: one pulls the shapes, one pushes the type, spreading them zooms |
| Signs | Hand | A peace sign steps the palette, a fist reshuffles the layout, pointing makes it jump |
| Clockwork | none | No body needed, the poster idles on its own |

Applying one replaces the current rules and switches on the trackers it needs. Ctrl Z brings the old set back.

## Echo as a trail

Copies of an element replay what the first copy did a moment earlier. Give a shape five stacked copies with some lag and fade, let it follow a fingertip, and it leaves a tail.

## Design and Perform

- **Design**: the poster holds still while your pointer is on it so you can edit; move off and it listens to the body again.
- **Perform** (Space): panels slide away, the sensor view shrinks to a corner, the poster takes the stage.
- **Pause** (P) freezes the poster and the readings.
- **Show body** lays the tracked dots over the poster so the performer can see where they are.

Elements, shapes with draggable points, type with rules and gradients, palettes, grammar, undo and redo all work as in V4.

## Saving

Bottom right of the stage. The first menu chooses what goes into the picture:

- **Poster**: the poster alone
- **Camera and poster**: the camera scene with its tracked dots on the left, the poster on the right, on black. This is the one for documenting an interaction, because it shows the cause beside the effect

Then the kind of file:

- **PNG**: the current moment
- **Video** (R): records what is actually happening for the chosen length. mp4 where the browser can write it, otherwise webm
- **GIF**: also recorded live now, then encoded when the clip ends. Longer clips use a lower frame rate to stay light

Press the same button again to stop a recording early and keep what was captured.

**Save JSON / Load JSON** (Poster tab) keeps the poster with its rules.

## What was tested, and what was not

Tested in a browser: all three trackers load and run, and the readings were checked against sample photographs (a peace sign reads as a peace sign, a fist as a fist, a smile as a smile, open hands as open). Every suggestion, every effect from every kind of source, the pointer hand, undo, saving and loading, and PNG, GIF and video export of the poster alone and of both scenes side by side.

Not tested: a live camera. The preview it was built in blocks camera access, so the camera path (permission, live tracking speed, and the camera picture inside a saved file) has only been read, not run. Try it first, in a normal browser window.

## Running without a connection

Everything fetched from outside is listed in one place, `LI.SENSE` at the top of `js/sense.js`: the library, its wasm folder, and three model files. Copy those into the project and point the four addresses at the copies, and the tool runs offline and no longer depends on servers that some networks cannot reach.

## Why not ml5

ml5 wraps the same family of trackers. This build calls them directly (MediaPipe Tasks Vision) because that gives facial expressions as ready numbers, runs faster with three trackers at once, and lets the model files be hosted locally. Everything specific to the library is inside `js/sense.js`; the rest of the app only sees signals and points.

## Files

```text
index.html     layout
style.css      interface
assets/        XJTLU Design School logo
js/core.js     state, palettes, shapes, starters, save and load, undo steps
js/rules.js    signals, effects, rule evaluation, suggestions
js/render.js   grammar, type and shape drawing, master effects
js/sense.js    camera, trackers, the pointer's hand, landmarks to signals
js/editor.js   selection and point editing on the poster
js/export.js   GIF encoder and video recorder support
js/ui.js       panels, keys, main loop
serve.py       local server
```

To try the trackers on a still picture from the browser console: `LI.sense.usePhoto('address of an image')`, and `LI.sense.usePhoto(null)` to stop.
