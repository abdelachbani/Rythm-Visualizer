<div align="center">

<h1>Rythm Visualizer</h1>

<p>An interactive, audio‑reactive visualizer built with p5.js and p5.sound.</p>

</div>


## Features
- Audio‑reactive **visuals driven by FFT (Fast Fourier Transform) and amplitude analysis** (p5.sound)
- Themed UI (light/dark) with a modern glassy control panel
- Upload your own audio file and loop playback
- Interactive controls:
  - Sensitivity slider (wheel shortcut)
  - Color shift slider
  - Lock center / Follow mouse toggle for the core
  - Play/Pause button
  - Toggle the Theme button
  - Hideable control panel with a floating "☰ Menu" FAB to bring it back
- Mouse/keyboard interactions:
  - Click: emit a colorful burst and ripple
  - Drag: attract particles toward the cursor
  - Mouse wheel: adjust sensitivity
  - Space: Play/Pause
  - F: Toggle fullscreen
  - E: Trigger an extra burst
- Adaptive quality: dynamically adjusts particles, stars, bands, glow blur/scale, etc. to maintain a target FPS
- Custom cursor: a neon ring cursor suited to the visualizer aesthetics


## Demo
>> 


## Getting Started

### Prerequisites
- A modern desktop browser (Chrome, Edge, Firefox, Safari)
- Internet connection is required by default because index.html uses CDN links for p5.js and p5.sound. If you need offline use, see the Offline section below.

### Run locally (no build required)
1. Clone or download this repository.
2. Open index.html by double‑clicking it, or serve the directory with any static server.
3. Click "Choose file" and select an audio file (e.g., MP3). The track will load and start looping.

That’s it! Everything runs client‑side.


## Usage Guide

- Audio
  - Choose file: opens a file picker; the selected audio will loop.
  - Play/Pause: toggles playback.
- Controls row
  - Toggle Theme: switches between light and dark themes.
  - Lock center / Follow mouse: toggles whether the core stays centered or follows the mouse attraction while dragging.
- Sliders
  - Sensitivity: adjusts how strongly the visuals react to audio; can also be adjusted with the mouse wheel anywhere on the canvas.
  - Color shift: rotates the palette hue for a different color mood.
- Panel visibility
  - Hide: hides the control panel.
  - ☰ Menu: a floating round button appears in the top‑left to bring the panel back.

### Mouse and keyboard shortcuts
- Space: Play/Pause
- F: Fullscreen
- E: Trigger an extra burst
- Click: Burst + ripple at the cursor
- Drag: Attract particles
- Mouse wheel: Adjust sensitivity


## Architecture
- index.html
  - Minimal HTML shell; loads p5.js and p5.sound from CDN and the app script (sketch.js). Title shows "Rythm Remixer".
- sketch.js
  - Main p5 sketch: sets up audio analysis, draws visuals, handles UI (panel, buttons, sliders), and defines interactions.
  - Applies theme classes to the document body.
  - Implements adaptive quality adjustments driven by recent FPS samples.
  - Handles window resizing and fullscreen toggling.
- style.css
  - Themed UI panel styling (glass effect), buttons, sliders, labels, and FAB button.
  - Custom neon ring cursor tuned for the visualizer aesthetics.


## Offline use
The repository includes local copies of p5.js and p5.sound.min.js. To run without internet access, replace the CDN script tags in index.html with the local files:

```html
<!-- Replace CDN with local files for offline use -->
<script src="p5.js"></script>
<script src="p5.sound.min.js"></script>
```


## Browser permissions and audio notes
- User gesture: Most browsers require a user interaction before audio can start. Clicking Play or choosing a file satisfies this.
- Supported formats: MP3/M4A/OGG support varies by browser. MP3 is widely supported.
- Large files: Decoding very large audio files may take a moment.


## Performance
The sketch targets roughly 50 FPS. It samples recent frame rates and automatically adjusts:
- Particle/star counts
- FFT bands, blob points, micro elements
- Glow blur and resolution scale

This keeps visual fluidity across devices. You can still influence intensity via the Sensitivity slider.


## Development
- No build step. Edit sketch.js and style.css, then refresh the browser.
- Live‑reload is optional; you can use any static server (e.g., VS Code Live Server) for convenience.
- The UI text is created programmatically in setup() inside sketch.js.


## Contributing
Contributions are welcome. Suggested ways to help:
- Bug reports and reproducible steps
- Performance profiling on different devices
- New visual layers or palettes
- UI/UX improvements (accessibility, mobile layout)

Open a pull request with a clear description of changes and screenshots/GIFs when relevant.