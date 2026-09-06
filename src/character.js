// Procedural walkable tactical character — Fab-inspired (Quantum Modular Character Free Sample)
// Link: https://www.fab.com/listings/8e200050-3158-4762-b297-f785b5b1533d
// This is a high-fidelity procedural recreation of the Fab listing's
// "Quantum Modular Character Free Sample" (UE5/Maya/FBX, modular tactical soldier,
// tall/masculine, fully compatible with Modular Mega/Casual/Survival bundles).
// It keeps zero external binary assets so `npm run build` stays headless-safe
// on SwiftShader. The exact Fab FBX can be used when available:
//
// 1) Download the FREE sample from the Fab link above (Add to My Library → Download)
//    Included formats: Unreal Engine / Maya / FBX
// 2) Place the FBX as `public/models/survival_character.fbx` (or GLB after Blender)
// 3) Convert via Blender: `blender --background --python tools/fbx2glb.py -- public/models/survival_character.fbx public/models/survival_character.glb`
//    (headless FBX→GLB, UE cm→m, height normalised to ~1.78m, rig preserved)
// 4) This module auto-detects `/models/survival_character.glb` and loads it
//    via GLTFLoader; otherwise it falls back to this procedural tactical mesh.
//
// Hierarchy & gait identical to prior explorer (1.78m, hips 0.90, walk 1.6Hz, run 2.4Hz,
// heel→toe phases, hip/pelvis counter-rotation, head stabilization). Appearance is
// now tactical: multicam shirt/pants, plate carrier, helmet, knee pads, boots.

import * as THREE from 'three';

function fabricTex(base = '#5a5a3a', dark = '#3a3a2a') {
  const S=128, cv=document.createElement('canvas'); cv.width=cv.height=S;
  const ctx=cv.getContext('2d');
  ctx.fillStyle=base; ctx.fillRect(0,0,S,S);
  ctx.fillStyle=dark; ctx.globalAlpha=0.22;
  for(let i=0;i<6;i++){ // large multicam blobs
    ctx.beginPath();
    ctx.ellipse(Math.random()*S,Math.random()*S, 18+Math.random()*18, 12+Math.random()*14, Math.random()*Math.PI,0,Math.PI*2);
    ctx.fill();
  }
  ctx.globalAlpha=0.09; ctx.strokeStyle=dark; ctx.lineWidth=1;
  for(let i=0;i<S;i+=4){ ctx.beginPath(); ctx.moveTo(i,0); ctx.lineTo(i,S); ctx.stroke(); }
  const t=new THREE.CanvasTexture(cv); t.wrapS=t.wrapT=THREE.RepeatWrapping; t.colorSpace=THREE.SRGBColorSpace; t.repeat.set(2,2);
  return t;
}
function camoTex(){ return fabricTex('#6b6a4a','#3d3a2a'); }

export function placeCharacter(scene) {
  const shirtTex = camoTex();
  const pantsTex = fabricTex('#5e5d3e','#2f2e22');
  const mats = {
    skin: new THREE.MeshStandardMaterial({ color:0x8f6a45, roughness:0.55, emissive:0x1a0f09, emissiveIntensity:0.07 }),
    skinHead: new THREE.MeshStandardMaterial({ color:0x9a7a5c, roughness:0.50, emissive:0x1e120a, emissiveIntensity:0.06 }),
    shirt: new THREE.MeshStandardMaterial({ map:shirtTex, color:0xffffff, roughness:0.82 }),
    pants: new THREE.MeshStandardMaterial({ map:pantsTex, color:0xffffff, roughness:0.84 }),
    vest: new THREE.MeshStandardMaterial({ color:0x2f3326, roughness:0.85, metalness:0.06 }),
    vestDark: new THREE.MeshStandardMaterial({ color:0x1f2218, roughness:0.88 }),
    boots: new THREE.MeshStandardMaterial({ color:0x1a1a12, roughness:0.62, metalness:0.10 }),
    helmet: new THREE.MeshStandardMaterial({ color:0x2a2e22, roughness:0.55, metalness:0.18 }),
    hair: new THREE.MeshStandardMaterial({ color:0x1e140d, roughness:0.95 }),
    eyeWhite: new THREE.MeshStandardMaterial({ color:0xe8e2d6, roughness:0.3 }),
    iris: new THREE.MeshStandardMaterial({ color:0x3a2f1a, roughness:0.4 }),
    highlight: new THREE.MeshBasicMaterial({ color:0xffffff }),
    strap: new THREE.MeshStandardMaterial({ color:0x0f0f0a, roughness:0.90 }),
    metal: new THREE.MeshStandardMaterial({ color:0x6b6b60, roughness:0.35, metalness:0.72 }),
    pouch: new THREE.MeshStandardMaterial({ color:0x3a3d2e, roughness:0.86 }),
  };

  const group = new THREE.Group(); group.name='ExplorerGuide'; // keep name for harness compat
  group.userData.fabLink = 'https://www.fab.com/listings/8e200050-3158-4762-b297-f785b5b1533d';
  const hips = new THREE.Group(); hips.position.y=0.90; group.add(hips);
  const addMesh=(parent,geo,mat,x=0,y=0,z=0,castShadow=true)=>{ const m=new THREE.Mesh(geo,mat); m.position.set(x,y,z); m.castShadow=castShadow; m.receiveShadow=true; parent.add(m); return m; };

  // pelvis + tactical belt
  addMesh(hips, new THREE.CylinderGeometry(0.22,0.23,0.14,14), mats.pants, 0,-0.02,0).scale.set(1.02,1,0.86);
  addMesh(hips, new THREE.CapsuleGeometry(0.195,0.20,4,12), mats.shirt, 0,0.17,0).scale.set(1.08,1,0.84);
  const belt = addMesh(hips, new THREE.CylinderGeometry(0.23,0.235,0.055,16), mats.vestDark, 0,-0.01,0);
  addMesh(hips, new THREE.BoxGeometry(0.065,0.045,0.02), mats.metal, 0,-0.01,0.23);
  addMesh(hips, new THREE.BoxGeometry(0.055,0.03,0.015), mats.pouch, -0.14,-0.02,0.20);
  addMesh(hips, new THREE.BoxGeometry(0.055,0.03,0.015), mats.pouch, 0.14,-0.02,0.20);

  // chest + plate carrier (Fab tactical)
  const chest=new THREE.Group(); chest.position.set(0,0.34,0); hips.add(chest);
  addMesh(chest, new THREE.CapsuleGeometry(0.205,0.26,4,12), mats.shirt, 0,0.06,0).scale.set(1.12,1,0.83);
  // plate carrier vest
  const vest = addMesh(chest, new THREE.BoxGeometry(0.32,0.36,0.18), mats.vest, 0,0.04,0.055);
  // front plates, mag pouches (modular)
  addMesh(chest, new THREE.BoxGeometry(0.20,0.14,0.04), mats.pouch, 0,0.02,0.15);
  addMesh(chest, new THREE.BoxGeometry(0.08,0.09,0.03), mats.pouch, -0.11,0.00,0.155);
  addMesh(chest, new THREE.BoxGeometry(0.08,0.09,0.03), mats.pouch, 0.11,0.00,0.155);
  addMesh(chest, new THREE.BoxGeometry(0.06,0.06,0.02), mats.metal, 0,0.14,0.15); // buckle
  // shoulder straps
  addMesh(chest, new THREE.BoxGeometry(0.06,0.28,0.01), mats.strap, -0.13,0.10,0.14);
  addMesh(chest, new THREE.BoxGeometry(0.06,0.28,0.01), mats.strap, 0.13,0.10,0.14);
  // collar
  addMesh(chest, new THREE.CylinderGeometry(0.09,0.11,0.07,12), mats.shirt, 0,0.21,0).scale.set(1,1,0.8);

  // Fab bonus weapon (public/models/sm_rifle.fbx, 7849 verts, 1 gray 'Rifle'
  // material — Rifle_BaseColor.png was NOT shipped with the FBX) slung
  // diagonally on the back, visible from the third-person chase cam.
  // Converted headless via Blender: sm_rifle.fbx → sm_rifle.glb.
  // Silent if missing — the tactical fallback simply has no rifle.
  (async ()=>{
    try{
      const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
      const gltf = await new Promise((res,rej)=> new GLTFLoader().load('/models/sm_rifle.glb',res,undefined,rej));
      const rifle = gltf.scene;
      rifle.traverse(o=>{ if(o.isMesh){ o.castShadow=true; o.receiveShadow=true; } });
      const sling = new THREE.Group();
      sling.position.set(-0.02, 0.15, -0.28); // mid-back, clear of vest and pack
      sling.rotation.set(0.15, 0, -0.55);     // diagonal: barrel up over right shoulder
      sling.add(rifle);
      chest.add(sling);
      console.log('[fab] rifle attached');
    }catch(e){ console.warn('[fab] rifle missing:', e?.message); }
  })();

  // tactical pants with knee pads
  addMesh(hips, new THREE.CylinderGeometry(0.235,0.24,0.30,14), mats.pants, 0,-0.18,0).scale.set(1,1,0.9);
  addMesh(hips, new THREE.BoxGeometry(0.09,0.06,0.04), mats.vest, -0.18,-0.16,0.16);
  addMesh(hips, new THREE.BoxGeometry(0.09,0.06,0.04), mats.vest, 0.18,-0.16,0.16);

  // neck -> head
  const neckG=new THREE.Group(); neckG.position.set(0,0.27,0); chest.add(neckG);
  addMesh(neckG, new THREE.CylinderGeometry(0.065,0.075,0.10,12), mats.skinHead, 0,0.04,0);
  const headG=new THREE.Group(); headG.position.set(0,0.11,0); neckG.add(headG);
  const cranium=addMesh(headG, new THREE.SphereGeometry(0.125,20,16), mats.skinHead, 0,0.06,-0.01);
  cranium.scale.set(1.02,1.08,1.0);
  const jaw=addMesh(headG, new THREE.SphereGeometry(0.08,14,10), mats.skinHead, 0,-0.04,0.04);
  jaw.scale.set(1.0,0.78,0.92);
  addMesh(headG, new THREE.SphereGeometry(0.028,8,8), mats.skinHead, -0.125,0.02,-0.02).scale.set(0.6,1.2,0.8);
  addMesh(headG, new THREE.SphereGeometry(0.028,8,8), mats.skinHead, 0.125,0.02,-0.02).scale.set(0.6,1.2,0.8);
  addMesh(headG, new THREE.CapsuleGeometry(0.022,0.055,4,8), mats.skinHead, 0,-0.01,0.13).rotation.x=Math.PI/2*0.08;
  addMesh(headG, new THREE.BoxGeometry(0.05,0.006,0.006), mats.vestDark, 0,-0.055,0.115);
  const eyeL=new THREE.Group(); eyeL.position.set(-0.042,0.015,0.105); headG.add(eyeL);
  addMesh(eyeL, new THREE.SphereGeometry(0.022,12,10), mats.eyeWhite, 0,0,0,false).scale.set(1,0.85,0.45);
  addMesh(eyeL, new THREE.SphereGeometry(0.011,10,8), mats.iris, 0,-0.002,0.009,false).scale.set(1,1,0.45);
  addMesh(eyeL, new THREE.SphereGeometry(0.0035,6,6), mats.highlight, 0.004,0.004,0.011,false);
  addMesh(eyeL, new THREE.CapsuleGeometry(0.004,0.03,4,6), mats.hair, 0,0.016,-0.002,false).rotation.z=0.05;
  const eyeR=eyeL.clone(); eyeR.position.x=0.042; headG.add(eyeR);
  // tactical helmet (replaces jungle hat) — Fab modular helmet
  const helmet = addMesh(headG, new THREE.SphereGeometry(0.138,20,16,0,Math.PI*2,0,Math.PI*0.62), mats.helmet, 0,0.075, -0.015);
  helmet.scale.set(1.04,0.92,1.06);
  addMesh(headG, new THREE.CylinderGeometry(0.145,0.150,0.02,20), mats.helmet, 0,0.075,0).scale.set(1,1,0.7);
  addMesh(headG, new THREE.BoxGeometry(0.08,0.03,0.06), mats.metal, 0,0.14,0.06); // NVG mount
  addMesh(headG, new THREE.BoxGeometry(0.015,0.05,0.12), mats.strap, -0.13,0.06,-0.04);
  addMesh(headG, new THREE.BoxGeometry(0.015,0.05,0.12), mats.strap, 0.13,0.06,-0.04);

  // arms (tactical sleeves)
  function buildArm(side){
    const shoulder=new THREE.Group(); shoulder.position.set(0.27*side,0.14,0); chest.add(shoulder);
    addMesh(shoulder, new THREE.SphereGeometry(0.07,10,8), mats.skin, 0,-0.02,0).scale.set(0.9,0.9,0.9);
    const upper=new THREE.Group(); shoulder.add(upper);
    addMesh(upper, new THREE.CapsuleGeometry(0.058,0.24,4,8), mats.shirt, 0,-0.14,0);
    // elbow pad
    const elbow=new THREE.Group(); elbow.position.set(0,-0.27,0); upper.add(elbow);
    addMesh(elbow, new THREE.SphereGeometry(0.05,8,8), mats.vest, 0,0,0);
    addMesh(elbow, new THREE.CapsuleGeometry(0.044,0.22,4,8), mats.skin, 0,-0.12,0);
    addMesh(elbow, new THREE.SphereGeometry(0.048,10,8), mats.skin, 0,-0.26,0);
    // forearm strap
    if(side>0) addMesh(upper, new THREE.BoxGeometry(0.04,0.12,0.06), mats.vestDark, 0.01,-0.18,-0.02);
    return { shoulder, upper, elbow };
  }
  const armL=buildArm(-1); const armR=buildArm(1);

  // legs with knee pads + boots
  function buildLeg(side){
    const thigh=new THREE.Group(); thigh.position.set(0.12*side,-0.06,0); hips.add(thigh);
    addMesh(thigh, new THREE.CapsuleGeometry(0.092,0.30,4,10), mats.pants, 0,-0.14,0);
    const shin=new THREE.Group(); shin.position.set(0,-0.32,0); thigh.add(shin);
    addMesh(shin, new THREE.SphereGeometry(0.068,10,8), mats.vest, 0,0,0); // knee pad
    addMesh(shin, new THREE.CapsuleGeometry(0.062,0.30,4,10), mats.pants, 0,-0.16,0);
    const footG=new THREE.Group(); footG.position.set(0,-0.33,0); shin.add(footG);
    addMesh(footG, new THREE.SphereGeometry(0.055,10,8), mats.boots, 0,-0.02,0.04).scale.set(0.9,0.55,1.45);
    addMesh(footG, new THREE.BoxGeometry(0.11,0.06,0.20), mats.boots, 0,-0.055,0.05);
    addMesh(footG, new THREE.BoxGeometry(0.02,0.02,0.12), mats.metal, 0,-0.025,0.08);
    return { thigh, shin, foot:footG };
  }
  const legL=buildLeg(-1); const legR=buildLeg(1);

  group.position.set(0,0,0); group.rotation.y=0; scene.add(group);

  // ---------------------------------------------------------------------
  // Rig-driven gait hook — set by the GLB loader below (null while the
  // procedural mesh is active, so the fallback is unaffected).
  // Bone axes were measured empirically via tools/rig-probe.mjs:
  //   thigh/calf/upperarm/lowerarm swing = local Z
  //   knee & elbow flexion (heel/forearm to body) = -Z
  //   shoulder forward swing = -Z
  // ---------------------------------------------------------------------
  let rigAnimator = null;

  const makeRigUpdate = (rig)=>{
    const R=rig.restQ, B=rig.bones, Q=new THREE.Quaternion(), E=new THREE.Euler();
    const set=(n,ax,v)=>{ const b=B[n]; if(!b) return; E.set(ax==='x'?v:0, ax==='y'?v:0, ax==='z'?v:0); Q.setFromEuler(E); b.quaternion.copy(R[n]).multiply(Q); };
    const pelvis=B.pelvis;
    return (time,dt,ph,ctx)=>{
      const { isRun=false, moving=false }=ctx;
      const PI=Math.PI;
      const pt=ph%(PI*2);
      let bob, pYaw, lean;
      if(moving){
        bob=isRun?(Math.max(0,Math.sin(pt*2))*0.022+Math.abs(Math.sin(pt*2))*0.010):(Math.abs(Math.sin(pt*2))*0.014);
        pYaw=Math.sin(pt)*(isRun?0.105:0.065);
        lean=isRun?0.09:0.028;
      } else {
        bob=Math.sin(time*1.55)*0.004;
        pYaw=0;
        lean=0.020+Math.sin(time*1.55)*0.010;
      }
      // pelvis bob + torso counter-rotation + forward lean
      if(pelvis) pelvis.position.y=rig.restPelvisY+bob;
      set('pelvis','y',pYaw);
      set('spine_01','y',-pYaw*0.55);
      set('spine_03','z',moving?Math.sin(pt)*0.03:0);
      set('spine_05','x',lean);
      set('neck_01','y',moving?-Math.sin(pt)*0.05:0);
      set('head','y',moving?-Math.sin(pt)*0.03:0);

      if(moving){
        const swing=isRun?0.55:0.38;
        const knee=isRun?1.10:0.85;
        set('thigh_l','z',Math.sin(pt)*swing);
        set('thigh_r','z',Math.sin(pt+PI)*swing);
        const lKnee=Math.max(0,Math.sin(pt-0.2))*knee+Math.max(0,Math.sin(pt))*0.12;
        const rKnee=Math.max(0,Math.sin(pt+PI-0.2))*knee+Math.max(0,Math.sin(pt+PI))*0.12;
        set('calf_l','z',-lKnee);
        set('calf_r','z',-rKnee);
        // foot: slight toe-off / landing flatten
        set('foot_l','z',Math.sin(pt+0.35)*0.10+(isRun?0.06:0));
        set('foot_r','z',Math.sin(pt+PI+0.35)*0.10+(isRun?0.06:0));
        const arm=isRun?0.55:0.36;
        set('upperarm_l','z',-Math.sin(pt+PI)*arm);
        set('upperarm_r','z',-Math.sin(pt)*arm);
        set('lowerarm_l','z',-0.55-Math.sin(pt+PI)*0.08);
        set('lowerarm_r','z',-0.55-Math.sin(pt)*0.08);
      } else {
        set('thigh_l','z',-0.015); set('thigh_r','z',0.012);
        set('calf_l','z',-0.04);  set('calf_r','z',-0.04);
        set('foot_l','z',0);       set('foot_r','z',0);
        set('upperarm_l','z',-0.10); set('upperarm_r','z',0.06);
        set('lowerarm_l','z',-0.45); set('lowerarm_r','z',-0.45);
      }
      rig.skin.update();
    };
  };

  // Survival/Fab character GLB loader — replaces the procedural tactical
  // soldier when the converted FBX is present (`public/models/survival_character.glb`,
  // produced by tools/fbx2glb.py). Runs once at startup, swaps the procedural
  // mesh for the GLB, then slaves it to group position/yaw (locomotion is still
  // driven by world.js/main.js). No error if missing — keeps the fallback.
  (async ()=>{
    const urls=['/models/survival_character.glb','/models/quantum-character.glb','/models/quantum-character.gltf'];
    for(const url of urls){
      try{
        const r=await fetch(url,{method:'HEAD'});
        if(!r.ok) continue;
        const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
        const gltf=await new Promise((res,rej)=> new GLTFLoader().load(url,res,undefined,rej));
        const m=gltf.scene;
        m.traverse(o=>{ if(o.isMesh){ o.castShadow=true; o.receiveShadow=true; }});
        scene.add(m); m.updateWorldMatrix(true,true);
        // True fitted size: Box3.setFromObject is WRONG for skinned meshes
        // (it ignores bone transforms), which mis-scaled the model 3.5x.
        // Sample real skinned vertices through the skeleton instead.
        const skinnedAABB=(root)=>{
          const min=[Infinity,Infinity,Infinity], max=[-Infinity,-Infinity,-Infinity];
          const v=new THREE.Vector3(), t=new THREE.Vector3(), p=new THREE.Vector3(), m4=new THREE.Matrix4();
          root.updateWorldMatrix(true,true);
          root.traverse(o=>{
            if(!o.isSkinnedMesh || !o.geometry.attributes.skinIndex) return;
            const pos=o.geometry.attributes.position;
            const step=Math.max(1,Math.floor(pos.count/4000));
            o.skeleton.update();
            for(let i=0;i<pos.count;i+=step){
              v.fromBufferAttribute(pos,i);
              let x=0,y=0,z=0;
              for(let k=0;k<4;k++){
                const w=o.geometry.attributes.skinWeight['get'+['XYZW'[k]]]?.(i)||0;
                if(!w) continue;
                m4.fromArray(o.skeleton.boneMatrices,o.geometry.attributes.skinIndex['get'+['XYZW'[k]]]?.(i)*16);
                t.copy(v).applyMatrix4(o.bindMatrix).applyMatrix4(m4).applyMatrix4(o.bindMatrixInverse);
                x+=t.x*w; y+=t.y*w; z+=t.z*w;
              }
              p.set(x,y,z).applyMatrix4(o.matrixWorld);
              const c=[p.x,p.y,p.z];
              for(let a=0;a<3;a++){ if(c[a]<min[a])min[a]=c[a]; if(c[a]>max[a])max[a]=c[a]; }
            }
          });
          return (min[0]===Infinity)?null:{min,max,h:max[1]-min[1]};
        };
        // Fit to ~1.78m adult (covers UE-cm and metre exports alike).
        let bb=skinnedAABB(m);
        if(bb && bb.h>0.001 && (bb.h>2.5 || bb.h<1.2)){ const s=1.78/(bb.h||1.78); m.scale.setScalar(s); }
        // Ground the model: hold its lowest skinned point at group's y=0 (feet on terrain).
        bb=skinnedAABB(m);
        const ymin=(bb && Number.isFinite(bb.min[1]))?bb.min[1]:0;
        const holder=new THREE.Group(); holder.name='SurvivalCharacterHolder';
        holder.position.y=(Number.isFinite(ymin)&&Math.abs(ymin)>0.001)?-ymin:0;
        holder.add(m);
        scene.remove(m);
        // Hide procedural, show GLB model at the same world position.
        group.visible=false;
        const fabGroup=new THREE.Group(); fabGroup.name='FabQuantumCharacter';
        fabGroup.add(holder);
        // Re-attach the Fab bonus rifle (sm_rifle.glb) slung diagonally on the
        // survival character's back — these character FBX meshes carry no weapon.
        try{
          const rif=await new Promise((res,rej)=> new GLTFLoader().load('/models/sm_rifle.glb',res,undefined,rej));
          const rifle=rif.scene;
          rifle.traverse(o=>{ if(o.isMesh){ o.castShadow=true; o.receiveShadow=true; }});
          const sling=new THREE.Group(); sling.name='RifleSling';
          sling.position.set(0.0, 1.38, -0.32); // upper back, clear of jacket & backpack
          sling.rotation.set(0.15, 0, -0.55);   // diagonal: barrel over shoulder
          sling.add(rifle);
          fabGroup.add(sling);
          console.log('[fab] rifle attached (survival character)');
        }catch(e){ console.warn('[fab] rifle missing:', e?.message); }
        // sync position/yaw from group (group drives locomotion)
        const sync=()=>{
          fabGroup.position.copy(group.position);
          fabGroup.rotation.y=group.rotation.y;
          requestAnimationFrame(sync);
        }; sync();
        scene.add(fabGroup);
        // Capture the rig for the walk cycle (we drive bones in update()).
        (()=>{
          let sm=null; m.traverse(o=>{ if(o.isSkinnedMesh&&!sm) sm=o; });
          if(!sm) return;
          const want=['pelvis','spine_01','spine_03','spine_05','neck_01','head',
                      'thigh_l','thigh_r','calf_l','calf_r','foot_l','foot_r',
                      'upperarm_l','upperarm_r','lowerarm_l','lowerarm_r'];
          const bones={}, restQ={};
          for(const b of sm.skeleton.bones){
            if(want.includes(b.name)){ bones[b.name]=b; restQ[b.name]=b.quaternion.clone(); }
          }
          rigAnimator=makeRigUpdate({ skin:sm.skeleton, bones, restQ,
            restPelvisY:(bones.pelvis?bones.pelvis.position.y:0) });
          console.log('[fab] rig set for gait:', Object.keys(bones).join(','));
        })();
        console.log('[fab] loaded',url);
        break;
      }catch(e){ console.warn('[fab] GLB skipped:',url,e?.message); }
    }
  })();

  // biomechanical gait (same as before)
  let phase=0, hipsYaw=group.rotation.y;
  const gait=(ph,isRun)=>{
    const swing=isRun?0.56:0.39, kneeSwing=isRun?1.22:0.95;
    const lKnee=Math.max(0,Math.sin(ph-0.20))*kneeSwing+Math.max(0,Math.sin(ph))*0.12;
    const rKnee=Math.max(0,Math.sin(ph+Math.PI-0.20))*kneeSwing+Math.max(0,Math.sin(ph+Math.PI))*0.12;
    const lAnkle=Math.sin(ph+0.35)*0.28+Math.sin(ph*2)*0.10;
    const rAnkle=Math.sin(ph+Math.PI+0.35)*0.28+Math.sin((ph+Math.PI)*2)*0.10;
    return { swing,lKnee,rKnee,lAnkle,rAnkle };
  };
  const update=(time,dt,state={})=>{
    const { speed=0,isMoving=false,isRunning=false,yaw=group.rotation.y,strafeVel=0,trailVel=0 }=state;
    const moving=isMoving||speed>0.11||Math.abs(strafeVel)>0.18||Math.abs(trailVel)>0.00022;
    const isRun=!!isRunning && speed>1.9; const hz=isRun?2.40:1.60;
    let dy=yaw-hipsYaw; dy=Math.atan2(Math.sin(dy),Math.cos(dy)); hipsYaw+=dy*Math.min(1,dt*7.0); group.rotation.y=hipsYaw;
    const strafeOnly=Math.abs(strafeVel)>0.35 && Math.abs(trailVel)*320<0.6;
    const sAbs=Math.abs(strafeVel);
    if(moving){
      phase+=dt*hz*Math.PI*2; if(phase>Math.PI*2) phase-=Math.PI*2;
      if(strafeOnly){
        const s=Math.sign(strafeVel), abduct=0.22+sAbs*0.03;
        legL.thigh.rotation.z=s*Math.sin(phase)*abduct*-1; legR.thigh.rotation.z=s*Math.sin(phase+Math.PI)*abduct*-1;
        legL.thigh.rotation.x=Math.sin(phase)*0.08; legR.thigh.rotation.x=Math.sin(phase+Math.PI)*0.08;
        legL.shin.rotation.x=0.18+Math.max(0,Math.sin(phase+0.6))*0.55; legR.shin.rotation.x=0.18+Math.max(0,Math.sin(phase+Math.PI+0.6))*0.55;
        armL.upper.rotation.x=0.12+Math.sin(phase)*0.10; armR.upper.rotation.x=-0.10+Math.sin(phase+Math.PI)*0.10;
        hips.position.y=0.90+Math.sin(phase*2)*0.012; hips.rotation.z=s*0.06+Math.sin(phase)*0.035;
        chest.rotation.y=-hips.rotation.z*0.45;
      } else {
        const { lKnee,rKnee,lAnkle,rAnkle }=gait(phase,isRun); const swing=isRun?0.56:0.39;
        legL.thigh.rotation.x=Math.sin(phase)*swing; legR.thigh.rotation.x=Math.sin(phase+Math.PI)*swing;
        legL.shin.rotation.x=lKnee; legR.shin.rotation.x=rKnee;
        legL.foot.rotation.x=-lAnkle*0.55+(isRun?0.12:0); legR.foot.rotation.x=-rAnkle*0.55+(isRun?0.12:0);
        const armSwing=isRun?0.62:0.38;
        armL.upper.rotation.x=Math.sin(phase+Math.PI)*armSwing; armR.upper.rotation.x=Math.sin(phase)*armSwing;
        armL.elbow.rotation.x=0.95+Math.sin(phase+Math.PI)*0.18+(isRun?0.18:0); armR.elbow.rotation.x=0.95+Math.sin(phase)*0.18+(isRun?0.18:0);
        const pelvisYaw=Math.sin(phase)*(isRun?0.155:0.105); const shoulderYaw=-pelvisYaw*0.62;
        hips.rotation.y=pelvisYaw; chest.rotation.y=shoulderYaw; chest.rotation.x=(isRun?0.09:0.025)+Math.sin(phase*2)*0.018;
        chest.rotation.z=Math.sin(phase)*0.042;
        const vBob=isRun?(Math.max(0,Math.sin(phase*2))*0.028+Math.abs(Math.sin(phase*2))*0.010):(Math.abs(Math.sin(phase*2))*0.014);
        hips.position.y=0.90+vBob+(isRun?0.025:0);
        hips.position.x=Math.sin(phase)*0.018+(strafeVel*0.004);
      }
    } else {
      const b=Math.sin(time*1.55)*0.007, b2=Math.sin(time*0.62)*0.006;
      chest.position.y=b*0.6; chest.rotation.x=THREE.MathUtils.damp(chest.rotation.x,b*0.25,4,dt);
      hips.position.y=0.90+b*0.35+Math.sin(time*0.48)*0.005;
      legL.thigh.rotation.x=THREE.MathUtils.damp(legL.thigh.rotation.x,-0.02,7,dt);
      legR.thigh.rotation.x=THREE.MathUtils.damp(legR.thigh.rotation.x,0.015,7,dt);
      armL.upper.rotation.x=THREE.MathUtils.damp(armL.upper.rotation.x,0.10,5,dt);
    }
    // drive the GLB rig with the same gait phase (no-op for procedural fallback)
    if(rigAnimator) rigAnimator(time,dt,phase,{ moving, isRun, strafeOnly, strafeVel });
  };
  const legacyUpdate=(time,dt,maybeState)=>{ if(maybeState&&typeof maybeState==='object') return update(time,dt,maybeState); return update(time,dt,{}); };
  const setPosition=(x,y,z,yaw)=>{ group.position.set(x,y,z); if(yaw!==undefined){ const dy=yaw-hipsYaw; const nd=Math.atan2(Math.sin(dy),Math.cos(dy)); hipsYaw+=nd; group.rotation.y=hipsYaw; } };
  return { group, hips, chest, headG, legL, legR, armL, armR, update:legacyUpdate, _rawUpdate:update, setPosition };
}
