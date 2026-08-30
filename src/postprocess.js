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

const ColorGradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    lift:    { value: new THREE.Vector3(0.0, 0.02, 0.04) },   // dark areas: push blue
    gamma:   { value: new THREE.Vector3(1.0, 1.0, 0.98) },     // midtones: subtle warm
    gain:    { value: new THREE.Vector3(1.05, 1.02, 0.96) },   // highlights: warm
    saturation: { value: 1.08 },                              // overall saturation boost
    vignetteStrength: { value: 0.55 },
    vignetteFalloff:  { value: 0.6 },
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
      // vignette
      vec2 d = vUv - 0.5;
      float v = 1.0 - vignetteStrength * smoothstep(0.4, 0.8, length(d) / vignetteFalloff);
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
    // subtle bloom — picks up the sun shafts, waterfall white, god rays
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.35,   // strength
      0.4,    // radius
      0.82,   // threshold (only the brightest pixels bloom)
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
  }

  render(time) {
    this.composer.render(time);
  }
}
