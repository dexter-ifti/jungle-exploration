// System 6 — Procedural Sound Design
// All audio is procedurally generated at runtime. No external
// audio files. Uses Web Audio API via THREE.Audio where possible
// and raw AudioContext for procedural sources.
//
// Layers (all looping, spatialised by distance to the player):
//   * wind: filtered noise, low-frequency LFO on filter cutoff
//   * leaves: high-passed noise, gentle burst envelope
//   * insects: high-frequency tone clusters
//   * distant birds: FM tones with vibrato, occasional chirp
//   * nearby birds: louder FM tones, closer in stereo
//   * distant water: filtered noise, low frequency (becomes louder
//     as the player approaches the falls)
//   * waterfall roar: low-frequency noise, becomes loud near falls
//   * splash: short noise bursts, very localised
//
// Position-aware: the waterfalls/birds get louder as the player
// approaches them. We sample the player t-value each frame.

import * as THREE from 'three';
import { TRAIL, terrainHeight, WORLD } from './world.js';

export class JungleSound {
  constructor(camera) {
    this.camera = camera;
    this.ctx = null;
    this.master = null;
    this.layers = {};
    this.started = false;
    this.enabled = false;
    // try to start audio context on first user gesture; browsers
    // require this. We'll attempt to start now and rely on the
    // gesture fallback below.
    this._tryInit();
  }

  _tryInit() {
    if (this.ctx) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.6;
      this.master.connect(this.ctx.destination);
    } catch (e) {
      console.warn('AudioContext init failed:', e);
    }
  }

  // start all ambient layers. Idempotent.
  start() {
    if (!this.ctx || this.started) return;
    this.enabled = true;
    this.started = true;
    this._startWind();
    this._startInsects();
    this._startDistantBirds();
    this._startNearbyBirds();
    this._startDistantWater();
    this._startWaterfallRoar();
    this._startLeaves();
    this._startSplash();
  }

  // ---------- wind: filtered white noise with LFO on cutoff ----------
  _startWind() {
    const bufferSize = 2 * this.ctx.sampleRate;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 400;
    filter.Q.value = 1.0;
    // LFO modulating the filter cutoff
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.13;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 200;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    const gain = this.ctx.createGain();
    gain.gain.value = 0.0;  // ramped up in start
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start();
    lfo.start();
    gain.gain.linearRampToValueAtTime(0.12, this.ctx.currentTime + 4);
    this.layers.wind = { gain, filter, lfo };
  }

  // ---------- insects: high-frequency tone clusters ----------
  _startInsects() {
    // Multiple small oscillators with random frequencies, all going
    // through a band-pass filter, modulated by an LFO.
    const out = this.ctx.createGain();
    out.gain.value = 0.0;
    out.connect(this.master);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 6500;
    filter.Q.value = 8;
    out.disconnect();
    out.connect(filter);
    filter.connect(this.master);
    const oscs = [];
    for (let i = 0; i < 5; i++) {
      const o = this.ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = 5000 + Math.random() * 4000;
      const g = this.ctx.createGain();
      g.gain.value = 0.0;
      // chirp envelope: on/off every 0.2-0.6s
      const toggle = () => {
        g.gain.cancelScheduledValues(this.ctx.currentTime);
        g.gain.setValueAtTime(0, this.ctx.currentTime);
        g.gain.linearRampToValueAtTime(0.05 + Math.random() * 0.04, this.ctx.currentTime + 0.02);
        g.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.06 + Math.random() * 0.15);
        setTimeout(toggle, 200 + Math.random() * 500);
      };
      o.connect(g);
      g.connect(out);
      o.start();
      toggle();
      oscs.push(o);
    }
    out.gain.linearRampToValueAtTime(0.18, this.ctx.currentTime + 6);
    this.layers.insects = { out, oscs };
  }

  // ---------- distant birds: FM tones, periodic chirps ----------
  _startDistantBirds() {
    const out = this.ctx.createGain();
    out.gain.value = 0.0;
    out.connect(this.master);
    // 4 birds
    for (let i = 0; i < 4; i++) {
      const o = this.ctx.createOscillator();
      const mod = this.ctx.createOscillator();
      const modGain = this.ctx.createGain();
      const g = this.ctx.createGain();
      g.gain.value = 0;
      const baseFreq = 1500 + Math.random() * 1500;
      o.frequency.value = baseFreq;
      o.type = 'sine';
      mod.frequency.value = 4 + Math.random() * 5;
      modGain.gain.value = 80;
      mod.connect(modGain);
      modGain.connect(o.frequency);
      o.connect(g);
      g.connect(out);
      o.start();
      mod.start();
      // chirp envelope
      const chirp = () => {
        g.gain.cancelScheduledValues(this.ctx.currentTime);
        g.gain.setValueAtTime(0, this.ctx.currentTime);
        g.gain.linearRampToValueAtTime(0.05, this.ctx.currentTime + 0.02);
        g.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.12 + Math.random() * 0.3);
        // sweep the main oscillator frequency for natural chirp
        const target = baseFreq * (0.85 + Math.random() * 0.3);
        o.frequency.cancelScheduledValues(this.ctx.currentTime);
        o.frequency.setValueAtTime(o.frequency.value, this.ctx.currentTime);
        o.frequency.linearRampToValueAtTime(target, this.ctx.currentTime + 0.3);
        setTimeout(chirp, 2000 + Math.random() * 4000);
      };
      setTimeout(chirp, Math.random() * 3000);
    }
    out.gain.linearRampToValueAtTime(0.10, this.ctx.currentTime + 8);
    this.layers.distantBirds = out;
  }

  // ---------- nearby birds: louder, more frequent ----------
  _startNearbyBirds() {
    const out = this.ctx.createGain();
    out.gain.value = 0.0;
    out.connect(this.master);
    for (let i = 0; i < 3; i++) {
      const o = this.ctx.createOscillator();
      const mod = this.ctx.createOscillator();
      const modGain = this.ctx.createGain();
      const g = this.ctx.createGain();
      g.gain.value = 0;
      const baseFreq = 1800 + Math.random() * 1200;
      o.frequency.value = baseFreq;
      o.type = 'triangle';
      mod.frequency.value = 6 + Math.random() * 4;
      modGain.gain.value = 120;
      mod.connect(modGain);
      modGain.connect(o.frequency);
      o.connect(g);
      g.connect(out);
      o.start();
      mod.start();
      const chirp = () => {
        g.gain.cancelScheduledValues(this.ctx.currentTime);
        g.gain.setValueAtTime(0, this.ctx.currentTime);
        g.gain.linearRampToValueAtTime(0.12, this.ctx.currentTime + 0.015);
        g.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.18 + Math.random() * 0.2);
        const target = baseFreq * (0.7 + Math.random() * 0.5);
        o.frequency.cancelScheduledValues(this.ctx.currentTime);
        o.frequency.setValueAtTime(o.frequency.value, this.ctx.currentTime);
        o.frequency.linearRampToValueAtTime(target, this.ctx.currentTime + 0.25);
        setTimeout(chirp, 1200 + Math.random() * 2500);
      };
      setTimeout(chirp, 500 + Math.random() * 1500);
    }
    out.gain.linearRampToValueAtTime(0.13, this.ctx.currentTime + 8);
    this.layers.nearbyBirds = out;
  }

  // ---------- distant water: filtered noise, lower freq than wind ----------
  _startDistantWater() {
    const bufferSize = 2 * this.ctx.sampleRate;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 800;
    filter.Q.value = 0.7;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.0;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start();
    this.layers.distantWater = { gain, filter };
  }

  // ---------- waterfall roar: low frequency, controlled by distance ----------
  _startWaterfallRoar() {
    const bufferSize = 2 * this.ctx.sampleRate;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    // pink-ish noise
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      const pink = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
      data[i] = pink;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 600;
    filter.Q.value = 1.0;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.0;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start();
    this.layers.waterfall = { gain, filter };
  }

  // ---------- leaves: gentle high-frequency bursts ----------
  _startLeaves() {
    const bufferSize = 0.5 * this.ctx.sampleRate;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 3000;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.0;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start();
    // LFO: slow modulation of the gain to simulate wind gusts
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.18;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 0.04;
    lfo.connect(lfoGain);
    lfoGain.connect(gain.gain);
    lfo.start();
    gain.gain.linearRampToValueAtTime(0.04, this.ctx.currentTime + 5);
    this.layers.leaves = { gain, lfo, lfoGain };
  }

  // ---------- splash: short noise bursts ----------
  _startSplash() {
    const bufferSize = 0.2 * this.ctx.sampleRate;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.2));
    const gain = this.ctx.createGain();
    gain.gain.value = 0.0;
    gain.connect(this.master);
    this.layers.splash = { buffer, gain, lastBurst: 0 };
    // schedule periodic bursts
    const burst = () => {
      const t = this.ctx.currentTime;
      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      const g = this.ctx.createGain();
      g.gain.value = 0.15;
      src.connect(g);
      g.connect(gain);
      src.start(t);
      src.stop(t + 0.2);
      setTimeout(burst, 50 + Math.random() * 200);
    };
    setTimeout(burst, 1000);
  }

  // ---------- per-frame update ----------
  // playerT: trail progress 0..1
  // dt: delta time
  update(playerT, dt) {
    if (!this.ctx || !this.enabled) return;
    // distance to the falls (waterfallZ is the cliff face)
    const playerPos = this.camera.position;
    const fallsX = 0;
    const fallsZ = WORLD.waterfallZ + 5;
    const dx = playerPos.x - fallsX;
    const dz = playerPos.z - fallsZ;
    const dist = Math.hypot(dx, dz);
    // distance to nearest bird cluster (around the trail)
    const birdPos = TRAIL.getPoint(Math.min(0.95, Math.max(0.05, playerT + 0.05)));
    const birdDx = playerPos.x - birdPos.x;
    const birdDz = playerPos.z - birdPos.z;
    const birdDist = Math.hypot(birdDx, birdDz);

    // adjust layer volumes based on distance
    if (this.layers.waterfall) {
      // louder as player gets closer
      const vol = Math.max(0, Math.min(0.45, 0.6 - dist * 0.012));
      this.layers.waterfall.gain.gain.linearRampToValueAtTime(vol, this.ctx.currentTime + 0.5);
    }
    if (this.layers.distantWater) {
      const vol = Math.max(0, Math.min(0.15, 0.25 - dist * 0.004));
      this.layers.distantWater.gain.gain.linearRampToValueAtTime(vol, this.ctx.currentTime + 0.5);
    }
    if (this.layers.splash) {
      // splash only audible near falls
      const vol = Math.max(0, 0.25 - dist * 0.008);
      this.layers.splash.gain.gain.linearRampToValueAtTime(vol, this.ctx.currentTime + 0.5);
    }
    if (this.layers.distantBirds) {
      // get louder as player moves deeper into the jungle
      const vol = Math.max(0, 0.04 + playerT * 0.08);
      this.layers.distantBirds.gain.linearRampToValueAtTime(vol, this.ctx.currentTime + 0.5);
    }
    if (this.layers.nearbyBirds) {
      const vol = Math.max(0, 0.08 - birdDist * 0.004);
      this.layers.nearbyBirds.gain.linearRampToValueAtTime(vol, this.ctx.currentTime + 0.5);
    }
  }
}
