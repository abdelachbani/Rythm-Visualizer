/* eslint-env browser */
/* global p5, createCanvas, windowWidth, windowHeight, pixelDensity, colorMode, angleMode, createGraphics, width, height, createDiv, createElement, createFileInput, createButton, createSlider, createInput, createP, createSpan, loadSound, createVector, floor, max, min, random, noStroke, smooth, color, lerpColor, rect, fill, noFill, beginShape, endShape, vertex, curveVertex, cos, sin, map, noise, blendMode, BLEND, ADD, SCREEN, MULTIPLY, image, tint, noTint, ellipse, text, textAlign, CENTER, textSize, stroke, strokeWeight, line, fullscreen, frameCount, frameRate, nf, alert, mouseX, mouseY, translate, rotate, push, pop, filter, BLUR, textWrap, WORD, resizeCanvas, constrain, select, radians */

let song, fft, amp, peak;
let playing = false;

// visuals
let paletteHue = 210;
let baseRadius = null;
let particles = [];
let bursts = [];
let stars = [];
let glowBuffer; // half-res buffer for bloom
let grainCanvas; // pre-generated grain
let shake = 0;
let theme = 'dark';

// quality settings (adaptive)
let quality = {
    particles: 180,
    stars: 140,
    bands: 120,
    blobPoints: 160,
    microCount: 10,
    glowBlur: 4,
    glowScale: 0.5
};
let targetFPS = 50;
let fpsSamples = [];
let lastQualityAdjust = 0;

// UI elements
let uiPanel, uploadInput, playBtn, toggleThemeBtn, lockCenterBtn;
let sensitivitySlider, colorShiftSlider;
let menuFab, hideBtn, fileBtn, fileNameLabel;

// Title overlay
let showTitle = false;
let titleText = '';
let artistText = '';
let titleTimer = 0;

// Interaction state
let isDragging = false;
let lastMouse = {x: 0, y: 0};
let mouseAttractStrength = 0.9; // multiplier for drag attraction
let centerLocked = false;

// Ripples
let ripples = [];

// Click performance controls
let clickCooldown = 0;
const MAX_BURSTS = 3;
const MAX_RIPPLES = 6;


let orbiters = [];

// Prominent rhythmic element: PulseCore
let pulseCore = {
    pos: null,
    target: null,
    vel: null,
    baseSize: 1.0,
    smooth: 0.14
};

function setup() {
    createCanvas(windowWidth, windowHeight);
    pixelDensity(1);
    colorMode(HSB, 360, 100, 100, 1);
    angleMode(DEGREES);

    fft = new p5.FFT(0.92, 1024);
    amp = new p5.Amplitude();
    peak = new p5.PeakDetect(20, 100, 0.14, 20);

    glowBuffer = createGraphics(max(1, floor(width * quality.glowScale)), max(1, floor(height * quality.glowScale)));
    glowBuffer.pixelDensity(1);

    grainCanvas = createGraphics(256, 256);
    grainCanvas.pixelDensity(1);
    generateGrainTexture();

    // apply initial theme classes to the body
    updateUIPanelStyle();

    // Floating FAB to reopen a menu (hidden initially)
    menuFab = createButton('☰ Menu');
    menuFab.addClass('ui-fab');
    menuFab.style('display', 'none');
    menuFab.mousePressed(() => {
        if (uiPanel) uiPanel.style('display', 'block');
        menuFab.style('display', 'none');
    });


    uiPanel = createDiv('');
    uiPanel.class('ui-panel');
    uiPanel.style('position:absolute; left:12px; top:12px; z-index:10;');


    const header = createDiv('');
    header.parent(uiPanel);
    header.addClass('ui-header');
    createElement('h3', 'Remix Visualizer').parent(header).class('ui-title');
    hideBtn = createButton('Hide');
    hideBtn.parent(header);
    hideBtn.addClass('ui-btn');
    hideBtn.mousePressed(() => {
        uiPanel.style('display', 'none');
        menuFab.style('display', 'block');
    });


    createDiv('Audio').parent(uiPanel).class('ui-label');
    const fileRow = createDiv('');
    fileRow.parent(uiPanel);
    fileRow.addClass('ui-file-row');
    uploadInput = createFileInput(handleFile).parent(fileRow).attribute('accept', 'audio/*');
    uploadInput.style('display', 'none');
    fileBtn = createButton('Choose file');
    fileBtn.parent(fileRow);
    fileBtn.addClass('ui-btn');
    fileBtn.mousePressed(() => {
        if (uploadInput && uploadInput.elt) uploadInput.elt.click();
    });
    fileNameLabel = createSpan('No file');
    fileNameLabel.parent(fileRow);
    fileNameLabel.addClass('ui-file-name');


    playBtn = createButton('Play').parent(uiPanel);
    playBtn.addClass('ui-btn');
    playBtn.mousePressed(togglePlay);

    const ctrlRow = createDiv('').parent(uiPanel);
    ctrlRow.addClass('ui-row');

    toggleThemeBtn = createButton('Toggle Theme').parent(ctrlRow).mousePressed(() => {
        theme = (theme === 'dark') ? 'light' : 'dark';
        updateUIPanelStyle();
    });
    toggleThemeBtn.addClass('ui-btn');


    lockCenterBtn = createButton('Lock center');
    lockCenterBtn.parent(ctrlRow);
    lockCenterBtn.addClass('ui-btn');
    lockCenterBtn.mousePressed(() => {
        centerLocked = !centerLocked;
        lockCenterBtn.html(centerLocked ? 'Follow mouse' : 'Lock center');
        if (centerLocked && pulseCore && pulseCore.pos && pulseCore.vel) {
            pulseCore.pos.x = width / 2;
            pulseCore.pos.y = height / 2;
            pulseCore.vel.set(0, 0);
        }
    });

    // Sliders
    createDiv('Sensitivity').parent(uiPanel).class('ui-label');
    sensitivitySlider = createSlider(0.2, 3.0, 0.20, 0.01).parent(uiPanel);
    sensitivitySlider.addClass('ui-slider');

    createDiv('Color shift').parent(uiPanel).class('ui-label');
    colorShiftSlider = createSlider(0, 180, 68, 1).parent(uiPanel);
    colorShiftSlider.addClass('ui-slider');

    createP('Shortcuts: SPACE Play/Pause • F Fullscreen • Click = Burst • Drag = Attract particles • Wheel = Sensitivity')
        .parent(uiPanel).addClass('ui-help');

    baseRadius = min(width, height) * 0.11;

    for (let i = 0; i < quality.particles; i++) particles.push(new Particle(baseRadius));
    for (let i = 0; i < quality.stars; i++) stars.push(new Star());

    // init pulseCore
    pulseCore.pos = createVector(width / 2, height / 2);
    pulseCore.target = createVector(width / 2, height / 2);
    pulseCore.vel = createVector(0, 0);
    pulseCore.baseSize = min(width, height) * 0.12;


    const orbCount = 8;
    for (let i = 0; i < orbCount; i++) {
        orbiters.push({
            a: random(0, 360),
            speed: random(0.4, 1.2),
            offset: random(-14, 24),
            size: random(2.2, 4.2),
            hueOff: random(-20, 20)
        });
    }

    noStroke();
    smooth();
}

function generateGrainTexture() {
    grainCanvas.loadPixels();
    for (let x = 0; x < grainCanvas.width; x++) {
        for (let y = 0; y < grainCanvas.height; y++) {
            const i = (x + y * grainCanvas.width) * 4;
            const v = 128 + floor(random(-18, 18));
            grainCanvas.pixels[i] = v;
            grainCanvas.pixels[i + 1] = v;
            grainCanvas.pixels[i + 2] = v;
            grainCanvas.pixels[i + 3] = 255;
        }
    }
    grainCanvas.updatePixels();
}

function updateUIPanelStyle() {
    // toggle theme classes on the body
    const body = select('body');
    if (body) {
        if (theme === 'dark') {
            body.addClass('theme-dark');
            body.removeClass('theme-light');
        } else {
            body.addClass('theme-light');
            body.removeClass('theme-dark');
        }
    }
}

// --- Audio handlers ---
function handleFile(file) {
    if (file.type === 'audio') {
        if (song && song.isPlaying()) song.stop();
        song = loadSound(
            file.data,
            () => {
                fft.setInput(song);
                amp.setInput(song);
                song.loop();
                playing = true;
                playBtn.html('Pause');
                titleText = file.name.replace(/\.[^/.]+$/, '');
                if (fileNameLabel) fileNameLabel.html(file.name);
                showTitle = true;
                titleTimer = 240;
            },
            (err) => {
                alert('Error loading audio: ' + err);
            }
        );
    } else {
        alert('Please upload an audio file (mp3/wav).');
    }
}

function togglePlay() {
    if (!song) {
        alert('Load an audio file first.');
        return;
    }
    if (song.isPlaying()) {
        song.pause();
        playing = false;
        playBtn.html('Play');
    } else {
        song.play();
        playing = true;
        playBtn.html('Pause');
    }
}

function avgFPS() {
    if (fpsSamples.length === 0) return 60;
    const sum = fpsSamples.reduce((a, b) => a + b, 0);
    return sum / fpsSamples.length;
}

// --- Draw loop ---
function draw() {
    fpsSamples.push(frameRate());
    if (fpsSamples.length > 60) fpsSamples.shift();
    if (millis() - lastQualityAdjust > 3000) {
        adaptiveQualityAdjust();
        lastQualityAdjust = millis();
    }
    if (clickCooldown > 0) clickCooldown--;

    setGradientBackground(color((paletteHue + 5) % 360, 18, theme === 'dark' ? 6 : 98), color((paletteHue + 40) % 360, 30,
        theme === 'dark' ? 8 : 94));

    const spectrum = fft.analyze();
    const waveData = fft.waveform();
    const level = amp.getLevel();
    peak.update(fft);

    // gentle palette drift over time and a small bump on peaks
    paletteHue = (paletteHue + 0.03 + (peak.isDetected ? 0.6 : 0)) % 360;

    const sens = sensitivitySlider.value();
    const shiftAmt = colorShiftSlider.value();

    const targetBase = min(width, height) * (0.07 + level * sens * 0.45);
    if (!isFinite(baseRadius) || baseRadius === null) baseRadius = targetBase;
    baseRadius = lerp(baseRadius, targetBase, 0.16);

    if (peak.isDetected) {
        const lite = avgFPS() < (targetFPS - 4) || bursts.length >= MAX_BURSTS;
        if (bursts.length < MAX_BURSTS) bursts.push(new Burst((paletteHue + random(-10, 10)) % 360, {lite}));
        shake = min(12, shake + map(level, 0, 0.5, 3, 14));
    }

    push();
    translate(random(-shake, shake), random(-shake, shake));
    for (let s of stars) s.draw(level);
    pop();

    push();
    translate(width / 2 + random(-shake, shake), height / 2 + random(-shake, shake));
    const flowLayers = 2;
    for (let layer = 0; layer < flowLayers; layer++) {
        const factor = 1.6 - layer * 0.38;
        const hue = (paletteHue + shiftAmt * layer * 0.28 + frameCount * (0.01 + layer * 0.02)) % 360;
        blendMode(BLEND);
        fill(hue, 72, theme === 'dark' ? 12 : 96, 0.08 + layer * 0.04);
        beginShape();
        const points = (quality.blobPoints > 180) ? 44 : 32;
        for (let i = 0; i < points; i++) {
            const a = map(i, 0, points, 0, 360);
            const n = noise(cos(a) * 0.006 + layer * 0.02 + frameCount * 0.0008, sin(a) * 0.006 + layer * 0.03);
            const r = baseRadius * factor * (0.8 + n * 1.35);
            vertex(cos(a) * r, sin(a) * r);
        }
        endShape(CLOSE);
    }
    pop();

    glowBuffer.clear();
    glowBuffer.push();
    glowBuffer.scale(quality.glowScale);

    // Waveform ring
    const bassE_forRing = fft.getEnergy('bass');
    const blobBaseEst_forRing = baseRadius * (1 + map(bassE_forRing, 0, 255, 0, 1.6));
    const centralMaxR_forRing = max(
        blobBaseEst_forRing * 1.5,
        (pulseCore.baseSize * (1 + map(bassE_forRing / 255, 0, 1, 0, 1.6))) * 0.5
    );
    const minGap = max(18, min(width, height) * 0.02);
    const ringMinR = centralMaxR_forRing + minGap;

    const screenMargin = min(width, height) * 0.08;
    const ringMaxScreen = (min(width, height) * 0.5) - screenMargin;

    let corridorMin = ringMinR;
    let corridorMax = max(ringMaxScreen - 10, corridorMin + 24);
    let corridorLen = max(12, corridorMax - corridorMin);

    const desiredBase = max(baseRadius * 2.1, corridorMin + 0.5 * corridorLen);
    let ringBaseR = constrain(desiredBase, corridorMin + 0.35 * corridorLen, corridorMin + 0.65 * corridorLen);

    const outAmp = corridorLen * 0.32;
    const inAmp = corridorLen * 0.22;

    push();
    translate(width / 2, height / 2);
    rotate(frameCount * 0.08);
    noFill();
    const step = quality.bands > 0 ? floor(1024 / quality.bands) : 8;

    stroke((paletteHue + 20) % 360, 40, 96, theme === 'dark' ? 0.22 : 0.46);
    strokeWeight(1.6);
    ellipse(0, 0, ringBaseR * 2, ringBaseR * 2);

    strokeCap(ROUND);
    strokeJoin(ROUND);
    strokeWeight(2.4);
    beginShape();
    for (let i = 0; i < waveData.length; i += max(4, step)) {
        const a = map(i, 0, waveData.length, 0, 360);
        const w = waveData[i]; // -1..1

        const off = (w >= 0 ? w * outAmp : w * inAmp) * 0.95;
        const rr = ringBaseR + off;
        const hue = (paletteHue + (colorShiftSlider ? colorShiftSlider.value() : 68) * (w * 0.5 + 0.6) + i * 0.2) % 360;
        stroke(hue, 92, 96, theme === 'dark' ? 0.62 : 0.72);
        vertex(cos(a) * rr, sin(a) * rr);
    }
    endShape(CLOSE);
    pop();


    glowBuffer.push();
    glowBuffer.translate(width / 2, height / 2);
    glowBuffer.noFill();
    glowBuffer.strokeWeight(5.2);
    glowBuffer.beginShape();
    for (let i = 0; i < waveData.length; i += max(4, step)) {
        const a = map(i, 0, waveData.length, 0, 360);
        const w = waveData[i];
        const off = (w >= 0 ? w * outAmp : w * inAmp) * 0.95;
        const rr = ringBaseR + off;
        const hue = (paletteHue + (colorShiftSlider ? colorShiftSlider.value() : 68) * (w * 0.5 + 0.6) + i * 0.2) % 360;
        glowBuffer.stroke(hue, 94, 100, 0.86);
        glowBuffer.vertex(cos(a) * rr, sin(a) * rr);
    }
    glowBuffer.endShape(CLOSE);
    glowBuffer.strokeWeight(2.6);
    glowBuffer.beginShape();
    for (let i = 0; i < waveData.length; i += max(6, step)) {
        const a = map(i, 0, waveData.length, 0, 360);
        const w = waveData[i];
        const off = (w >= 0 ? w * outAmp : w * inAmp) * 0.9;
        const rr = ringBaseR + 3 + off;
        const hue = (paletteHue + 10 + (colorShiftSlider ? colorShiftSlider.value() : 68) * (0.4 + 0.6) + i * 0.15) % 360;
        glowBuffer.stroke(hue, 70, 98, 0.5);
        glowBuffer.vertex(cos(a) * rr, sin(a) * rr);
    }
    glowBuffer.endShape(CLOSE);
    glowBuffer.noStroke();
    for (let i = 0; i < waveData.length; i += max(16, step * 6)) {
        const a = map(i, 0, waveData.length, 0, 360);
        const w = waveData[i];
        const ampAbs = abs(w);
        const off = (w >= 0 ? w * outAmp : w * inAmp) * 0.9;
        const rr = ringBaseR + off;
        const x = cos(a) * rr;
        const y = sin(a) * rr;
        const hue = (paletteHue + (colorShiftSlider ? colorShiftSlider.value() : 68) + i * 0.1) % 360;
        glowBuffer.fill(hue, 94, 100, 0.7);
        glowBuffer.ellipse(x, y, 1.6 + ampAbs * 9.0, 1.6 + ampAbs * 9.0);
    }
    glowBuffer.pop();


    push();
    translate(width / 2, height / 2);
    const mids = fft.getEnergy('mid');
    const rings = max(3, floor(quality.bands / 20));
    for (let i = 0; i < rings; i++) {
        const t = i / (rings - 1);
        const radius = baseRadius * (1.4 + i * 0.5) + map(mids, 0, 255, -30, 160) * (0.08 + t * 0.12);
        const hue = (paletteHue + shiftAmt * (0.5 + t) + i * 10 + frameCount * 0.08) % 360;
        fill(hue, 86, 70, 0.10 + t * 0.04);
        ellipse(0, 0, radius * (1 + 0.06 * sin(frameCount * 0.6 + i * 40)), 
            radius * (1 + 0.06 * cos(frameCount * 0.6 + i * 40)));
        noFill();
        stroke(hue, 90, 68, 0.12);
        strokeWeight(1 + t * 1.2);
        ellipse(0, 0, radius * (1 + 0.012 * sin(frameCount * 0.8 + i * 80)), 
            radius * (1 + 0.012 * cos(frameCount * 0.8 + i * 80)));
        glowBuffer.push();
        glowBuffer.translate(width / 2, height / 2);
        glowBuffer.noFill();
        glowBuffer.stroke(hue, 94, 86, 0.22);
        glowBuffer.strokeWeight(1.6 + t * 0.8);
        glowBuffer.ellipse(0, 0, radius * (1 + 0.02 * sin(frameCount * 0.9 + i * 20)), 
            radius * (1 + 0.02 * cos(frameCount * 0.9 + i * 20)));
        glowBuffer.pop();
    }
    pop();

    
    updateAndDrawOrbiters(ringBaseR, fft.getEnergy('treble'));

    // pulse core: follow mouse slightly and pulse to bass
    updatePulseCore();
    drawPulseCore(fft.getEnergy('bass'));

    // bass blob
    push();
    translate(width / 2, height / 2);
    const bass = fft.getEnergy('bass');
    const blobPts = quality.blobPoints;
    const blobBase = baseRadius * (1 + map(bass, 0, 255, 0, 1.6));
    const hueB = (paletteHue + shiftAmt * 0.32 + frameCount * 0.05) % 360;
    fill(hueB, 94, 68, 0.9);
    beginShape();
    const blobStep = max(4, floor(blobPts / quality.blobPoints));
    for (let i = 0; i < blobPts; i += max(1, blobStep)) {
        const a = map(i, 0, blobPts, 0, 360);
        const n = noise(cos(a) * 0.0014 + frameCount * 0.0018, sin(a) * 0.0014 + frameCount * 0.0018);
        const r = blobBase * (0.5 + n * 1.25);
        curveVertex(cos(a) * r, sin(a) * r);
    }
    endShape(CLOSE);
    glowBuffer.push();
    glowBuffer.translate(width / 2, height / 2);
    glowBuffer.noStroke();
    glowBuffer.fill(hueB, 94, 86, 0.22);
    glowBuffer.ellipse(0, 0, blobBase * 1.4, blobBase * 1.4);
    glowBuffer.pop();
    pop();

    push();
    translate(width / 2, height / 2);
    const bands = quality.bands;
    const bandStep = max(1, floor(160 / bands));
    for (let i = 0; i < 160; i += bandStep) {
        const idx = floor(i * spectrum.length / 160);
        const v = spectrum[idx];
        const ang = map(i, 0, 160, 0, 360);
        const inner = baseRadius * 1.02;
        const length = map(v, 0, 255, 6, min(width, height) * 0.34);
        const hue = (paletteHue + shiftAmt * (v / 255) + i * 1.4 + frameCount * 0.06) % 360;
        stroke(hue, 92, 72, 0.95);
        strokeWeight(map(v, 0, 255, 0.6, 2.4));
        line(cos(ang) * inner, sin(ang) * inner, cos(ang) * (inner + length), 
            sin(ang) * (inner + length));
        glowBuffer.push();
        glowBuffer.translate(width / 2, height / 2);
        glowBuffer.noStroke();
        glowBuffer.fill(hue, 92, 86, map(v, 0, 255, 0.06, 0.36));
        glowBuffer.ellipse(cos(ang) * (inner + length), sin(ang) * (inner + length), 3 + v * 0.02, 3 + v * 0.02);
        glowBuffer.pop();
    }
    noStroke();
    pop();

    const highs = fft.getEnergy('treble');
    drawMicroPolygons(highs, baseRadius, shiftAmt);
    for (let i = 0; i < particles.length; i++) {
        particles[i].update(highs, baseRadius);
        particles[i].draw(shiftAmt, paletteHue);
    }

    for (let i = bursts.length - 1; i >= 0; i--) {
        bursts[i].update();
        bursts[i].draw();
        if (bursts[i].done) bursts.splice(i, 1);
    }

    // ripples
    for (let i = ripples.length - 1; i >= 0; i--) {
        ripples[i].update();
        ripples[i].draw();
        if (ripples[i].done) ripples.splice(i, 1);
    }

    // Outer central ring — make it much more visible
    const outerHue = (paletteHue + 64) % 360;
    const outerBase = baseRadius * 4.2;
    const pulsX = 10 * sin(frameCount * 0.56);
    const pulsY = 10 * cos(frameCount * 0.56);
    push();
    translate(width / 2, height / 2);
    blendMode(SCREEN);
    noFill();
    stroke(outerHue, 68, 96, 0.35);
    strokeWeight(3.2);
    ellipse(0, 0, outerBase + pulsX, outerBase + pulsY);
    pop();

    // Glow halo for the outer ring
    glowBuffer.noFill();
    glowBuffer.push();
    glowBuffer.translate(width / 2, height / 2);
    glowBuffer.stroke(outerHue, 94, 90, 0.28);
    glowBuffer.strokeWeight(8);
    glowBuffer.ellipse(0, 0, outerBase + pulsX, outerBase + pulsY);
    glowBuffer.noStroke();
    glowBuffer.fill(outerHue, 94, 86, 0.06);
    glowBuffer.ellipse(0, 0, (outerBase + pulsX) * 0.92, (outerBase + pulsY) * 0.92);
    glowBuffer.pop();

    // Even further outermost ring (near screen edge)
    const outermostHue = (paletteHue + 80) % 360;
    const dMin = min(width, height);
    const outermostBase = dMin * 0.86;
    const puls2 = 12 * sin(frameCount * 0.42);
    push();
    translate(width / 2, height / 2);
    blendMode(SCREEN);
    noFill();
    stroke(outermostHue, 60, 98, 0.24);
    strokeWeight(4.2);
    ellipse(0, 0, outermostBase + puls2, outermostBase + puls2);
    pop();
    // Glow for outermost
    glowBuffer.noFill();
    glowBuffer.push();
    glowBuffer.translate(width / 2, height / 2);
    glowBuffer.stroke(outermostHue, 94, 92, 0.22);
    glowBuffer.strokeWeight(10);
    glowBuffer.ellipse(0, 0, outermostBase + puls2, outermostBase + puls2);
    glowBuffer.noStroke();
    glowBuffer.fill(outermostHue, 94, 86, 0.05);
    glowBuffer.ellipse(0, 0, (outermostBase + puls2) * 0.95, (outermostBase + puls2) * 0.95);
    glowBuffer.pop();

    
    const allowBlur = (frameCount % 2 === 0) || (avgFPS() > (targetFPS - 4));
    if (allowBlur) {
        glowBuffer.push();
        glowBuffer.filter(BLUR, quality.glowBlur);
        glowBuffer.pop();
    }
    blendMode(ADD);
    image(glowBuffer, 0, 0, width, height);
    blendMode(BLEND);

    applyVignette();
    applyGrain();

    if (showTitle && titleTimer > 0) {
        drawTitleOverlay();
        titleTimer--;
        if (titleTimer <= 0) showTitle = false;
    }

    blendMode(BLEND);
    drawOverlayText();
    shake = max(0, shake * 0.9);
}


function updateAndDrawOrbiters(baseR, highs) {
    const boost = map(highs || 0, 0, 255, 1.0, 1.8);
    const hueBase = (paletteHue + 20) % 360;
    for (let i = 0; i < orbiters.length; i++) {
        const o = orbiters[i];
        o.a = (o.a + o.speed * boost) % 360;
        const r = baseR + 14 + o.offset;
        let x = width / 2 + cos(o.a) * r;
        let y = height / 2 + sin(o.a) * r;
        
        const dx = x - mouseX;
        const dy = y - mouseY;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < 90) {
            const pushAmt = (90 - d) * 0.08;
            x += (dx / (d || 1)) * pushAmt;
            y += (dy / (d || 1)) * pushAmt;
        }
        // draw orb
        noStroke();
        fill((hueBase + o.hueOff) % 360, 80, 96, 0.85);
        ellipse(x, y, o.size, o.size);
        
        if (avgFPS() > targetFPS - 2) {
            glowBuffer.push();
            glowBuffer.noStroke();
            glowBuffer.fill((hueBase + o.hueOff) % 360, 94, 90, 0.16);
            glowBuffer.ellipse(x * quality.glowScale, y * quality.glowScale, o.size * 3 * quality.glowScale, 
                o.size * 3 * quality.glowScale);
            glowBuffer.pop();
        }
    }
}

// ---------- Pulse Core (prominent rhythmic element) ----------
function updatePulseCore() {
    
    if (centerLocked) {
        pulseCore.target.x = width / 2;
        pulseCore.target.y = height / 2;
    } else {
        const mx = mouseX || width / 2;
        const my = mouseY || height / 2;
        pulseCore.target.x = lerp(pulseCore.target.x || width / 2, mx, 0.06);
        pulseCore.target.y = lerp(pulseCore.target.y || height / 2, my, 0.06);
    }
    // smooth velocity toward target
    let desired = p5.Vector.sub(createVector(pulseCore.target.x, pulseCore.target.y), pulseCore.pos);
    desired.mult(0.14);
    pulseCore.vel.lerp(desired, 0.12);
    pulseCore.pos.add(pulseCore.vel);
    if (centerLocked) { 
        pulseCore.pos.x = width / 2;
        pulseCore.pos.y = height / 2;
    }
}

function drawPulseCore(bassEnergy) { // bassEnergy in 0..255
    const bass = bassEnergy / 255;
    const pulseMult = 1 + map(bass, 0, 1, 0, 1.6); // big pulse effect
    const size = pulseCore.baseSize * pulseMult;

    // outer halo in glow buffer
    glowBuffer.push();
    glowBuffer.noStroke();
    const hue = (paletteHue + 12) % 360;
    glowBuffer.fill(hue, 92, 86, 0.24 * (0.6 + bass));
    glowBuffer.ellipse(pulseCore.pos.x * quality.glowScale, pulseCore.pos.y * quality.glowScale,
        size * 1.8 * quality.glowScale, size * 1.8 * quality.glowScale);
    glowBuffer.pop();

    // main orb
    push();
    translate(pulseCore.pos.x, pulseCore.pos.y);
    blendMode(ADD);
    noStroke();
    fill((hue + 10) % 360, 92, 72, 0.95);
    ellipse(0, 0, size, size); // inner core highlight
    fill((hue + 40) % 360, 90, 96, 0.12 + bass * 0.28);
    ellipse(0, 0, size * 0.6, size * 0.6); // small rotating accents
    for (let i = 0; i < 6; i++) {
        push();
        rotate(frameCount * 0.8 + i * 60);
        translate(size * 0.58, 0);
        fill((hue + i * 12) % 360, 82, 78, 0.12 + bass * 0.25);
        ellipse(0, 0, 8 + bass * 12, 8 + bass * 12);
        pop();
    }
    blendMode(BLEND);
    pop();

    // slight core-driven shake on big bass
    if (bass > 0.5) {
        shake = min(18, shake + map(bass, 0.5, 1, 1, 8));
    }
}

// ---------- Ripples ----------
class Ripple {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.t = 0;
        this.max = 90;
        this.done = false;
    }

    update() {
        this.t++;
        if (this.t > this.max) this.done = true;
    }

    draw() {
        const progress = this.t / this.max;
        const alpha = 1 - progress;
        const r = map(progress, 0, 1, 8, max(width, height) * 0.9);
        const hue = (paletteHue + 24) % 360;

        // dual ring for a richer ripple
        noFill();
        stroke(hue, 92, 78, 0.28 * alpha);
        strokeWeight(2 + (1 - progress) * 4);
        ellipse(this.x, this.y, r, r);
        stroke(hue, 92, 88, 0.16 * alpha);
        strokeWeight(1 + (1 - progress) * 3);
        ellipse(this.x, this.y, r * 0.66, r * 0.66);

        // soft glow fill in bloom buffer
        glowBuffer.push();
        glowBuffer.noStroke();
        glowBuffer.fill(hue, 94, 86, 0.08 * alpha);
        glowBuffer.ellipse(
            this.x * quality.glowScale,
            this.y * quality.glowScale,
            r * 0.9 * quality.glowScale,
            r * 0.9 * quality.glowScale
        );
        glowBuffer.noFill();
        glowBuffer.stroke(hue, 94, 84, 0.12 * alpha);
        glowBuffer.strokeWeight(2 + (1 - progress) * 6);
        glowBuffer.ellipse(
            this.x * quality.glowScale,
            this.y * quality.glowScale,
            r * quality.glowScale,
            r * quality.glowScale
        );
        glowBuffer.pop();
    }
}

// ---------- helpers & overlays (kept lightweight) ----------
function setGradientBackground(c1, c2) {
    for (let y = 0; y < height; y += 8) {
        const t = y / height;
        const col = lerpColor(c1, c2, t);
        noStroke();
        fill(col);
        rect(0, y, width, 8);
    }
}

function applyVignette() {
    push();
    noFill();
    blendMode(MULTIPLY);
    const v = (theme === 'dark') ? color(0, 0, 0, 0.36) : color(225, 10, 95, 0.12);
    fill(v);
    rect(0, 0, width, height);
    blendMode(BLEND);
    pop();
}

function applyGrain() {
    push();
    blendMode(MULTIPLY);
    tint(255, 24);
    for (let x = 0; x < width; x += grainCanvas.width) {
        for (let y = 0; y < height; y += grainCanvas.height) {
            image(grainCanvas, x, y);
        }
    }
    noTint();
    blendMode(BLEND);
    pop();
}

function drawTitleOverlay() {
    const alpha = map(titleTimer, 0, 240, 0, 1);
    push();
    translate(width / 2, height * 0.14);
    textAlign(CENTER, CENTER);
    textSize(30);
    noStroke();
    fill((paletteHue + 40) % 360, 92, 92, 0.95 * alpha);
    text(titleText, 0, -6);
    textSize(12);
    fill((paletteHue + 40) % 360, 60, 92, 0.85 * alpha);
    text(artistText, 0, 20);
    pop();
}

function drawOverlayText() {
    push();
    const w = min(380, width - 24), h = 104, x = 12, y = height - h - 12;
    if (theme === 'dark') {
        fill(210, 12, 6, 0.44);
        stroke(210, 20, 12, 0.06);
        strokeWeight(0.4);
    } else {
        fill(220, 10, 98, 0.96);
        stroke(210, 10, 90, 0.03);
        strokeWeight(0.4);
    }
    rect(x, y, w, h, 10);

    noStroke();
    if (theme === 'dark') fill(0, 0, 100, 0.98);
    else fill(210, 14, 12, 0.98);

    textSize(12);
    textAlign(LEFT, TOP);
    textWrap(WORD);
    text('Visualizer Ready', x + 12, y + 10, w - 24);

    textSize(10.5);
    const sensStr = nf(sensitivitySlider.value(), 1, 2);
    const line2 = 'FPS: ' + nf(frameRate(), 1, 1) + '  •  Part: ' + particles.length + 
        ' • Bands: ' + quality.bands + ' • Sens: ' + sensStr + ' • Theme: ' + theme;
    text(line2, x + 12, y + 44, w - 24);

    const track = titleText && titleText.length ? titleText : '—';
    const trackDisplay = track.length > 48 ? (track.substring(0, 45) + '…') : track;
    text('Track: ' + trackDisplay, x + 12, y + 62, w - 24);
    pop();
}

// ---------- particles / bursts / stars (efficient) ----------
class Particle {
    constructor(baseRFallback) {
        this.reset(baseRFallback);
        this.trail = [];
    }

    reset(baseRFallback) {
        let rBase = baseRFallback;
        if (!isFinite(rBase) || rBase === null) rBase = min(width, height) * 0.12;
        const angle = random(0, 360);
        const r = random(rBase * 1.2, rBase * 3.2);
        this.pos = createVector(width / 2 + cos(angle) * r, height / 2 + sin(angle) * r);
        this.vel = p5.Vector.fromAngle(radians(random(0, 360))).mult(random(0.2, 1.8));
        this.size = random(1.6, 6.4);
        this.life = random(80, 260);
        this.age = random(0, this.life);
        this.color = (paletteHue + random(-40, 40)) % 360;
        this.alpha = random(0.18, 0.92);
        this.trail = [];
    }

    update(highs, baseRadiusLocal) {
        const h = highs / 255;
        if (this.trail.length > 6) this.trail.shift();
        this.trail.push(this.pos.copy());
        // if dragging, apply attraction
        if (isDragging) {
            const dir = createVector(mouseX - this.pos.x, mouseY - this.pos.y);
            dir.setMag(mouseAttractStrength * 0.08);
            this.vel.lerp(dir, 0.06);
        }
        this.pos.add(p5.Vector.mult(this.vel, 0.9 + h * 3.2));
        this.age++;
        if (
            this.age > this.life ||
            dist(this.pos.x, this.pos.y, width / 2, height / 2) <
            max(8, (isFinite(baseRadiusLocal) ? baseRadiusLocal * 0.46 : min(width, height) * 0.12))
        ) {
            this.reset(baseRadiusLocal);
        }
    }

    draw(shiftAmt, baseHue) {
        for (let t = 0; t < this.trail.length; t++) {
            const p = this.trail[t];
            const a = map(t, 0, this.trail.length - 1, 0.06, this.alpha * 0.85);
            noStroke();
            fill((baseHue + this.color + shiftAmt * 0.02) % 360, 92, 78, a);
            ellipse(p.x, p.y, this.size * (0.6 + t * 0.28));
        }
        noStroke();
        fill((baseHue + this.color + shiftAmt * 0.02) % 360, 92, 78, this.alpha);
        ellipse(this.pos.x, this.pos.y, this.size, this.size);
    }
}

class Burst {
    constructor(hue, opts) {
        this.hue = hue;
        this.lite = !!(opts && opts.lite);
        this.t = 0;
        this.maxT = (this.lite ? (36 + floor(random(0, 36))) : (48 + floor(random(0, 48))));
        this.done = false;
        this.center = createVector(width / 2 + random(-36, 36), height / 2 + random(-36, 36));
        this.particles = [];
        const countMin = this.lite ? 12 : 28;
        const countMax = this.lite ? 24 : 56;
        const count = floor(random(countMin, countMax));
        for (let i = 0; i < count; i++) {
            const a = random(0, 360);
            const r = random(8, 200);
            const p = {
                pos: createVector(this.center.x + cos(a) * r * 0.06, this.center.y + sin(a) * r * 0.06),
                vel: p5.Vector.fromAngle(radians(a)).mult(random(1.8, 6.6)),
                size: random(3, 8),
                hue: (this.hue + random(-18, 18)) % 360
            };
            this.particles.push(p);
        }
    }

    update() {
        this.t++;
        if (this.t > this.maxT) this.done = true;
        for (let p of this.particles) {
            p.pos.add(p.vel);
            p.vel.mult(0.94);
        }
    }

    draw() {
        blendMode(ADD);
        for (let idx = 0; idx < this.particles.length; idx++) {
            const p = this.particles[idx];
            fill(p.hue, 92, 78, 0.8 * (1 - (idx / this.particles.length)));
            noStroke();
            ellipse(p.pos.x, p.pos.y, p.size * (1 + noise(p.pos.x * 0.001 + frameCount * 0.02)));
            if (!this.lite || (idx % 3 === 0)) {
                glowBuffer.push();
                glowBuffer.noStroke();
                glowBuffer.fill(p.hue, 92, 86, 0.18);
                glowBuffer.ellipse(p.pos.x * quality.glowScale, p.pos.y * quality.glowScale, 
                    p.size * 2.0 * quality.glowScale, p.size * 2.0 * quality.glowScale);
                glowBuffer.pop();
            }
        }
        blendMode(BLEND);
    }
}

class Star {
    constructor() {
        this.reset();
    }

    reset() {
        this.x = random(0, width);
        this.y = random(0, height);
        this.z = random(0.6, 1.6); // depth for parallax and brightness
        this.size = random(0.6, 2.2) / this.z;
        this.tw = random(0.008, 0.02) * this.z;
        this.h = random(200, 320);
        this.baseAlpha = random(0.04, 0.22) / this.z;
    }

    draw(level) {
        const twinkle = 0.6 + 0.4 * sin(frameCount * this.tw * 60);
        const audioBoost = map(level, 0, 0.5, 0.0, 0.8);
        const a = constrain(this.baseAlpha * (twinkle + audioBoost), 0, 1);
        noStroke();
        fill(this.h, 40, 92, a);
        const cx = width / 2;
        const cy = height / 2;
        const parallax = 6 / this.z;
        const px = this.x + (this.x - cx) * 0.002 + sin(frameCount * this.tw) * parallax;
        const py = this.y + (this.y - cy) * 0.002 + cos(frameCount * this.tw * 1.1) * parallax;
        ellipse(px, py, this.size, this.size);
    }
}

function drawMicroPolygons(highs, baseR, shiftAmt) {
    const count = quality.microCount;
    push();
    translate(width / 2, height / 2);
    for (let i = 0; i < count; i++) {
        push();
        const a = frameCount * (0.5 + i * 0.02) + i * 30;
        rotate(a);
        const r = baseR * (1.15 + i * 0.7) + map(highs, 0, 255, -40, 200) * (0.03 + i * 0.01);
        const sides = 3 + (i % 5);
        const sz = 4 + i * 1.6 + map(highs, 0, 255, 0, 8);
        const hue = (paletteHue + shiftAmt * (i * 5 + 20) + frameCount * 0.02) % 360;
        fill(hue, 82, 72, 0.06 + i * 0.012);
        noStroke();
        polygon(0, r, sz + i * 1.2, sides);
        pop();
    }
    pop();
}

function polygon(cx, cy, radius, npoints) {
    push();
    translate(cx, cy);
    beginShape();
    for (let a = 0; a < 360; a += 360 / npoints) {
        const sx = cos(a) * radius;
        const sy = sin(a) * radius;
        vertex(sx, sy);
    }
    endShape(CLOSE);
    pop();
}

function keyPressed() {
    if (key === ' ') {
        togglePlay();
    } else if (key === 'F' || key === 'f') {
        const fs = fullscreen();
        fullscreen(!fs);
    } else if (key === 'E' || key === 'e') {
        const lite = avgFPS() < (targetFPS - 4) || bursts.length >= MAX_BURSTS;
        if (bursts.length < MAX_BURSTS) bursts.push(new Burst((paletteHue + random(-30, 30)) % 360, {lite}));
    }
}

function mousePressed() {
    // click -> burst plus ripple (optimizado)
    if (clickCooldown > 0) return;
    clickCooldown = 10; // ~10 frames
    const lite = avgFPS() < (targetFPS - 4) || bursts.length >= MAX_BURSTS;
    if (bursts.length < MAX_BURSTS) bursts.push(new Burst((paletteHue + random(-20, 20)) % 360, {lite}));
    if (ripples.length >= MAX_RIPPLES) ripples.shift();
    ripples.push(new Ripple(mouseX, mouseY));
}

function mouseDragged() {
    isDragging = true;
    lastMouse.x = mouseX;
    lastMouse.y = mouseY;
}

function mouseReleased() {
    isDragging = false;
}

function mouseWheel(event) {
    // change sensitivity with the wheel
    const delta = event.deltaY > 0 ? -0.04 : 0.04;
    sensitivitySlider.value(
        constrain(sensitivitySlider.value() + delta, 0.2, 3.0)
    );
}

function windowResized() {
    resizeCanvas(windowWidth, windowHeight);
    glowBuffer.resizeCanvas(
        max(1, floor(width * quality.glowScale)),
        max(1, floor(height * quality.glowScale))
    );
    grainCanvas = createGraphics(256, 256);
    grainCanvas.pixelDensity(1);
    generateGrainTexture();
    
    if (centerLocked && pulseCore && pulseCore.pos) {
        pulseCore.pos.x = width / 2;
        pulseCore.pos.y = height / 2;
    }
}

// Adaptive quality controller (same as before)
function adaptiveQualityAdjust() {
    if (fpsSamples.length < 8) return;
    const avg = fpsSamples.reduce((a, b) => a + b, 0) / fpsSamples.length;

    if (avg < targetFPS - 10) {
        quality.particles = max(40, floor(quality.particles * 0.78));
        quality.stars = max(20, floor(quality.stars * 0.8));
        quality.bands = max(32, floor(quality.bands * 0.8));
        quality.blobPoints = max(60, floor(quality.blobPoints * 0.85));
        quality.microCount = max(4, floor(quality.microCount * 0.85));
        quality.glowBlur = max(2, floor(quality.glowBlur * 0.9));

        if (particles.length > quality.particles) particles.splice(quality.particles);
        if (stars.length > quality.stars) stars.splice(quality.stars);

        quality.glowScale = max(0.3, quality.glowScale * 0.9);
        glowBuffer.resizeCanvas(
            max(1, floor(width * quality.glowScale)),
            max(1, floor(height * quality.glowScale))
        );
    } else if (avg > targetFPS + 8) {
        quality.particles = min(500, floor(quality.particles * 1.06));
        quality.stars = min(300, floor(quality.stars * 1.05));
        quality.bands = min(220, floor(quality.bands * 1.04));
        quality.blobPoints = min(300, floor(quality.blobPoints * 1.03));
        quality.microCount = min(18, floor(quality.microCount * 1.03));
        quality.glowBlur = min(6, floor(quality.glowBlur * 1.05));
        quality.glowScale = min(0.8, quality.glowScale * 1.03);

        while (particles.length < quality.particles) particles.push(new Particle(baseRadius));
        while (stars.length < quality.stars) stars.push(new Star());

        glowBuffer.resizeCanvas(
            max(1, floor(width * quality.glowScale)),
            max(1, floor(height * quality.glowScale))
        );
    }
}