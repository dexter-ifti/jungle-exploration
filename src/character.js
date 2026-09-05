// Procedural 3D walkable human — Jungle Explorer (high fidelity, zero external assets)
// Uses Three.js primitives + MeshStandardMaterial only. Blender MCP (blender 4.0.2+blender-mcp 1.0.1)
// is installed as an optional GLTF path, but this procedural fallback is the default so
// `npm run build` never needs Blender and stays headless-safe on SwiftShader.
//
// Anatomy (1.78m): hips @0.90m, thigh 0.42, shin 0.43, foot 0.12, torso+chest 0.62, neck 0.10, head 0.26.
// Hierarchy: group -> hips -> [pelvis, spine -> chest -> neck -> headG, thighL/R -> shin -> foot, armL/R -> elbow -> hand]
// Gait: heel-strike -> loading -> midstance -> terminal -> pre-swing/toe-off -> initial/mid/terminal swing.
// Walk 1.6 Hz has ~12% double-support each, run 2.4 Hz has ~18% flight. Hip sway, pelvic list, counter-rotations, head stabilization.
import * as THREE from 'three';

function fabricWeaveTexture(color = '#7a7050', dark = '#645d42') {
  const S = 128;
  const cv = document.createElement('canvas'); cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  const c1 = color, c2 = dark;
  ctx.fillStyle = c1; ctx.fillRect(0,0,S,S);
  // subtle weave lines
  ctx.strokeStyle = c2; ctx.globalAlpha = 0.18; ctx.lineWidth = 1;
  for(let i=0;i<S;i+=4){ ctx.beginPath(); ctx.moveTo(i,0); ctx.lineTo(i,S); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0,i); ctx.lineTo(S,i); ctx.stroke(); }
  // noise speckle
  ctx.globalAlpha = 0.10;
  for(let i=0;i<400;i++){ const x=Math.random()*S, y=Math.random()*S; ctx.fillStyle = Math.random()<0.5? '#000':'#fff'; ctx.fillRect(x,y,1,1); }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace; tex.repeat.set(2,2);
  return tex;
}

export function placeCharacter(scene) {
  // ----- materials (roughness/SSS variation) -----
  const shirtTex = fabricWeaveTexture('#7e7152','#5d5535');
  const mats = {
    skin: new THREE.MeshStandardMaterial({ color: 0x8f6a45, roughness: 0.55, metalness: 0.0, emissive: 0x1a0f09, emissiveIntensity: 0.07 }),
    skinHead: new THREE.MeshStandardMaterial({ color: 0x9a7a5c, roughness: 0.50, emissive: 0x1e120a, emissiveIntensity: 0.06 }),
    shirt: new THREE.MeshStandardMaterial({ map: shirtTex, color: 0xffffff, roughness: 0.82, metalness: 0.0 }),
    shirtDark: new THREE.MeshStandardMaterial({ color: 0x5d5535, roughness: 0.85 }),
    shorts: new THREE.MeshStandardMaterial({ color: 0x5c4a33, roughness: 0.82 }),
    boots: new THREE.MeshStandardMaterial({ color: 0x2e2216, roughness: 0.58, metalness: 0.08 }),
    hat: new THREE.MeshStandardMaterial({ color: 0xb79a5a, roughness: 0.88 }),
    pack: new THREE.MeshStandardMaterial({ color: 0x5e4c30, roughness: 0.92 }),
    packRoll: new THREE.MeshStandardMaterial({ color: 0x6e6a52, roughness: 0.95 }),
    strap: new THREE.MeshStandardMaterial({ color: 0x33291c, roughness: 0.90 }),
    hair: new THREE.MeshStandardMaterial({ color: 0x2b1f14, roughness: 0.95 }),
    eyeWhite: new THREE.MeshStandardMaterial({ color: 0xe8e2d6, roughness: 0.3 }),
    iris: new THREE.MeshStandardMaterial({ color: 0x3a2f1a, roughness: 0.4 }),
    highlight: new THREE.MeshBasicMaterial({ color: 0xffffff }),
    belt: new THREE.MeshStandardMaterial({ color: 0x3b2a16, roughness: 0.55, metalness: 0.22 }),
  };

  const group = new THREE.Group();
  group.name = 'ExplorerGuide';
  const hips = new THREE.Group();
  hips.position.y = 0.90;
  group.add(hips);

  const addMesh = (parent, geo, mat, x=0,y=0,z=0, castShadow=true) => {
    const m=new THREE.Mesh(geo,mat); m.position.set(x,y,z); m.castShadow=castShadow; m.receiveShadow=true; parent.add(m); return m;
  };

  // ----- pelvis + lower torso -----
  const pelvis = addMesh(hips, new THREE.CylinderGeometry(0.22,0.23,0.16,14), mats.shorts, 0, -0.02, 0);
  pelvis.scale.set(1.02,1,0.86);
  const lowerTorso = addMesh(hips, new THREE.CapsuleGeometry(0.195,0.22,4,12), mats.shirt, 0, 0.18, 0);
  lowerTorso.scale.set(1.08,1,0.84);
  // shirt placket + buttons
  addMesh(hips, new THREE.BoxGeometry(0.07,0.42,0.015), mats.shirtDark, 0, 0.20, 0.185);
  for(let i=0;i<3;i++) addMesh(hips, new THREE.CylinderGeometry(0.011,0.011,0.006,8), mats.belt, 0, 0.34 - i*0.11, 0.194).rotateX(Math.PI/2);
  // belt + buckle
  const belt = addMesh(hips, new THREE.CylinderGeometry(0.225,0.232,0.042,16), mats.belt, 0, -0.01, 0);
  addMesh(hips, new THREE.BoxGeometry(0.055,0.038,0.018), mats.belt, 0, -0.01, 0.225);

  // ----- chest / spine -----
  const chest = new THREE.Group(); chest.position.set(0,0.34,0); hips.add(chest);
  const thorax = addMesh(chest, new THREE.CapsuleGeometry(0.205,0.26,4,12), mats.shirt, 0, 0.06, 0);
  thorax.scale.set(1.12,1,0.83);
  // collar
  const collarL = addMesh(chest, new THREE.BoxGeometry(0.09,0.07,0.02), mats.shirtDark, -0.07, 0.20, 0.17);
  collarL.rotation.z = 0.35; collarL.rotation.y = -0.35;
  const collarR = addMesh(chest, new THREE.BoxGeometry(0.09,0.07,0.02), mats.shirtDark, 0.07, 0.20, 0.17);
  collarR.rotation.z = -0.35; collarR.rotation.y = 0.35;
  // shoulder seams (rolled sleeves hint)
  addMesh(chest, new THREE.TorusGeometry(0.078,0.014,6,14), mats.shirtDark, -0.26, 0.12, 0).rotateX(Math.PI/2);
  addMesh(chest, new THREE.TorusGeometry(0.078,0.014,6,14), mats.shirtDark, 0.26, 0.12, 0).rotateX(Math.PI/2);
  // cargo shorts detail with pockets
  const shortsMain = addMesh(hips, new THREE.CylinderGeometry(0.235,0.24,0.30,14), mats.shorts, 0, -0.18, 0);
  shortsMain.scale.set(1,1,0.9);
  const pocketL = addMesh(hips, new THREE.BoxGeometry(0.10,0.12,0.05), mats.shorts, -0.20, -0.16, 0.16);
  const pocketR = addMesh(hips, new THREE.BoxGeometry(0.10,0.12,0.05), mats.shorts, 0.20, -0.16, 0.16);
  addMesh(pocketL, new THREE.BoxGeometry(0.08,0.015,0.01), mats.shirtDark, 0, 0.045, 0.025);
  addMesh(pocketR, new THREE.BoxGeometry(0.08,0.015,0.01), mats.shirtDark, 0, 0.045, 0.025);

  // ----- backpack (character +Z is face, so pack at -Z) -----
  const packG = new THREE.Group(); packG.position.set(0,0.28,-0.22); chest.add(packG);
  addMesh(packG, new THREE.BoxGeometry(0.34,0.40,0.18), mats.pack, 0, 0, 0);
  addMesh(packG, new THREE.BoxGeometry(0.18,0.10,0.04), mats.strap, 0, -0.12, 0.095); // front pocket
  const roll = addMesh(packG, new THREE.CylinderGeometry(0.085,0.085,0.36,10), mats.packRoll, 0, 0.24, 0);
  roll.rotation.z = Math.PI/2;
  addMesh(packG, new THREE.BoxGeometry(0.06,0.34,0.012), mats.strap, -0.12, 0, 0.10);
  addMesh(packG, new THREE.BoxGeometry(0.06,0.34,0.012), mats.strap, 0.12, 0, 0.10);
  addMesh(packG, new THREE.CapsuleGeometry(0.02,0.10,4,6), mats.shirtDark, -0.08, -0.16, -0.09);
  addMesh(packG, new THREE.CapsuleGeometry(0.02,0.10,4,6), mats.shirtDark, 0.08, -0.16, -0.09);

  // ----- neck -> head -----
  const neckG = new THREE.Group(); neckG.position.set(0,0.27,0); chest.add(neckG);
  addMesh(neckG, new THREE.CylinderGeometry(0.065,0.075,0.10,12), mats.skinHead, 0, 0.04, 0);
  const headG = new THREE.Group(); headG.position.set(0,0.11,0); neckG.add(headG);
  // cranium
  const cranium = addMesh(headG, new THREE.SphereGeometry(0.125,20,16), mats.skinHead, 0, 0.06, -0.01);
  cranium.scale.set(1.02,1.08,1.0);
  // jaw
  const jaw = addMesh(headG, new THREE.SphereGeometry(0.08,14,10), mats.skinHead, 0, -0.04, 0.04);
  jaw.scale.set(1.0,0.78,0.92);
  // ears
  addMesh(headG, new THREE.SphereGeometry(0.028,8,8), mats.skinHead, -0.125, 0.02, -0.02).scale.set(0.6,1.2,0.8);
  addMesh(headG, new THREE.SphereGeometry(0.028,8,8), mats.skinHead, 0.125, 0.02, -0.02).scale.set(0.6,1.2,0.8);
  // nose
  addMesh(headG, new THREE.CapsuleGeometry(0.022,0.055,4,8), mats.skinHead, 0, -0.01, 0.13).rotation.x = Math.PI/2*0.08;
  addMesh(headG, new THREE.SphereGeometry(0.018,8,8), mats.skinHead, 0, -0.035, 0.145).scale.set(1,0.6,1);
  // mouth line + lips
  addMesh(headG, new THREE.BoxGeometry(0.05,0.006,0.006), mats.belt, 0, -0.055, 0.115);
  // eyes: white + iris + highlight (no shadow for tiny details)
  const eyeL = new THREE.Group(); eyeL.position.set(-0.042,0.015,0.105); headG.add(eyeL);
  addMesh(eyeL, new THREE.SphereGeometry(0.022,12,10), mats.eyeWhite, 0,0,0, false).scale.set(1,0.85,0.45);
  addMesh(eyeL, new THREE.SphereGeometry(0.011,10,8), mats.iris, 0, -0.002, 0.009, false).scale.set(1,1,0.45);
  addMesh(eyeL, new THREE.SphereGeometry(0.0035,6,6), mats.highlight, 0.004, 0.004, 0.011, false);
  // eyebrow
  addMesh(eyeL, new THREE.CapsuleGeometry(0.004,0.03,4,6), mats.hair, 0, 0.016, -0.002, false).rotation.z = 0.05;
  const eyeR = eyeL.clone(); eyeR.position.x = 0.042; headG.add(eyeR);
  // hair cap (short crop)
  const hairCap = addMesh(headG, new THREE.SphereGeometry(0.128,18,14,0,Math.PI*2,0,Math.PI*0.58), mats.hair, 0, 0.07, -0.015);
  hairCap.scale.set(1.02,0.95,1.04);
  // stubble/jaw shadow via darker emissive at jaw? (use small decal)
  const stubble = addMesh(headG, new THREE.SphereGeometry(0.082,12,8,0,Math.PI*2,Math.PI*0.62,Math.PI*0.38), mats.hair, 0, -0.04, 0.045);
  stubble.scale.set(1.0,0.42,0.92); stubble.material = new THREE.MeshStandardMaterial({ color:0x3a2d1a, roughness:0.95, transparent:true, opacity:0.28});
  stubble.castShadow=false;
  // hat: brim + crown
  const hatBrim = addMesh(headG, new THREE.CylinderGeometry(0.23,0.245,0.018,20), mats.hat, 0, 0.135, 0);
  addMesh(headG, new THREE.SphereGeometry(0.126,16,12,0,Math.PI*2,0,Math.PI*0.52), mats.hat, 0, 0.135, 0);
  addMesh(headG, new THREE.CylinderGeometry(0.128,0.128,0.02,16), mats.strap, 0, 0.14, 0);

  // ----- arms (segmented) -----
  function buildArm(side){
    const shoulder = new THREE.Group(); shoulder.position.set(0.27*side, 0.14, 0); chest.add(shoulder);
    // clavicle/shoulder bulk
    addMesh(shoulder, new THREE.SphereGeometry(0.07,10,8), mats.skin, 0, -0.02, 0).scale.set(0.9,0.9,0.9);
    const upper = new THREE.Group(); shoulder.add(upper);
    addMesh(upper, new THREE.CapsuleGeometry(0.056,0.24,4,8), mats.shirt, 0, -0.14, 0);
    // elbow
    const elbow = new THREE.Group(); elbow.position.set(0,-0.27,0); upper.add(elbow);
    addMesh(elbow, new THREE.SphereGeometry(0.045,8,8), mats.skin, 0,0,0);
    addMesh(elbow, new THREE.CapsuleGeometry(0.042,0.22,4,8), mats.skin, 0, -0.12, 0);
    addMesh(elbow, new THREE.SphereGeometry(0.048,10,8), mats.skin, 0, -0.26, 0);
    if(side>0){
      const sh = addMesh(upper, new THREE.BoxGeometry(0.045,0.36,0.06), mats.strap, 0.015, -0.14, -0.095);
      sh.rotation.x = 0.12;
    }
    return { shoulder, upper, elbow };
  }
  const armL = buildArm(-1);
  const armR = buildArm(1);

  // ----- legs (thigh -> shin -> foot, true articulation) -----
  function buildLeg(side){
    const thigh = new THREE.Group(); thigh.position.set(0.12*side, -0.06, 0); hips.add(thigh);
    addMesh(thigh, new THREE.CapsuleGeometry(0.092,0.30,4,10), mats.shorts, 0, -0.14, 0);
    // knee
    const shin = new THREE.Group(); shin.position.set(0,-0.32,0); thigh.add(shin);
    addMesh(shin, new THREE.SphereGeometry(0.068,10,8), mats.skin, 0,0,0);
    addMesh(shin, new THREE.CapsuleGeometry(0.062,0.30,4,10), mats.skin, 0, -0.16, 0);
    // ankle/foot
    const footG = new THREE.Group(); footG.position.set(0,-0.33,0); shin.add(footG);
    addMesh(footG, new THREE.SphereGeometry(0.055,10,8), mats.boots, 0, -0.02, 0.04).scale.set(0.9,0.55,1.45);
    addMesh(footG, new THREE.BoxGeometry(0.11,0.06,0.20), mats.boots, 0, -0.055, 0.05);
    // boot detail: laces line
    addMesh(footG, new THREE.BoxGeometry(0.02,0.02,0.12), mats.belt, 0, -0.025, 0.08);
    return { thigh, shin, foot: footG };
  }
  const legL = buildLeg(-1);
  const legR = buildLeg(1);

  group.position.set(0,0,0); group.rotation.y=0;
  scene.add(group);

  // ----- biomechanical gait -----
  let phase = 0; // 0..2pi = one stride (L heel strike at 0, R at pi)
  let hipsYaw = group.rotation.y;
  let lastSpeed = 0;

  // helpers for realistic curves: double-support dip, knee flexion
  const smooth = (x)=> x*x*(3-2*x);
  const gait = (ph, isRun)=>{
    // thigh swing (flexion positive forward)
    // walk: ±22deg swing, run ±32deg
    const swing = isRun ? 0.56 : 0.39;
    const kneeSwing = isRun ? 1.22 : 0.95; // peak knee flexion ~70deg
    // thigh angles: L = sin(ph)*swing, R = sin(ph+pi)*swing
    // knee: flex peaks at mid-swing (~0.7pi after heel-off), ~0 at stance
    const lKnee = Math.max(0, Math.sin(ph - 0.20)) * kneeSwing + Math.max(0, Math.sin(ph))*0.12;
    const rKnee = Math.max(0, Math.sin(ph + Math.PI - 0.20)) * kneeSwing + Math.max(0, Math.sin(ph+Math.PI))*0.12;
    // ankle: dorsiflex at heel strike, plantar at toe-off, neutral mid
    const lAnkle = Math.sin(ph + 0.35)*0.28 + Math.sin(ph*2)*0.10;
    const rAnkle = Math.sin(ph + Math.PI + 0.35)*0.28 + Math.sin((ph+Math.PI)*2)*0.10;
    // for run: flight phase lifts both knees slightly, adds vertical
    return { swing, lKnee, rKnee, lAnkle, rAnkle };
  };

  const update = (time, dt, state={})=>{
    const { speed=0, isMoving=false, isRunning=false, yaw=group.rotation.y, strafeVel=0, trailVel=0 } = state;
    const moving = isMoving || speed>0.11 || Math.abs(strafeVel)>0.18 || Math.abs(trailVel)>0.00022;
    // blended yaw: forward yaw + strafe-induced crab, with lookYaw handled by caller
    let dy = yaw - hipsYaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    hipsYaw += dy * Math.min(1, dt*7.0);
    group.rotation.y = hipsYaw;

    const strafeOnly = Math.abs(strafeVel) > 0.35 && Math.abs(trailVel)*320 < 0.6;
    const sAbs = Math.abs(strafeVel);

    if(moving){
      const isRun = !!isRunning && speed > 1.9;
      const hz = isRun ? 2.40 : 1.60;
      // stride-phase advance proportional to speed to keep foot placement realistic
      // walk 1.6Hz -> 3.2 steps/s, run 2.4Hz -> 4.8 steps/s
      phase += dt * hz * Math.PI*2;
      if(phase > Math.PI*2) phase -= Math.PI*2;

      if(strafeOnly){
        // sidestep (crab) walk: abduct/adduct thighs in Z, limited forward swing
        const sidePhase = phase;
        const abduct = 0.22 + sAbs*0.03;
        const s = Math.sign(strafeVel);
        // opposite abduction creates scissor
        legL.thigh.rotation.z = s * Math.sin(sidePhase) * abduct * -1;
        legR.thigh.rotation.z = s * Math.sin(sidePhase+Math.PI) * abduct * -1;
        legL.thigh.rotation.x = Math.sin(sidePhase)*0.08;
        legR.thigh.rotation.x = Math.sin(sidePhase+Math.PI)*0.08;
        legL.shin.rotation.x = 0.18 + Math.max(0, Math.sin(sidePhase+0.6))*0.55;
        legR.shin.rotation.x = 0.18 + Math.max(0, Math.sin(sidePhase+Math.PI+0.6))*0.55;
        legL.foot.rotation.x = -0.08; legR.foot.rotation.x = -0.08;
        // arms hold close during sidestep
        armL.upper.rotation.x = 0.12 + Math.sin(sidePhase)*0.10;
        armR.upper.rotation.x = -0.10 + Math.sin(sidePhase+Math.PI)*0.10;
        armL.shoulder.rotation.z = s*0.12; armR.shoulder.rotation.z = s*0.12;
        // hips sway exaggerated
        hips.position.y = 0.90 + Math.sin(sidePhase*2)*0.012;
        hips.rotation.z = s * 0.06 + Math.sin(sidePhase)*0.035;
        hips.rotation.x = THREE.MathUtils.damp(hips.rotation.x, 0.02, 8, dt);
        chest.rotation.y = -hips.rotation.z*0.45;
        chest.rotation.z = Math.sin(sidePhase)*0.025;
        chest.rotation.x = 0.02;
        headG.rotation.y = THREE.MathUtils.damp(headG.rotation.y, -s*0.28, 5, dt);
        headG.rotation.x = 0.02;
        neckG.rotation.x = -0.02;
      } else {
        const { lKnee, rKnee, lAnkle, rAnkle } = gait(phase, isRun);
        const swing = isRun ? 0.56 : 0.39;
        // thigh flex/extend
        legL.thigh.rotation.x = Math.sin(phase)*swing;
        legR.thigh.rotation.x = Math.sin(phase+Math.PI)*swing;
        // keep thigh adduction small for natural track width
        legL.thigh.rotation.z = Math.sin(phase*2)*0.02 - 0.015;
        legR.thigh.rotation.z = Math.sin(phase*2)*0.02 + 0.015;
        // knee & ankle
        legL.shin.rotation.x = lKnee;
        legR.shin.rotation.x = rKnee;
        legL.foot.rotation.x = -lAnkle*0.55 + (isRun?0.12:0);
        legR.foot.rotation.x = -rAnkle*0.55 + (isRun?0.12:0);
        legL.foot.rotation.z = Math.sin(phase)*0.04;
        legR.foot.rotation.z = Math.sin(phase+Math.PI)*0.04;

        // arms: opposite to legs, elbow ~70-90deg, slight shoulder roll
        const armSwing = isRun ? 0.62 : 0.38;
        armL.upper.rotation.x = Math.sin(phase+Math.PI)*armSwing;
        armR.upper.rotation.x = Math.sin(phase)*armSwing;
        armL.upper.rotation.z = Math.sin(phase)*0.06;
        armR.upper.rotation.z = Math.sin(phase+Math.PI)*0.06;
        armL.elbow.rotation.x = 0.95 + Math.sin(phase+Math.PI)*0.18 + (isRun?0.18:0);
        armR.elbow.rotation.x = 0.95 + Math.sin(phase)*0.18 + (isRun?0.18:0);

        // torso: pelvic rotation yaw ±6deg walk ±9deg run, shoulder counter ±4/6deg, lean
        const pelvisYaw = Math.sin(phase)* (isRun?0.155:0.105);
        const shoulderYaw = -pelvisYaw*0.62;
        hips.rotation.y = pelvisYaw;
        chest.rotation.y = shoulderYaw;
        chest.rotation.x = (isRun?0.09:0.025) + Math.sin(phase*2)*0.018;
        chest.rotation.z = Math.sin(phase)*0.042;
        // vertical bob: walk double-support dip (two per stride), run higher + flight
        const bobPhase = phase*2;
        const vBob = isRun
          ? (Math.max(0, Math.sin(bobPhase))*0.028 + Math.abs(Math.sin(bobPhase))*0.010)
          : (Math.abs(Math.sin(bobPhase))*0.014);
        const vBase = isRun ? 0.025 : 0;
        hips.position.y = 0.90 + vBob + vBase;
        // lateral weight transfer over stance foot
        hips.position.x = Math.sin(phase)*0.018 + (strafeVel*0.004);
        // head stabilization (counter to bob, gaze)
        neckG.rotation.x = -Math.sin(bobPhase)*0.04 - chest.rotation.x*0.55;
        headG.rotation.x = THREE.MathUtils.damp(headG.rotation.x, Math.sin(phase*2+0.7)*0.035, 10, dt);
        headG.rotation.y = THREE.MathUtils.damp(headG.rotation.y, Math.sin(phase*0.5)*0.10, 4, dt);
        headG.rotation.z = -hips.rotation.z*0.5 - chest.rotation.z*0.35;
      }
      // keep feet from interpenetrating during double-support: push stance shin slightly back
      lastSpeed = THREE.MathUtils.damp(lastSpeed, speed, 12, dt);
    } else {
      // idle: breath, micro-sway, head scan, gently return limbs
      const b = Math.sin(time*1.55)*0.007;
      const b2 = Math.sin(time*0.62)*0.006;
      chest.position.y = b*0.6;
      chest.rotation.x = THREE.MathUtils.damp(chest.rotation.x, b*0.25, 4, dt);
      chest.rotation.z = THREE.MathUtils.damp(chest.rotation.z, b2*0.5, 3, dt);
      chest.rotation.y = THREE.MathUtils.damp(chest.rotation.y, Math.sin(time*0.22)*0.04, 2, dt);
      hips.position.y = 0.90 + b*0.35 + Math.sin(time*0.48)*0.005;
      hips.position.x = THREE.MathUtils.damp(hips.position.x, Math.sin(time*0.31)*0.006, 3, dt);
      hips.rotation.y = THREE.MathUtils.damp(hips.rotation.y, 0, 4, dt);
      hips.rotation.z = THREE.MathUtils.damp(hips.rotation.z, Math.sin(time*0.36)*0.015, 3, dt);
      hips.rotation.x = THREE.MathUtils.damp(hips.rotation.x, 0, 4, dt);
      legL.thigh.rotation.x = THREE.MathUtils.damp(legL.thigh.rotation.x, -0.02, 7, dt);
      legR.thigh.rotation.x = THREE.MathUtils.damp(legR.thigh.rotation.x, 0.015, 7, dt);
      legL.shin.rotation.x = THREE.MathUtils.damp(legL.shin.rotation.x, 0.12, 7, dt);
      legR.shin.rotation.x = THREE.MathUtils.damp(legR.shin.rotation.x, 0.14, 7, dt);
      legL.foot.rotation.x = THREE.MathUtils.damp(legL.foot.rotation.x, -0.02, 7, dt);
      legR.foot.rotation.x = THREE.MathUtils.damp(legR.foot.rotation.x, -0.02, 7, dt);
      armL.upper.rotation.x = THREE.MathUtils.damp(armL.upper.rotation.x, 0.10, 5, dt);
      armR.upper.rotation.x = THREE.MathUtils.damp(armR.upper.rotation.x, -0.04, 5, dt);
      armL.elbow.rotation.x = THREE.MathUtils.damp(armL.elbow.rotation.x, 1.02, 5, dt);
      armR.elbow.rotation.x = THREE.MathUtils.damp(armR.elbow.rotation.x, 0.98, 5, dt);
      headG.rotation.y = THREE.MathUtils.damp(headG.rotation.y, Math.sin(time*0.33)*0.33 + Math.sin(time*0.71)*0.10, 3, dt);
      headG.rotation.x = THREE.MathUtils.damp(headG.rotation.x, Math.sin(time*0.62)*0.045, 3, dt);
      headG.rotation.z = THREE.MathUtils.damp(headG.rotation.z, Math.sin(time*0.41)*0.04, 3, dt);
      neckG.rotation.x = THREE.MathUtils.damp(neckG.rotation.x, 0, 3, dt);
    }
  };

  const legacyUpdate = (time, dt, maybeState)=> {
    if(maybeState && typeof maybeState==='object') return update(time, dt, maybeState);
    return update(time, dt, {});
  };

  const setPosition = (x,y,z,yaw)=>{
    group.position.set(x,y,z);
    if(yaw!==undefined){ const dy=yaw-hipsYaw; const nd=Math.atan2(Math.sin(dy),Math.cos(dy)); hipsYaw+=nd; group.rotation.y=hipsYaw; }
  };

  return { group, hips, chest, headG, legL, legR, armL, armR, update: legacyUpdate, _rawUpdate:update, setPosition };
}
