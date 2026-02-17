# CLAUDE.md — Greek AR Astronomy App for Kids

## Project Overview

A web-based Augmented Reality astronomy app for young Greek-speaking children (pre-readers).
The app uses the device camera and gyroscope/GPS to overlay constellations and stars on the real sky,
with **full Greek language support** and **text-to-speech narration** so children who can't read yet
can fully enjoy the experience.

## Target User

- Young child (pre-reading age), native Greek speaker
- Used with parent assistance on a smartphone
- Magical, fun, low-friction experience — not educational in a dry sense

---

## Tech Stack

- **Vanilla HTML/CSS/JavaScript** (single file or minimal files, no build step)
- **AR.js** + **A-Frame** for WebAR via device camera and orientation sensors
- **Web Speech API** (`speechSynthesis`, `el-GR` voice) for Greek narration
- **DeviceOrientation API** for sky alignment
- **Geolocation API** for location-based accuracy (optional, ask permission gracefully)
- Hosted as a static site (GitHub Pages, Netlify, or local server)

No npm, no bundler, no backend. Everything runs in the browser.

---

## Core Features

### 1. AR Sky Overlay
- Camera feed as background
- Constellation lines and star markers overlaid using A-Frame + AR.js
- Positions calculated from device orientation (compass + gyroscope)
- Major constellations to include initially:
  - Ωρίωνας (Orion)
  - Μεγάλη Άρκτος (Ursa Major / Big Dipper)
  - Κασσιόπεια (Cassiopeia)
  - Σκορπιός (Scorpius)
  - Λέων (Leo)

### 2. Greek Text-to-Speech (Priority Feature)
- Uses `window.speechSynthesis` with `lang: 'el-GR'`
- Speaks automatically when a star/constellation comes into focus
- Also speaks on tap/click
- No reading required — the app *talks* to the child
- Warm, friendly narration tone (short sentences, enthusiastic)

Example narration strings:
```javascript
const narrations = {
  orion: "Αυτός είναι ο Ωρίωνας! Ένας γίγαντας κυνηγός στον ουρανό!",
  ursaMajor: "Η Μεγάλη Άρκτος! Μοιάζει με μια μεγάλη κατσαρόλα!",
  cassiopeia: "Κασσιόπεια! Μια βασίλισσα που κάθεται στον ουρανό!",
  scorpius: "Σκορπιός! Βλέπεις την ουρά του;",
  leo: "Λέων! Ένα λιοντάρι φτιαγμένο από αστέρια!"
};
```

### 3. Kid-Friendly UI
- Big, tappable star/constellation markers (minimum 60px touch targets)
- Bright, cartoon-inspired visual style — not clinical or adult
- Constellation art/illustrations (simple SVG line drawings)
- Animated sparkle effects when a star is tapped
- A friendly character mascot (simple astronaut or rocket SVG) in the corner
- Minimal on-screen text (icons preferred over labels)

### 4. Simple Navigation
- One main screen: the AR camera view
- Side panel or bottom sheet slides in with constellation info when tapped
- Info panel shows: constellation illustration + name in Greek + speak button (🔊)
- "Επόμενο" (Next) button to cycle through constellations
- Large "🔊 Άκου!" button always visible for replay

---

## Design Guidelines

- **Color palette**: Deep midnight blue background (#0a0a2e), gold/yellow stars (#FFD700), white constellation lines, vibrant accent colors for UI elements
- **Typography**: Large, rounded, friendly Greek-compatible font (e.g., Google Fonts `Nunito` or `Fredoka One` — both support Greek)
- **Animations**: Twinkling star animations (CSS keyframes), smooth slide-in panels
- **Sound**: Only speech synthesis — no background music (to keep it simple and battery-friendly)
- **Accessibility**: High contrast, large touch targets, voice-first design

---

## File Structure

```
/
├── index.html          # Main app (self-contained as much as possible)
├── stars.js            # Star/constellation position data
├── narrations.js       # Greek narration strings
├── speech.js           # Web Speech API wrapper
├── ar-scene.js         # A-Frame scene setup and AR logic
├── ui.js               # Panel, buttons, animations
├── style.css           # Global styles
└── assets/
    ├── constellations/  # SVG constellation illustrations
    └── mascot.svg       # Friendly astronaut character
```

---

## Constraints & Considerations

- **Must work on mobile browsers** (Chrome on Android, Safari on iOS)
- iOS requires user gesture before `speechSynthesis` will work — wire it to the first tap
- AR.js needs HTTPS to access camera — ensure hosting uses HTTPS
- Keep asset sizes small — child may use on mobile data
- Graceful fallback if AR/gyroscope not available (show a static star map instead)
- Ask for camera and location permissions with friendly Greek prompts:
  - "Μπορούμε να χρησιμοποιήσουμε την κάμερά σου για να δούμε τα αστέρια;" 

---

## Development Approach

1. Start with a working static HTML page with the AR.js + A-Frame skeleton
2. Add constellation data and positioning logic
3. Implement Greek TTS and wire to tap events
4. Build the info panel UI
5. Polish animations and kid-friendly design
6. Test on real mobile device (emulators won't have real gyroscope data)

---

## Greek Vocabulary Reference

| English | Greek |
|---|---|
| Stars | Αστέρια |
| Constellation | Αστερισμός |
| Sky | Ουρανός |
| Listen | Άκου |
| Next | Επόμενο |
| Back | Πίσω |
| Night | Νύχτα |
| Moon | Φεγγάρι |
| Sun | Ήλιος |
| Planet | Πλανήτης |

---

## Notes for Claude Code Sessions

- Always prefer **simplicity over completeness** — a working, delightful app beats a feature-complete broken one
- When adding constellations, add narration strings at the same time
- Test speech synthesis with `el-GR` locale first — if no Greek voice is available on the device, fall back to reading slower with `el` locale
- The child **cannot read** — every interaction must have a spoken equivalent
- When in doubt, make the tap targets bigger and the colors brighter
