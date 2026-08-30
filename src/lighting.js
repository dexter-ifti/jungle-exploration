// System 3 — Lighting and Atmosphere
// Replaces the placeholder System 1 lighting with proper jungle lighting:
//   * Warm directional sun with high shadow map
//   * Cool blue sky hemisphere
//   * Bounce / fill light from the canopy (greenish tint)
//   * Procedural god-ray billboards cutting through the canopy
//   * Airborne particles (pollen / dust motes) catching the light
//   * Thicker, more colored atmospheric fog
//   * Under-canopy dappled light variation
//
// All procedural. No external HDRs, no external textures.

import * as THREE from 'three';
import { TRAIL, terrainHeight, WORLD } from './world.js';

// shared deterministic noise (same instance as world)
import { makeNoise } from './world.js';
const N = makeNoise(424242);

// ---------- god-ray billboard: a soft additive streak ----------
// A long thin quad with a procedural gradient texture, used in groups
// to fake light beams cutting through the canopy.
function makeGodRayTexture() {
  const W = 64, H = 256;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    const vy = y / H;
    // falloff at the top (sky), bright in the middle, soft at the bottom (ground)
    let v;
    if (vy < 0.1) v = vy / 0.1;
    else if (vy < 0.7) v = 1.0;
    else v = (1 - vy) / 0.3;
    v = Math.max(0, Math.min(1, v)) * 0.55;   // overall softness
    for (let x = 0; x < W; x++) {
      const vx = x / W;
      // soft horizontal falloff
      let h = 1 - Math.abs(vx - 0.5) * 2;
      h = Math.max(0, h);
      const a = v * h * h * 255;
      const i = (y * W + x) * 4;
      img.data[i]     = 255;
      img.data[i + 1] = 244;
      img.data[i + 2] = 220;
      img.data[i + 3] = a;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const GODRAY_TEX = makeGodRayTexture();

// ---------- god-ray scene object ----------
// Holds all the light-shafts and a particle system. Replaces the
// placeholder lights in world.js.
export class JungleLighting {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.time = 0;

    // ----- sky dome (gradient, slightly hazy) -----
    const skyGeo = new THREE.SphereGeometry(800, 24, 16);
    const skyCv = document.createElement('canvas'); skyCv.width = 4; skyCv.height = 256;
    const sctx = skyCv.getContext('2d');
    const grad = sctx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#a8c8d8');        // upper sky (cool blue)
    grad.addColorStop(0.45, '#c2d6c4');     // mid sky (pale green-white)
    grad.addColorStop(1, '#b6c4a8');        // horizon haze
    sctx.fillStyle = grad; sctx.fillRect(0, 0, 4, 256);
    const skyTex = new THREE.CanvasTexture(skyCv);
    skyTex.colorSpace = THREE.SRGBColorSpace;
    const sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false }));
    this.group.add(sky);
    this.sky = sky;

    // ----- sun (directional) -----
    // Sun positioned forward-left-above so the camera (facing -z down
    // the trail) sees the sun disk ahead of it. The radial god-rays
    // pass needs the sun to be in front of the camera for the rays
    // to read as light shafts. The sun casts warm light onto the
    // forward-facing sides of the canopies.
    const sun = new THREE.DirectionalLight(0xfff0d0, 3.2);
    sun.position.set(-80, 130, -200);  // forward (z=-200) and above+left
    sun.target.position.set(0, 0, -260);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -200;
    sun.shadow.camera.right = 200;
    sun.shadow.camera.top = 200;
    sun.shadow.camera.bottom = -200;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 500;
    sun.shadow.bias = -0.0002;
    sun.shadow.normalBias = 0.06;
    sun.shadow.radius = 5;
    this.sun = sun;
    this.group.add(sun);
    this.group.add(sun.target);

    // ----- sun disk (small bright sphere at the sun's position) -----
    // The sky gradient alone doesn't give the radial god-rays pass
    // anything bright to "shine through". Add a small intense white
    // sphere at the sun's position so the screen-space rays have a
    // real source. frustumCulled = false because the sphere is at
    // ~300m and the bounding sphere is small relative to the camera.
    const sunDisk = new THREE.Mesh(
      new THREE.SphereGeometry(15, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xfff8e0, fog: false }),
    );
    sunDisk.position.copy(sun.position).multiplyScalar(1.6);
    sunDisk.frustumCulled = false;
    this.group.add(sunDisk);
    this.sunDisk = sunDisk;

    // ----- hemisphere (cool sky + warm ground bounce) -----
    const hemi = new THREE.HemisphereLight(0xbedfe4, 0x4a3e26, 1.6);
    this.hemi = hemi;
    this.group.add(hemi);

    // ----- canopy green fill -----
    // A dim green directional light from above-ish, simulating light
    // bouncing off the upper canopy into the lower scene.
    const canopyFill = new THREE.DirectionalLight(0x6a8a4a, 0.9);
    canopyFill.position.set(-30, 60, -20);
    this.canopyFill = canopyFill;
    this.group.add(canopyFill);

    // ----- secondary warm fill from the front-right (side bounce) -----
    const sideFill = new THREE.DirectionalLight(0xfff0c0, 0.4);
    sideFill.position.set(60, 50, 40);
    this.group.add(sideFill);

    // ----- under-canopy ambient point lights along the trail -----
    // Very dim point lights that follow the trail, creating the dappled
    // "light pools" effect under canopy gaps.
    this.dapples = [];
    for (let i = 0; i < 14; i++) {
      const t = (i + 0.5) / 14;
      const p = TRAIL.getPoint(t);
      const dapple = new THREE.PointLight(0xfff0c0, 0.18, 12, 1.4);
      dapple.position.set(p.x + (N.noise2(t * 13, 7) - 0.5) * 3, terrainHeight(p.x, p.z) + 2.5, p.z + (N.noise2(t * 7, 19) - 0.5) * 3);
      this.dapples.push(dapple);
      this.group.add(dapple);
    }

    // ----- thicker, greener atmospheric fog -----
    scene.fog = new THREE.FogExp2(0xc6d3b0, 0.011);
    // bump exposure slightly to compensate
    if (scene.userData.renderer) {
      scene.userData.renderer.toneMappingExposure = 0.95;
    }

    // ----- god ray billboards -----
    this.godRays = this._buildGodRays();
    for (const g of this.godRays) this.group.add(g);

    // ----- particles (pollen / dust motes) -----
    this.particles = this._buildParticles();
    this.group.add(this.particles);
  }

  _buildGodRays() {
    // Place 8-14 god rays across the canopy area, oriented roughly
    // toward the sun direction.
    const sunDir = new THREE.Vector3().subVectors(this.sun.target.position, this.sun.position).normalize();
    const rays = [];
    const N_RAYS = 10;
    for (let i = 0; i < N_RAYS; i++) {
      // ray position scattered around the trail
      const t = (i + 0.5) / N_RAYS;
      const p = TRAIL.getPoint(t);
      const offX = (N.noise2(t * 17, 3) - 0.5) * 8;
      const offZ = (N.noise2(t * 11, 7) - 0.5) * 8;
      // ray is a tall thin quad
      const w = 0.8 + N.noise2(t * 5, 1) * 1.2;
      const h = 8 + N.noise2(t * 3, 2) * 6;
      const geo = new THREE.PlaneGeometry(w, h, 1, 1);
      const mat = new THREE.MeshBasicMaterial({
        map: GODRAY_TEX,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: true,
        color: 0xfff2c8,
        side: THREE.DoubleSide,
        fog: true,
        opacity: 0.35 + N.noise2(t * 9, 13) * 0.25,
      });
      const m = new THREE.Mesh(geo, mat);
      m.position.set(p.x + offX, terrainHeight(p.x, p.z) + h * 0.5, p.z + offZ);
      // orient so the ray points along sunDir
      const yAxis = new THREE.Vector3(0, 1, 0);
      const q = new THREE.Quaternion().setFromUnitVectors(yAxis, sunDir.clone().multiplyScalar(-1));
      m.quaternion.copy(q);
      // add some per-ray variation
      m.userData.basePos = m.position.clone();
      m.userData.phase = N.noise2(t * 31, 19) * Math.PI * 2;
      rays.push(m);
    }
    return rays;
  }

  _buildParticles() {
    // 600 small bright motes scattered around the canopy area,
    // each with a slight drift. They twinkle on/off over time.
    const N_PARTICLES = 400;
    const positions = new Float32Array(N_PARTICLES * 3);
    const seeds = new Float32Array(N_PARTICLES);
    for (let i = 0; i < N_PARTICLES; i++) {
      // scatter within the world but biased toward the trail
      const t = Math.max(0.01, Math.min(0.99, N.noise2(i * 0.13, 1) * 0.45 + 0.5));
      const p = TRAIL.getPoint(t);
      const offX = (N.noise2(i * 0.31, 7) - 0.5) * 30;
      const offZ = (N.noise2(i * 0.41, 13) - 0.5) * 30;
      const y = terrainHeight(p.x + offX, p.z + offZ) + 0.5 + N.noise2(i * 0.7, 17) * 6;
      positions[i * 3]     = p.x + offX;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = p.z + offZ;
      seeds[i] = N.noise2(i * 0.5, 23) * Math.PI * 2;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('seed', new THREE.BufferAttribute(seeds, 1));
    // tiny billboard material
    const mat = new THREE.PointsMaterial({
      color: 0xfff4d0,
      size: 0.12,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: true,
    });
    return new THREE.Points(geo, mat);
  }

  // call from animate loop
  update(time, dt) {
    this.time = time;
    // gently sway god rays
    for (const g of this.godRays) {
      const base = g.userData.basePos;
      const phase = g.userData.phase;
      g.position.x = base.x + Math.sin(time * 0.4 + phase) * 0.2;
      g.position.z = base.z + Math.cos(time * 0.3 + phase) * 0.2;
    }
    // particles drift down + sideways
    const pos = this.particles.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const seed = this.particles.geometry.attributes.seed.getX(i);
      // slow downward drift
      let ny = y - dt * (0.05 + 0.05 * Math.sin(seed + time * 0.5));
      if (ny < terrainHeight(x, z) + 0.2) ny = terrainHeight(x, z) + 6.5;
      pos.setX(i, x + Math.sin(time * 0.3 + seed) * dt * 0.1);
      pos.setY(i, ny);
      pos.setZ(i, z + Math.cos(time * 0.2 + seed * 1.7) * dt * 0.1);
    }
    pos.needsUpdate = true;
    // dapple point lights: pulse intensity
    for (let i = 0; i < this.dapples.length; i++) {
      const d = this.dapples[i];
      const phase = i * 0.7;
      d.intensity = 0.18 + 0.15 * (0.5 + 0.5 * Math.sin(this.time * 0.6 + phase));
    }
  }
}
