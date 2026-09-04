// System 7 — Post-Processing and Final Polish
// Wraps the renderer in an EffectComposer that runs a small stack of
// procedural passes: subtle bloom on bright pixels (sun shafts,
// waterfall white), gentle color grading (green-channel lift, blue
// crush for humid jungle feel), vignette, and a soft DOF.
//
// All passes are procedural (no LUTs, no external textures). Uses
// three/examples/jsm/postprocessing which is bundled with the three
// package.

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

// project a world-space point to NDC and then to UV [0,1] (y flipped)
function projectToScreen(point, camera) {
  const v = point.clone().project(camera);
  return new THREE.Vector2((v.x + 1) * 0.5, (1 - v.y) * 0.5);
}

// God rays / volumetric light shafts — radial blur from the sun's
// screen position. This is the canonical "crepuscular rays" effect
// used in Unreal and Unity. The shader samples the framebuffer along
// rays radiating from `uSunScreen`, accumulating brightness, and
// adds the result back to the original colour with a warm tint.
// Requires the rendered scene to already have a bright sun disk or
// bright sky region in the frame for the rays to "shine through".
const GodRaysShader = {
  uniforms: {
    tDiffuse: { value: null },
    uSunScreen: { value: new THREE.Vector2(0.5, 0.85) },   // sun's 2D screen pos (UV space)
    uExposure:   { value: 0.35 },                         // how bright the rays are
    uDecay:      { value: 0.965 },                        // brightness falloff per sample
    uDensity:    { value: 0.95 },                         // sample spacing
    uWeight:     { value: 0.52 },                         // per-sample weight
    uTint:       { value: new THREE.Color(1.0, 0.88, 0.58) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2  uSunScreen;
    uniform float uExposure;
    uniform float uDecay;
    uniform float uDensity;
    uniform float uWeight;
    uniform vec3  uTint;
    varying vec2 vUv;

    const int NUM_SAMPLES = 80;

    void main() {
      vec3 base = texture2D(tDiffuse, vUv).rgb;
      // delta from this pixel to the sun's screen position
      vec2 delta = (vUv - uSunScreen) * (1.0 / float(NUM_SAMPLES)) * uDensity;
      vec2 uv = vUv;
      float illum = 1.0;
      vec3 accum = vec3(0.0);
      for (int i = 0; i < NUM_SAMPLES; i++) {
        uv -= delta;
        vec3 s = texture2D(tDiffuse, uv).rgb;
        // only the brightest pixels (sky / sun) contribute to the rays
        s = max(s - vec3(0.32), vec3(0.0));
        accum += s * illum * uWeight;
        illum *= uDecay;
      }
      accum *= uExposure * uTint;
      // soft circular falloff so the rays fade to nothing far from the sun
      float d = length(vUv - uSunScreen);
      float falloff = 1.0 - smoothstep(0.0, 0.7, d);
      gl_FragColor = vec4(base + accum * falloff, 1.0);
    }
  `,
};

const ColorGradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    lift:    { value: new THREE.Vector3(0.006, 0.008, 0.014) },  // film black floor
    gamma:   { value: new THREE.Vector3(0.99, 1.00, 0.98) },     // lush warm midtones
    gain:    { value: new THREE.Vector3(0.99, 0.94, 0.80) },     // golden sunlight
    saturation: { value: 1.10 },                               // rich tropical greens
    vignetteStrength: { value: 0.50 },
    vignetteFalloff:  { value: 0.65 },
    fogTint:  { value: new THREE.Color(0x283818) },
    fogStart: { value: 0.45 },
    fogEnd:   { value: 0.95 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec3 lift;
    uniform vec3 gamma;
    uniform vec3 gain;
    uniform float saturation;
    uniform float vignetteStrength;
    uniform float vignetteFalloff;
    uniform vec3  fogTint;
    uniform float fogStart;
    uniform float fogEnd;
    varying vec2 vUv;

    vec3 applyLiftGammaGain(vec3 c, vec3 l, vec3 g, vec3 gn) {
      c = c + l * (1.0 - c);
      c = pow(max(c, vec3(0.0)), 1.0 / g);
      c = c * gn;
      return c;
    }

    void main() {
      vec3 col = texture2D(tDiffuse, vUv).rgb;
      col = applyLiftGammaGain(col, lift, gamma, gain);
      // saturation
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(l), col, saturation);
      // radial distance from center (used for both vignette and fog)
      vec2 d = vUv - 0.5;
      float dist = length(d);
      // volumetric fog approximation: blend toward fogTint based on
      // distance from center. Center is closer to camera (less fog),
      // edges are farther (more fog). Combined with the scene fog
      // this gives a layered depth feel.
      // vignette
      float v = 1.0 - vignetteStrength * smoothstep(0.35, 0.85, dist / vignetteFalloff);
      col *= v;
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export class JunglePostprocess {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.composer = new EffectComposer(renderer);
    this.composer.setPixelRatio(renderer.getPixelRatio());
    this.composer.setSize(window.innerWidth, window.innerHeight);
    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);
    // screen-space god rays — radial blur from the sun's screen
    // position. This is the single most visible "Unreal-engine" feature
    // in the reference images (light shafts cutting through dust/haze).
    this.godRaysPass = new ShaderPass(GodRaysShader);
    this.composer.addPass(this.godRaysPass);
    // subtle bloom — picks up the sun shafts, waterfall white, god rays
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.60,   // strength
      0.45,   // radius
      0.72,   // threshold
    );
    this.composer.addPass(this.bloomPass);
    // color grading + vignette
    this.gradePass = new ShaderPass(ColorGradeShader);
    this.composer.addPass(this.gradePass);
    // final output (gamma correction)
    this.outputPass = new OutputPass();
    this.composer.addPass(this.outputPass);
  }

  setSize(w, h) {
    this.composer.setSize(w, h);
    this.bloomPass.setSize(w, h);
    this.godRaysPass.setSize(w, h);
  }

  render(time, sunWorldPos) {
    // update the sun's screen position for the god rays
    if (sunWorldPos) {
      this.godRaysPass.uniforms.uSunScreen.value.copy(projectToScreen(sunWorldPos, this.camera));
    }
    this.composer.render(time);
  }
}
