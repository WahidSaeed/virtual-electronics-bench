---
status: approved
---

# Design brief: Virtual Electronics Bench

<!-- Filled in by plan-lens from the learner's interview. Use the learner's words. Mark any value they didn't choose as (default). -->

## The one spatial moment
I'm at my desk with a tutorial open on my real laptop. On the desk in front of me is a real-size virtual breadboard, a battery pack on the left and a parts tray on the right. I pick up an LED, a 220 Ω resistor and jumper wires and build the circuit while I follow the video. When I hook up the battery correctly, the LED glows. If I put the LED in backwards, it turns red right away.

## Why it belongs on glasses
- Uses: draws in the world (a real-size bench on my real desk); leaves your body free (hands build while eyes move between the tutorial and the bench).
- Why it's better than the phone or laptop version: you practice with your hands at real scale on your own desk, the way you would with real parts, without buying parts. Your laptop stays free for the tutorial instead of being taken up by a simulator.

## Product or overlay
- Type: product. The virtual bench and parts are the experience.
- What the real version would sense: nothing. The user's real desk is the only real thing involved.
- Stand-in for the preview: a virtual desk surface at real desk height (default) stands in for the user's real desk.

## Where things live
- Where the user is looking during the main task: down at the breadboard on the desk, about 45–55 cm from the eyes, about 30–40 cm below eye level (default). They glance up at their real laptop now and then.
- Real laptop: stays on the real desk. The bench layout leaves the area directly behind the breadboard empty so the virtual parts don't cover it (default).
- Virtual desk: a flat surface about 120 x 60 cm at about 75 cm high, in front of the user at start (default).
- Breadboard: in the center of the desk, at real size (half-size board, about 8.3 x 5.5 cm (default)), with + and − power rails marked.
- Battery pack: on the left of the breadboard, about 15 cm from it (default). A 2xAA pack (3 V) (default) with a red lead and a black lead.
- Parts tray: on the right of the breadboard, about 15 cm from it (default), holding the LED, the 220 Ω resistor and jumper wires.
- Parts are real size. The LED has a visibly longer leg (+) and a flat side (−) so the user can see which way it faces.

## Hands and input
- Pick up a part: pinch and grab it from the tray, with either hand.
- Place a part: drag it over the breadboard and let go. It snaps into the nearest row.
- Jumper wires: drag each wire end onto a hole, and it snaps to the nearest hole.
- Connect the battery: drag the battery's red and black lead ends into holes. They snap like wire ends (default).
- Move or remove: grab a placed part or wire again and move it, or drop it back on the tray (default).
- Targets are big and highlight when aimed at. Each small part has a grab zone larger than its visible size (default), because real-size parts are too small to pinch reliably.
- Voice: none.

## When things show
- No instruction card and no project menu. The tutorial lives on the user's laptop. The Lens is an open practice bench that checks the circuit.
- Backwards LED: turns red right away, as soon as its direction relative to the battery's + and − can be told from what is connected, and stays dark. The red clears as soon as it's fixed.
- LED glow: shows when the battery is connected correctly through the resistor and LED. It goes off when the circuit is broken.
- If something needs attention out of view: none. Everything sits on the desk in view.

## Done criteria
Each one can be checked in Lens Studio's preview.
1. Dragging the LED from the tray onto the breadboard snaps it into a row.
2. Placing the LED backwards in the circuit turns it red.
3. With the battery, 220 Ω resistor, LED and jumper wires connected correctly, the LED glows.

## Out of scope
- Soldering (future idea).
- Arduino, Raspberry Pi and ESP32 as power sources or boards. Arduino as a power option is a stretch goal after the battery version works.
- Guided instruction cards and a menu of practice projects.
- Checking any other circuit or mistake (a missing resistor, a short across the battery). This version only checks LED direction and whether the LED + resistor circuit is complete.
- Real electrical simulation such as current or voltage readouts.

## Risks and open questions
- Two hands: the learner wants both hands to pick and place parts. On SPECS either hand can do this, but the preview drives one hand with the mouse, so the demo shows one hand at a time. Moves that need both hands at once can't be shown. Feel unproven.
- Real-size parts are tiny. Snapping and larger grab zones should make placing them workable, but whether it's comfortable on real glasses is feel unproven.
- "Right away" for a backwards LED depends on knowing where + and − are. Before the battery is connected, the Lens may only be able to judge direction once the LED is linked to a power rail.
- The real laptop's position varies from desk to desk. The virtual bench may overlap it on real glasses.

## Build notes for CLAD
- Build for SPECS so it runs and can be demonstrated in Lens Studio's preview. No SPECS device is available.
- Use Spectacles Interaction Kit (SIK) and UI Kit for all interactions, so they work with the mouse in Interactive Preview and with LEAF.
- Build any stand-in exactly as described above, and keep it obvious in the scene.
- Use real-world scale in centimeters. Keep content inside the user's view during the main task.
- The display is additive: black renders as transparent. Don't rely on black or very dark content to be seen; keep text light and readable from where the user stands.
- Get the basic flow working first, then add detail.
- Write LEAF scenarios for each done criterion, run them in preview, and report which pass. Say which criteria have no test.
- Don't record, identify, or follow people.

## After the build: judge it
This part is for you, after CLAD finishes.

1. **Does it work?** Ask your agent which LEAF tests passed and which done criteria have no test.
2. **Walk around it.** Open the preview in Interactive Preview. Use WASD to move, Q and E to go down and up, and right-drag (or hold Shift) to look around. Clicking acts as a pinch. Stand where a user would and look at the task.
3. **Ask the three questions.**
   - Does it use what I'm looking at?
   - Does it put something in my space, where it belongs?
   - Does it free my hands or let me keep my eyes up?
   - Would it be just as good on a phone? If so, what would make it need the glasses?
4. **Check comfort.**
   - Everything I need is in view while I do the task. Nothing sits at the edges, behind me, or stuck to my face.
   - Every control is within reach of someone standing there.
   - Text reads easily from where I stand. No dark UI disappearing.
   - Things show when needed and get out of the way.
5. **Label what you know.** Write "logic proven" next to anything the tests and preview show working, and "feel unproven" next to anything only real glasses could tell you (comfort over time, real hand tracking, real recognition).
6. **Fix with design notes, not code.** Tell your agent what to change in design terms, for example: "Move the step card 15 cm lower and next to the pan. Make the Next button twice as big. Re-run the tests." If a fix takes under a minute, like nudging a panel, do it yourself in the scene.
7. **Submit.** Record a video under 3 minutes of your Lens in the preview, public on YouTube. Make your repo public with your Lens Studio project and this `devpost/` folder. Details are on the hackathon site: https://learn-specs.devpost.com/resources
