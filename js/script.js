(function(){

  // ============================================================
  // SETUP
  // ============================================================
  const viewport = document.getElementById('viewport');
  const canvas = document.getElementById('c');
  const renderer = new THREE.WebGLRenderer({canvas, antialias:true, alpha:true});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x0a120f, 24, 48);

  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);

  function resize(){
    const w = viewport.clientWidth, h = viewport.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);

  // ============================================================
  // LIGHTS
  // ============================================================
  const ambientLight = new THREE.AmbientLight(0x8fa89c, 0.22);
  scene.add(ambientLight);

  const key = new THREE.DirectionalLight(0xfff2e0, 0.75);
  key.position.set(7, 14, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(1536,1536);
  key.shadow.camera.left = -15; key.shadow.camera.right = 15;
  key.shadow.camera.top = 12; key.shadow.camera.bottom = -12;
  scene.add(key);

  const rim = new THREE.DirectionalLight(0x8fd0ff, 0.22);
  rim.position.set(-8, 6, -6);
  scene.add(rim);

  const glowPink = new THREE.PointLight(0xff6fb0, 1.1, 15, 2);
  const glowBlue = new THREE.PointLight(0x6f8bff, 0.9, 15, 2);
  scene.add(glowPink, glowBlue);
  const BASE_PINK = 1.1, BASE_BLUE = 0.9;

  // ============================================================
  // GROW BED GEOMETRY CONSTANTS
  // ============================================================
  const CHANNELS = 6;
  const HOLES_PER_CHANNEL = 9;
  const HOLE_SPACING = 1.05;
  const CHAN_GAP = 1.05;
  const CHAN_W = 0.82, CHAN_H = 0.30;
  const CHAN_LEN = (HOLES_PER_CHANNEL - 1) * HOLE_SPACING + 1.1;
  const RES_H = 0.5;

  const totalWidth = (CHANNELS - 1) * CHAN_GAP + CHAN_W;
  const startX = -totalWidth/2 + CHAN_W/2;
  const startZ = -CHAN_LEN/2 + 0.55;
  const frontZ = startZ - 0.75;

  const groundPlane = new THREE.Plane(new THREE.Vector3(0,1,0), 0);

  // ============================================================
  // GROUND (soft contact shadow disc)
  // ============================================================
  (function(){
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(128,128,10,128,128,128);
    g.addColorStop(0, 'rgba(0,0,0,0.55)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0,0,256,256);
    const tex = new THREE.CanvasTexture(c);
    const geo = new THREE.CircleGeometry(18, 48);
    const mat = new THREE.MeshBasicMaterial({map:tex, transparent:true, depthWrite:false});
    const disc = new THREE.Mesh(geo, mat);
    disc.rotation.x = -Math.PI/2;
    disc.position.set(1.2, -0.02, 0);
    scene.add(disc);
  })();

  // ============================================================
  // GROW BED RIG
  // ============================================================
  const glassBaseGroup = new THREE.Group();
  scene.add(glassBaseGroup);

  const resW = totalWidth + 0.6, resD = CHAN_LEN + 0.4, padIn = 0.06;

  const glassMat = new THREE.MeshPhysicalMaterial({
    color:0xbfe8ff, transparent:true, opacity:0.12, roughness:0.05, metalness:0, side:THREE.DoubleSide, depthWrite:false
  });
  const glassBase = new THREE.Mesh(new THREE.BoxGeometry(resW, RES_H, resD), glassMat);
  glassBase.position.set(0, RES_H/2, 0);
  glassBaseGroup.add(glassBase);

  const glassEdges = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(resW, RES_H, resD)),
    new THREE.LineBasicMaterial({color:0xffffff, transparent:true, opacity:0.55})
  );
  glassEdges.position.set(0, RES_H/2, 0);
  glassBaseGroup.add(glassEdges);

  const bedWaterMat = new THREE.MeshStandardMaterial({color:0x2f8fd0, transparent:true, opacity:0.72, roughness:0.12, metalness:0.25});
  const bedWater = new THREE.Mesh(new THREE.BoxGeometry(resW - padIn*2, 1, resD - padIn*2), bedWaterMat);
  glassBaseGroup.add(bedWater);
  bedWater.scale.y = 0.0001;

  const bedGlow = new THREE.PointLight(0x3fb0ff, 0.5, 6, 2);
  bedGlow.position.set(0, padIn, 0);
  glassBaseGroup.add(bedGlow);

  function makeTextSprite(text, w, h, size){
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    ctx.font = "700 " + size + "px 'Space Grotesk', sans-serif";
    ctx.fillStyle = '#bfe8ff';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.globalAlpha = 0.6;
    ctx.fillText(text, w/2, h/2);
    const tex = new THREE.CanvasTexture(c);
    const mat = new THREE.SpriteMaterial({map:tex, transparent:true, depthWrite:false});
    return new THREE.Sprite(mat);
  }
  const bedLabel = makeTextSprite('WATER', 260, 64, 32);
  bedLabel.scale.set(1.5, 0.37, 1);
  bedLabel.position.set(0, RES_H*0.5, 0);
  glassBaseGroup.add(bedLabel);

  // Three pipe connection points along the grow bed's right edge —
  // right-click any of them to connect/disconnect a run to the pump.
  const PORT_UNCONNECTED = 0x8fa89c;
  const PORT_CONNECTED = 0x7ee08a;
  const nubMat = new THREE.MeshStandardMaterial({color:0x1c2420, roughness:0.5, metalness:0.3});
  const growbedPorts = [];
  [frontZ + 0.3, CHAN_LEN * 0.12, CHAN_LEN * 0.42].forEach((z)=>{
    const pos = new THREE.Vector3(resW/2 + 0.06, RES_H*0.55, z);
    const nub = new THREE.Mesh(new THREE.CylinderGeometry(0.07,0.07,0.16,14), nubMat);
    nub.rotation.z = Math.PI/2;
    nub.position.copy(pos);
    scene.add(nub);
    const knobMat = new THREE.MeshStandardMaterial({color:0x22302a, emissive:PORT_UNCONNECTED, emissiveIntensity:0.9, roughness:0.4});
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.095,14,14), knobMat);
    knob.position.copy(pos).add(new THREE.Vector3(0.1,0,0));
    scene.add(knob);
    growbedPorts.push({pos, knob, knobMat, connected:false});
  });

  // ============================================================
  // NUTRIENT CONCENTRATION PUMP — a large cabinet attached flush
  // against the grow bed's left side. Right-click it to open the panel.
  // ============================================================
  const doseW = 0.85, doseH = 1.35, doseD = 2.6;
  const doseGroup = new THREE.Group();
  const doseX = -(resW/2 + doseW/2);
  const doseZ = 0;
  doseGroup.position.set(doseX, 0, doseZ);
  scene.add(doseGroup);

  const doseCabMat = new THREE.MeshStandardMaterial({color:0x16241d, roughness:0.45, metalness:0.25});
  const doseCabinet = new THREE.Mesh(new THREE.BoxGeometry(doseW, doseH, doseD), doseCabMat);
  doseCabinet.position.set(0, doseH/2, 0);
  doseCabinet.castShadow = true; doseCabinet.receiveShadow = true;
  doseGroup.add(doseCabinet);

  // outward-facing side (away from the bed) carries the panel, name plate & screen
  const outX = -doseW/2 - 0.011;
  const dosePanelMat = new THREE.MeshStandardMaterial({color:0x0f1a15, roughness:0.5, metalness:0.2});
  const dosePanel = new THREE.Mesh(new THREE.BoxGeometry(0.02, doseH*0.72, doseD*0.62), dosePanelMat);
  dosePanel.position.set(outX, doseH*0.54, 0);
  doseGroup.add(dosePanel);

  function makeMultilineTexture(lines, w, h, size, color){
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    ctx.font = "700 " + size + "px 'Space Grotesk', sans-serif";
    ctx.fillStyle = color;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const lineH = size * 1.18;
    const startY = h/2 - (lineH*(lines.length-1))/2;
    lines.forEach((l,i)=> ctx.fillText(l, w/2, startY + i*lineH));
    return new THREE.CanvasTexture(c);
  }
  const doseLabel = new THREE.Mesh(
    new THREE.PlaneGeometry(doseD*0.86, 0.24),
    new THREE.MeshBasicMaterial({map: makeMultilineTexture(['Nutrient Concentration Pump'], 1300, 160, 66, '#e6f3ec'), transparent:true})
  );
  doseLabel.position.set(outX - 0.016, doseH*0.86, 0);
  doseLabel.rotation.y = -Math.PI/2;
  doseGroup.add(doseLabel);

  // small live readout screen, redrawn whenever a slider changes
  const doseScreenCanvas = document.createElement('canvas');
  doseScreenCanvas.width = 260; doseScreenCanvas.height = 140;
  const doseScreenCtx = doseScreenCanvas.getContext('2d');
  const doseScreenTex = new THREE.CanvasTexture(doseScreenCanvas);
  const doseScreen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.5, 0.27),
    new THREE.MeshBasicMaterial({map: doseScreenTex})
  );
  doseScreen.position.set(outX - 0.016, doseH*0.48, 0);
  doseScreen.rotation.y = -Math.PI/2;
  doseGroup.add(doseScreen);

  const doseLedMat = new THREE.MeshStandardMaterial({color:0x222, emissive:0xff5566, emissiveIntensity:1.2, roughness:0.4});
  const doseLed = new THREE.Mesh(new THREE.SphereGeometry(0.04,10,10), doseLedMat);
  doseLed.position.set(outX - 0.01, doseH*0.98, doseD*0.28);
  doseGroup.add(doseLed);

  const doseHitBox = new THREE.Mesh(
    new THREE.BoxGeometry(doseW+0.1, doseH+0.1, doseD+0.1),
    new THREE.MeshBasicMaterial({visible:false})
  );
  doseHitBox.position.set(0, doseH/2, 0);
  doseGroup.add(doseHitBox);

  // ---- nutrient state, two-way synced popup/sidebar sliders, and the live cabinet screen ----
  const nutrients = {N:180, P:55, K:230, Ca:170, Mg:55};
  const chemTargets = {pH: 6.1, temp: 21.4};
  function computeSolutionEC(){
    const total = nutrients.N + nutrients.P + nutrients.K + nutrients.Ca + nutrients.Mg;
    return total / 700;
  }
  function updateDoseScreen(){
    const ctx = doseScreenCtx;
    ctx.fillStyle = '#07110c'; ctx.fillRect(0,0,260,140);
    ctx.fillStyle = '#7ee08a';
    ctx.font = "700 20px 'JetBrains Mono', monospace";
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('N ' + nutrients.N, 14, 24);
    ctx.fillText('P ' + nutrients.P, 14, 50);
    ctx.fillText('K ' + nutrients.K, 14, 76);
    ctx.fillStyle = '#9fe8ff';
    ctx.fillText('Ca ' + nutrients.Ca, 140, 24);
    ctx.fillText('Mg ' + nutrients.Mg, 140, 50);
    ctx.fillStyle = '#c98bff';
    ctx.font = "700 18px 'JetBrains Mono', monospace";
    ctx.fillText('EC ' + computeSolutionEC().toFixed(2), 14, 112);
    ctx.fillStyle = '#ffcf6b';
    ctx.fillText('pH ' + chemTargets.pH.toFixed(1) + '  ' + chemTargets.temp.toFixed(1) + 'C', 100, 112);
    doseScreenTex.needsUpdate = true;
  }
  const NUTRIENT_KEYS = ['N','P','K','Ca','Mg'];
  function refreshNutrientUI(source){
    const ecLabel = computeSolutionEC().toFixed(2) + ' mS/cm';
    NUTRIENT_KEYS.forEach(k=>{
      const label = nutrients[k] + ' ppm';
      document.getElementById('nutrient-'+k+'-val').textContent = label;
      document.getElementById('nutrient-side-'+k+'-val').textContent = label;
      if(source !== 'popup') document.getElementById('nutrient-'+k).value = nutrients[k];
      if(source !== 'sidebar') document.getElementById('nutrient-side-'+k).value = nutrients[k];
    });
    document.getElementById('nutrient-ec-val').textContent = ecLabel;
    document.getElementById('nutrient-side-ec-val').textContent = ecLabel;
  }
  function refreshChemUI(source){
    const phLabel = chemTargets.pH.toFixed(1);
    const tempLabel = chemTargets.temp.toFixed(1) + '°C';
    document.getElementById('chem-pH-val').textContent = phLabel;
    document.getElementById('chem-side-pH-val').textContent = phLabel;
    document.getElementById('chem-temp-val').textContent = tempLabel;
    document.getElementById('chem-side-temp-val').textContent = tempLabel;
    if(source !== 'popup'){
      document.getElementById('chem-pH').value = chemTargets.pH;
      document.getElementById('chem-temp').value = chemTargets.temp;
    }
    if(source !== 'sidebar'){
      document.getElementById('chem-side-pH').value = chemTargets.pH;
      document.getElementById('chem-side-temp').value = chemTargets.temp;
    }
  }
  document.getElementById('chem-pH').addEventListener('input', (e)=>{
    chemTargets.pH = parseFloat(e.target.value);
    refreshChemUI('popup'); updateDoseScreen();
  });
  document.getElementById('chem-side-pH').addEventListener('input', (e)=>{
    chemTargets.pH = parseFloat(e.target.value);
    refreshChemUI('sidebar'); updateDoseScreen();
  });
  document.getElementById('chem-temp').addEventListener('input', (e)=>{
    chemTargets.temp = parseFloat(e.target.value);
    refreshChemUI('popup'); updateDoseScreen();
  });
  document.getElementById('chem-side-temp').addEventListener('input', (e)=>{
    chemTargets.temp = parseFloat(e.target.value);
    refreshChemUI('sidebar'); updateDoseScreen();
  });
  refreshChemUI();
  NUTRIENT_KEYS.forEach(k=>{
    document.getElementById('nutrient-'+k).addEventListener('input', (e)=>{
      nutrients[k] = parseInt(e.target.value, 10);
      refreshNutrientUI('popup');
      updateDoseScreen();
    });
    document.getElementById('nutrient-side-'+k).addEventListener('input', (e)=>{
      nutrients[k] = parseInt(e.target.value, 10);
      refreshNutrientUI('sidebar');
      updateDoseScreen();
    });
  });
  refreshNutrientUI();
  updateDoseScreen();

  const nutrientPopup = document.getElementById('nutrient-popup');
  const nutrientBackdrop = document.getElementById('nutrient-backdrop');
  function openNutrientPopup(){
    nutrientPopup.style.display = 'block';
    nutrientBackdrop.style.display = 'block';
  }
  function closeNutrientPopup(){
    nutrientPopup.style.display = 'none';
    nutrientBackdrop.style.display = 'none';
  }
  document.getElementById('nutrient-close').addEventListener('click', closeNutrientPopup);
  nutrientBackdrop.addEventListener('click', closeNutrientPopup);
  window.addEventListener('keydown', (e)=>{
    if(e.key === 'Escape'){
      closeNutrientPopup(); closeLightPopup();
      if(connecting.active){ cancelConnecting(); showToast('Connection cancelled', true); }
      hideCtxMenu();
    }
  });

  const rackGroup = new THREE.Group();
  rackGroup.position.y = RES_H;
  scene.add(rackGroup);

  const baseMat = new THREE.MeshStandardMaterial({color:0xb7bcb3, roughness:0.55, metalness:0.06});
  const base = new THREE.Mesh(new THREE.BoxGeometry(resW, 0.14, resD), baseMat);
  base.position.set(0, 0.07, 0);
  base.receiveShadow = true; base.castShadow = true;
  rackGroup.add(base);

  const channelMat = new THREE.MeshStandardMaterial({color:0xe3e8dc, roughness:0.5, metalness:0.03});
  const holeMat = new THREE.MeshStandardMaterial({color:0x14181a, roughness:0.75});
  const ringMat = new THREE.MeshStandardMaterial({color:0x9aa39c, roughness:0.32, metalness:0.35});

  const holeMeshes = [];
  const holeState = [];

  for(let c=0; c<CHANNELS; c++){
    const cx = startX + c*CHAN_GAP;
    const channel = new THREE.Mesh(new THREE.BoxGeometry(CHAN_W, CHAN_H, CHAN_LEN), channelMat);
    channel.position.set(cx, 0.14 + CHAN_H/2, 0);
    channel.castShadow = true; channel.receiveShadow = true;
    rackGroup.add(channel);

    for(let h=0; h<HOLES_PER_CHANNEL; h++){
      const cz = startZ + h*HOLE_SPACING;
      const topY = 0.14 + CHAN_H;

      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.185, 0.03, 8, 20), ringMat);
      ring.rotation.x = Math.PI/2;
      ring.position.set(cx, topY + 0.005, cz);
      rackGroup.add(ring);

      const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.04, 20), holeMat);
      hole.position.set(cx, topY, cz);
      hole.userData.holeIndex = holeState.length;
      rackGroup.add(hole);
      holeMeshes.push(hole);

      holeState.push({ cocopeat:null, plant:null, worldPos:new THREE.Vector3(cx, topY, cz) });
    }
  }

  const spotTargetsGroup = new THREE.Group();
  scene.add(spotTargetsGroup);
  const spotLights = [];

  // ============================================================
  // WATER RESERVOIR — full-size IBC-style tote (cage + rigid tank),
  // draggable with the right mouse button
  // ============================================================
  const cageW = 1.9, cageH = 1.5, cageD = 1.7;
  const resX = totalWidth/2 + 3.4;
  const resZ = frontZ + 0.6;

  const reservoirGroup = new THREE.Group();
  reservoirGroup.position.set(resX, 0, resZ);
  scene.add(reservoirGroup);

  const palletMat = new THREE.MeshStandardMaterial({color:0x30261c, roughness:0.85});
  const pallet = new THREE.Mesh(new THREE.BoxGeometry(cageW+0.16, 0.13, cageD+0.16), palletMat);
  pallet.position.set(0, 0.065, 0);
  pallet.castShadow = true; pallet.receiveShadow = true;
  reservoirGroup.add(pallet);

  const tankW = cageW - 0.12, tankH = cageH - 0.16, tankD = cageD - 0.12;
  const tankMat = new THREE.MeshPhysicalMaterial({
    color:0xe6f3fb, transparent:true, opacity:0.24, roughness:0.18, metalness:0, clearcoat:0.5, clearcoatRoughness:0.3, side:THREE.DoubleSide
  });
  const tankBody = new THREE.Mesh(new THREE.BoxGeometry(tankW, tankH, tankD), tankMat);
  tankBody.position.set(0, 0.13 + tankH/2, 0);
  tankBody.castShadow = true; tankBody.receiveShadow = true;
  reservoirGroup.add(tankBody);

  const tankEdges = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(tankW, tankH, tankD)),
    new THREE.LineBasicMaterial({color:0xffffff, transparent:true, opacity:0.3})
  );
  tankEdges.position.copy(tankBody.position);
  reservoirGroup.add(tankEdges);

  const innerPad = 0.05;
  const resWaterMat = new THREE.MeshStandardMaterial({color:0x2f8fd0, transparent:true, opacity:0.78, roughness:0.14, metalness:0.2});
  const tankWater = new THREE.Mesh(new THREE.BoxGeometry(tankW - innerPad*2, 1, tankD - innerPad*2), resWaterMat);
  reservoirGroup.add(tankWater);

  const resGlow = new THREE.PointLight(0x3fb0ff, 0.45, 5, 2);
  resGlow.position.set(0, 0.13 + tankH*0.4, 0);
  reservoirGroup.add(resGlow);

  // screw cap on top
  const capMat = new THREE.MeshStandardMaterial({color:0x23282a, roughness:0.5, metalness:0.3});
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.15,0.15,0.07,20), capMat);
  cap.position.set(0, 0.13 + tankH + 0.03, 0);
  cap.castShadow = true;
  reservoirGroup.add(cap);

  // cage (welded-wire frame)
  const cageMat = new THREE.MeshStandardMaterial({color:0xe7eae6, roughness:0.4, metalness:0.55});
  const cageGroup = new THREE.Group();
  cageGroup.position.set(0, 0.13, 0);
  reservoirGroup.add(cageGroup);

  function addBar(p1, p2, r, mat, parent){
    const dir = new THREE.Vector3().subVectors(p2,p1);
    const len = dir.length();
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(r,r,len,8), mat);
    bar.position.copy(p1).add(dir.clone().multiplyScalar(0.5));
    bar.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), dir.clone().normalize());
    bar.castShadow = true;
    parent.add(bar);
  }
  const hw = cageW/2, hd = cageD/2, ch = cageH;
  const corners = [
    new THREE.Vector3(-hw,0,-hd), new THREE.Vector3(hw,0,-hd),
    new THREE.Vector3(hw,0,hd), new THREE.Vector3(-hw,0,hd)
  ];
  corners.forEach(c=> addBar(c, new THREE.Vector3(c.x, ch, c.z), 0.028, cageMat, cageGroup));
  for(let i=0;i<4;i++){
    const a = corners[i], b = corners[(i+1)%4];
    addBar(a,b,0.022, cageMat, cageGroup);
    addBar(new THREE.Vector3(a.x,ch,a.z), new THREE.Vector3(b.x,ch,b.z), 0.022, cageMat, cageGroup);
    addBar(new THREE.Vector3(a.x,ch*0.33,a.z), new THREE.Vector3(b.x,ch*0.33,b.z), 0.017, cageMat, cageGroup);
    addBar(new THREE.Vector3(a.x,ch*0.66,a.z), new THREE.Vector3(b.x,ch*0.66,b.z), 0.017, cageMat, cageGroup);
  }

  // bottom-front spigot / drain valve -- this is the hose connection point
  // the drain valve faces -X, i.e. straight at the pump, so the feed
  // hose runs in one clean sweep instead of wrapping around the tote
  const valveMat = new THREE.MeshStandardMaterial({color:0x2f6fa8, roughness:0.3, metalness:0.4});
  const valveLocal = new THREE.Vector3(-(tankW/2 + 0.08), 0.30, 0);
  const valveBody = new THREE.Mesh(new THREE.CylinderGeometry(0.075,0.075,0.2,14), valveMat);
  valveBody.rotation.z = Math.PI/2;
  valveBody.position.copy(valveLocal);
  reservoirGroup.add(valveBody);
  const valveHandle = new THREE.Mesh(new THREE.BoxGeometry(0.03,0.03,0.16), new THREE.MeshStandardMaterial({color:0xdc4545, roughness:0.4}));
  valveHandle.position.copy(valveLocal).add(new THREE.Vector3(-0.02,0.09,0));
  reservoirGroup.add(valveHandle);

  // invisible hit-box for right-click grabbing (moves with the group)
  const reservoirHitBox = new THREE.Mesh(
    new THREE.BoxGeometry(cageW+0.3, cageH+0.3, cageD+0.3),
    new THREE.MeshBasicMaterial({visible:false})
  );
  reservoirHitBox.position.set(0, cageH/2, 0);
  reservoirGroup.add(reservoirHitBox);

  // live world position of the drain valve (updates as the tote is dragged)
  const resPortPos = new THREE.Vector3();
  function updateResPortPos(){
    resPortPos.copy(reservoirGroup.position).add(valveLocal).add(new THREE.Vector3(-0.1,0,0));
  }
  updateResPortPos();
  const reservoirPortKnobMat = new THREE.MeshStandardMaterial({color:0x22302a, emissive:PORT_UNCONNECTED, emissiveIntensity:0.9, roughness:0.4});
  const reservoirPortKnob = new THREE.Mesh(new THREE.SphereGeometry(0.1,14,14), reservoirPortKnobMat);
  reservoirPortKnob.position.copy(resPortPos);
  scene.add(reservoirPortKnob);

  // ============================================================
  // ELECTRIC PUMP — freestanding, well apart from the tote.
  // Sized up, and the volute now faces the reservoir with both ports
  // firing sideways (not straight up/down) so the hoses read as a
  // single clean sweep instead of a tall vertical loop.
  // ============================================================
  const pumpBaseX = resX - 2.7;
  const pumpBaseZ = resZ + 0.15;

  const pumpGroup = new THREE.Group();
  pumpGroup.position.set(pumpBaseX, 0, pumpBaseZ);
  scene.add(pumpGroup);

  const skidMat = new THREE.MeshStandardMaterial({color:0x23282a, roughness:0.6, metalness:0.2});
  const skid = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.12, 0.92), skidMat);
  skid.position.set(0, 0.06, 0);
  skid.castShadow = true; skid.receiveShadow = true;
  pumpGroup.add(skid);
  const footMat = new THREE.MeshStandardMaterial({color:0x0d0f10, roughness:0.7});
  [[-0.68,-0.36],[0.68,-0.36],[-0.68,0.36],[0.68,0.36]].forEach(([fx,fz])=>{
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.065,0.065,0.06,12), footMat);
    foot.position.set(fx, 0.03, fz);
    pumpGroup.add(foot);
  });

  const motorMat = new THREE.MeshStandardMaterial({color:0x272c2f, roughness:0.42, metalness:0.55});
  const motorRadius = 0.28, motorLen = 0.88, motorX = -0.1, motorY = 0.12 + motorRadius;
  const motor = new THREE.Mesh(new THREE.CylinderGeometry(motorRadius, motorRadius, motorLen, 26), motorMat);
  motor.rotation.z = Math.PI/2;
  motor.position.set(motorX, motorY, 0);
  motor.castShadow = true;
  pumpGroup.add(motor);

  const finMat = new THREE.MeshStandardMaterial({color:0x3a4044, roughness:0.4, metalness:0.5});
  for(let i=0;i<8;i++){
    const fin = new THREE.Mesh(new THREE.TorusGeometry(motorRadius+0.016, 0.016, 8, 20), finMat);
    fin.rotation.y = Math.PI/2;
    fin.position.set(motorX - motorLen/2 + 0.12 + i*0.095, motorY, 0);
    pumpGroup.add(fin);
  }
  const fanCap = new THREE.Mesh(new THREE.CylinderGeometry(motorRadius*0.98, motorRadius*0.98, 0.025, 26), new THREE.MeshStandardMaterial({color:0x14171a, roughness:0.6}));
  fanCap.rotation.z = Math.PI/2;
  fanCap.position.set(motorX - motorLen/2 - 0.013, motorY, 0);
  pumpGroup.add(fanCap);

  const fanBlade = new THREE.Mesh(new THREE.TorusGeometry(motorRadius*0.7, 0.038, 8, 20), new THREE.MeshStandardMaterial({color:0x2f6fe0, roughness:0.3, metalness:0.5}));
  fanBlade.rotation.y = Math.PI/2;
  fanBlade.position.set(motorX - motorLen/2 - 0.02, motorY, 0);
  pumpGroup.add(fanBlade);

  // volute sits at the +X end of the motor -- i.e. facing the reservoir
  const voluteMat = new THREE.MeshStandardMaterial({color:0x2f6fa8, roughness:0.28, metalness:0.4});
  const voluteRadius = 0.38;
  const voluteX = motorX + motorLen/2 + 0.14;
  const volute = new THREE.Mesh(new THREE.CylinderGeometry(voluteRadius, voluteRadius, 0.3, 30), voluteMat);
  volute.rotation.z = Math.PI/2;
  volute.position.set(voluteX, motorY, 0);
  volute.castShadow = true;
  pumpGroup.add(volute);
  const voluteCap = new THREE.Mesh(new THREE.CylinderGeometry(voluteRadius+0.02, voluteRadius+0.02, 0.04, 30), new THREE.MeshStandardMaterial({color:0x1f4d78, roughness:0.35, metalness:0.4}));
  voluteCap.rotation.z = Math.PI/2;
  voluteCap.position.set(voluteX + 0.16, motorY, 0);
  pumpGroup.add(voluteCap);

  const boxMat = new THREE.MeshStandardMaterial({color:0x1b2024, roughness:0.4, metalness:0.35});
  const controlBox = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.28, 0.34), boxMat);
  const controlY = motorY + motorRadius + 0.16;
  controlBox.position.set(motorX, controlY, 0);
  controlBox.castShadow = true;
  pumpGroup.add(controlBox);

  // switch mounted on the control box's -X face (the side that faces
  // the grow bed / the camera) with a lit "SWITCH" label above it
  function makeLabelTexture(text){
    const c = document.createElement('canvas'); c.width = 256; c.height = 96;
    const ctx = c.getContext('2d');
    ctx.fillStyle = 'rgba(0,0,0,0)'; ctx.fillRect(0,0,256,96);
    ctx.font = "700 46px 'Space Grotesk', sans-serif";
    ctx.fillStyle = '#e6f3ec';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 50);
    const tex = new THREE.CanvasTexture(c);
    return tex;
  }
  const switchSideX = -0.21; // box half-width (0.21) -- mounts flush on the -X face
  const switchSurfaceX = motorX + switchSideX;
  const switchPlateMat = new THREE.MeshStandardMaterial({color:0x1c2023, roughness:0.5, metalness:0.4});
  const switchPlate = new THREE.Mesh(new THREE.BoxGeometry(0.035,0.26,0.17), switchPlateMat);
  switchPlate.position.set(switchSurfaceX, controlY, 0);
  pumpGroup.add(switchPlate);

  // chrome bezel nut the toggle pivots out of
  const bezelMat = new THREE.MeshStandardMaterial({color:0xcfd5da, roughness:0.22, metalness:0.9});
  const switchBezel = new THREE.Mesh(new THREE.CylinderGeometry(0.058,0.058,0.03,24), bezelMat);
  switchBezel.rotation.z = Math.PI/2;
  switchBezel.position.set(switchSurfaceX - 0.02, controlY - 0.03, 0);
  pumpGroup.add(switchBezel);
  const switchBezelRing = new THREE.Mesh(new THREE.TorusGeometry(0.058,0.007,10,24), bezelMat);
  switchBezelRing.rotation.y = Math.PI/2;
  switchBezelRing.position.set(switchSurfaceX - 0.006, controlY - 0.03, 0);
  pumpGroup.add(switchBezelRing);

  // bat-handle toggle lever: tapered shaft + rounded tip, pivots out of the bezel
  const leverMat = new THREE.MeshStandardMaterial({color:0xff5566, emissive:0xff5566, emissiveIntensity:0.6, roughness:0.3, metalness:0.2});
  const switchLever = new THREE.Group();
  const leverShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.02,0.028,0.16,14), leverMat);
  leverShaft.position.set(0, 0.08, 0);
  switchLever.add(leverShaft);
  const leverTip = new THREE.Mesh(new THREE.SphereGeometry(0.032,16,16), leverMat);
  leverTip.position.set(0, 0.158, 0);
  switchLever.add(leverTip);
  switchLever.position.set(switchSurfaceX - 0.02, controlY - 0.03, 0);
  pumpGroup.add(switchLever);

  const switchHit = new THREE.Mesh(new THREE.BoxGeometry(0.24,0.4,0.32), new THREE.MeshBasicMaterial({visible:false}));
  switchHit.position.set(switchSurfaceX, controlY, 0);
  pumpGroup.add(switchHit);

  const switchLabel = new THREE.Mesh(
    new THREE.PlaneGeometry(0.34, 0.13),
    new THREE.MeshBasicMaterial({map: makeLabelTexture('SWITCH'), transparent:true})
  );
  switchLabel.position.set(switchSurfaceX - 0.018, controlY + 0.21, 0);
  switchLabel.rotation.y = -Math.PI/2;
  pumpGroup.add(switchLabel);

  const pumpLedMat = new THREE.MeshStandardMaterial({color:0x222, emissive:0xff5566, emissiveIntensity:1.6, roughness:0.3});
  const pumpLed = new THREE.Mesh(new THREE.SphereGeometry(0.045,12,12), pumpLedMat);
  pumpLed.position.set(switchSurfaceX - 0.025, controlY + 0.14, 0);
  pumpGroup.add(pumpLed);
  const pumpLedRing = new THREE.Mesh(new THREE.TorusGeometry(0.055,0.007,8,20), bezelMat);
  pumpLedRing.rotation.y = Math.PI/2;
  pumpLedRing.position.set(switchSurfaceX - 0.008, controlY + 0.14, 0);
  pumpGroup.add(pumpLedRing);
  const pumpLedGlow = new THREE.PointLight(0xff5566, 0.5, 0.9, 2);
  pumpLedGlow.position.set(switchSurfaceX - 0.03, controlY + 0.14, 0);
  pumpGroup.add(pumpLedGlow);

  const badge = new THREE.Mesh(new THREE.CylinderGeometry(0.14,0.14,0.028,22), new THREE.MeshStandardMaterial({color:0x2f6fe0, roughness:0.3, metalness:0.4}));
  badge.rotation.x = Math.PI/2;
  badge.position.set(motorX, controlY - 0.11, 0.185);
  pumpGroup.add(badge);

  // both ports fire sideways off the volute (+X toward the reservoir,
  // +Z toward the grow bed's overhead run) instead of straight up/down
  const portMat = new THREE.MeshStandardMaterial({color:0xdfe3e0, roughness:0.3, metalness:0.35});
  const inletStub = new THREE.Mesh(new THREE.CylinderGeometry(0.08,0.08,0.26,16), portMat);
  inletStub.rotation.z = Math.PI/2;
  inletStub.position.set(voluteX + 0.29, motorY, 0);
  pumpGroup.add(inletStub);

  const outletStub = new THREE.Mesh(new THREE.CylinderGeometry(0.08,0.08,0.26,16), portMat);
  outletStub.rotation.x = Math.PI/2;
  outletStub.position.set(voluteX - 0.08, motorY, 0.29);
  pumpGroup.add(outletStub);

  // right-click anywhere on the pump to get the plumbing menu
  const pumpHitBox = new THREE.Mesh(
    new THREE.BoxGeometry(1.75, 1.7, 1.1),
    new THREE.MeshBasicMaterial({visible:false})
  );
  pumpHitBox.position.set(motorX + 0.1, 0.7, 0.05);
  pumpGroup.add(pumpHitBox);

  {
    const cableMat = new THREE.MeshStandardMaterial({color:0x101214, roughness:0.6});
    const p0 = new THREE.Vector3(motorX, controlY - 0.08, -0.15).add(pumpGroup.position);
    const p1 = new THREE.Vector3(motorX - 0.65, 0.01, -0.6).add(pumpGroup.position);
    const mid = new THREE.Vector3((p0.x+p1.x)/2, 0.12, (p0.z+p1.z)/2);
    const cableCurve = new THREE.CatmullRomCurve3([p0, mid, p1]);
    const cableMesh = new THREE.Mesh(new THREE.TubeGeometry(cableCurve, 20, 0.017, 6, false), cableMat);
    scene.add(cableMesh);
  }

  const pumpInletWorld = new THREE.Vector3(voluteX + 0.42, motorY, 0).add(pumpGroup.position);
  const pumpOutletWorld = new THREE.Vector3(voluteX - 0.08, motorY, 0.42).add(pumpGroup.position);

  // ============================================================
  // PIPEWORK — realistic reinforced hose (thicker, ribbed, clamped)
  // ============================================================
  function makeHoseTexture(){
    const c = document.createElement('canvas'); c.width = 128; c.height = 128;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#2c5f86'; ctx.fillRect(0,0,128,128);
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 9;
    for(let i=-128;i<256;i+=24){
      ctx.beginPath(); ctx.moveTo(i,128); ctx.lineTo(i+128,0); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.lineWidth = 3;
    for(let i=-128;i<256;i+=24){
      ctx.beginPath(); ctx.moveTo(i-6,128); ctx.lineTo(i+122,0); ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }
  const hoseTex = makeHoseTexture();
  hoseTex.repeat.set(2.2, 10);
  const hoseMat = new THREE.MeshPhysicalMaterial({
    color:0xffffff, map:hoseTex, roughness:0.55, metalness:0.05, clearcoat:0.35, clearcoatRoughness:0.4
  });
  const PIPE_R = 0.105;

  function buildCurve(pA, pB, arcHeight){
    const mid = new THREE.Vector3((pA.x+pB.x)/2, Math.max(pA.y,pB.y) + arcHeight, (pA.z+pB.z)/2);
    return new THREE.CatmullRomCurve3([pA.clone(), mid, pB.clone()]);
  }
  function tubeFromCurve(curve, radius){ return new THREE.TubeGeometry(curve, 44, radius, 14, false); }

  // ---- connect animation: hoses extend from source to target and clamps
  // pop into place with a little overshoot, instead of just appearing ----
  function easeOutCubic(t){ return 1 - Math.pow(1-t, 3); }
  function easeOutBack(t){ const c1=1.70158, c3=c1+1; return 1 + c3*Math.pow(t-1,3) + c1*Math.pow(t-1,2); }
  function partialCurvePoints(curve, frac, N){
    const pts = [];
    for(let i=0;i<=N;i++) pts.push(curve.getPoint(Math.min(1, (i/N)*frac)));
    return pts;
  }
  const growingPipes = [];
  const growingClamps = [];
  const connectPulses = [];
  function growPipe(edge, curve, duration){
    for(let i=growingPipes.length-1;i>=0;i--) if(growingPipes[i].edge===edge) growingPipes.splice(i,1);
    growingPipes.push({edge, curve, start:performance.now(), duration});
  }
  function stopGrowing(edge){
    for(let i=growingPipes.length-1;i>=0;i--) if(growingPipes[i].edge===edge) growingPipes.splice(i,1);
  }
  function popInClamp(mesh, duration){
    mesh.scale.setScalar(0.001);
    growingClamps.push({mesh, start:performance.now(), duration});
  }
  function spawnConnectPulse(pos){
    const mat = new THREE.MeshBasicMaterial({color:PORT_CONNECTED, transparent:true, opacity:0.85});
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 14), mat);
    mesh.position.copy(pos);
    scene.add(mesh);
    connectPulses.push({mesh, mat, start:performance.now(), duration:480});
  }
  function updateConnectAnimations(now){
    for(let i=growingPipes.length-1;i>=0;i--){
      const gp = growingPipes[i];
      const t = (now - gp.start) / gp.duration;
      if(t >= 1){
        gp.edge.pipe.geometry.dispose();
        gp.edge.pipe.geometry = tubeFromCurve(gp.curve, PIPE_R);
        growingPipes.splice(i,1);
        continue;
      }
      const frac = Math.max(0.02, easeOutCubic(t));
      const sub = new THREE.CatmullRomCurve3(partialCurvePoints(gp.curve, frac, 28));
      gp.edge.pipe.geometry.dispose();
      gp.edge.pipe.geometry = tubeFromCurve(sub, PIPE_R);
    }
    for(let i=growingClamps.length-1;i>=0;i--){
      const gc = growingClamps[i];
      const t = (now - gc.start) / gc.duration;
      if(t >= 1){ gc.mesh.scale.setScalar(1); growingClamps.splice(i,1); continue; }
      gc.mesh.scale.setScalar(Math.max(0.001, easeOutBack(t)));
    }
    for(let i=connectPulses.length-1;i>=0;i--){
      const p = connectPulses[i];
      const t = (now - p.start) / p.duration;
      if(t >= 1){ scene.remove(p.mesh); p.mesh.geometry.dispose(); p.mat.dispose(); connectPulses.splice(i,1); continue; }
      p.mesh.scale.setScalar(0.5 + t*1.6);
      p.mat.opacity = 0.85*(1-t);
    }
  }

  const clampMat = new THREE.MeshStandardMaterial({color:0xcfd4d0, roughness:0.3, metalness:0.7});
  function makeClamp(){
    const clamp = new THREE.Mesh(new THREE.TorusGeometry(PIPE_R+0.012, 0.02, 10, 20), clampMat);
    scene.add(clamp);
    return clamp;
  }
  function orientClampAt(clamp, curve, t){
    const p = curve.getPoint(t);
    const tan = curve.getTangent(t);
    clamp.position.copy(p);
    clamp.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1), tan);
  }

  // Pipe A: reservoir drain valve <-> pump inlet (built only once connected;
  // rebuilt live while the reservoir is dragged)
  const edgeResPump = {connected:false, pipe:null, clamp1:null, clamp2:null, curve:null};
  function connectResPump(){
    if(edgeResPump.connected) return;
    const curve = buildCurve(resPortPos, pumpInletWorld, 0.3);
    const mesh = new THREE.Mesh(tubeFromCurve(curve, PIPE_R), hoseMat);
    mesh.castShadow = true;
    scene.add(mesh);
    const c1 = makeClamp(), c2 = makeClamp();
    orientClampAt(c1, curve, 0.04);
    orientClampAt(c2, curve, 0.96);
    popInClamp(c1, 260); popInClamp(c2, 260);
    edgeResPump.pipe = mesh; edgeResPump.curve = curve;
    edgeResPump.clamp1 = c1; edgeResPump.clamp2 = c2; edgeResPump.connected = true;
    growPipe(edgeResPump, curve, 420);
    spawnConnectPulse(resPortPos); spawnConnectPulse(pumpInletWorld);
    reservoirPortKnobMat.emissive.set(PORT_CONNECTED);
    refreshPlumbingUI();
  }
  function disconnectResPump(){
    if(!edgeResPump.connected) return;
    stopGrowing(edgeResPump);
    scene.remove(edgeResPump.pipe, edgeResPump.clamp1, edgeResPump.clamp2);
    edgeResPump.pipe.geometry.dispose();
    edgeResPump.connected = false; edgeResPump.pipe = null; edgeResPump.curve = null;
    edgeResPump.clamp1 = null; edgeResPump.clamp2 = null;
    reservoirPortKnobMat.emissive.set(PORT_UNCONNECTED);
    refreshPlumbingUI();
  }
  function rebuildResPumpPipe(){
    if(!edgeResPump.connected) return;
    stopGrowing(edgeResPump);
    const curve = buildCurve(resPortPos, pumpInletWorld, 0.3);
    edgeResPump.pipe.geometry.dispose();
    edgeResPump.pipe.geometry = tubeFromCurve(curve, PIPE_R);
    edgeResPump.curve = curve;
    orientClampAt(edgeResPump.clamp1, curve, 0.04);
    orientClampAt(edgeResPump.clamp2, curve, 0.96);
  }

  // Pipe B: pump outlet <-> whichever grow-bed port was chosen
  const edgeGrowbed = {connected:false, targetIndex:-1, pipe:null, clamp1:null, clamp2:null, curve:null};
  function connectGrowbed(targetIndex){
    if(edgeGrowbed.connected) disconnectGrowbed();
    const port = growbedPorts[targetIndex];
    const curve = buildCurve(pumpOutletWorld, port.pos, 0.55);
    const mesh = new THREE.Mesh(tubeFromCurve(curve, PIPE_R), hoseMat);
    mesh.castShadow = true;
    scene.add(mesh);
    const c1 = makeClamp(), c2 = makeClamp();
    orientClampAt(c1, curve, 0.03);
    orientClampAt(c2, curve, 0.97);
    popInClamp(c1, 260); popInClamp(c2, 260);
    edgeGrowbed.pipe = mesh; edgeGrowbed.curve = curve;
    edgeGrowbed.clamp1 = c1; edgeGrowbed.clamp2 = c2;
    edgeGrowbed.connected = true; edgeGrowbed.targetIndex = targetIndex;
    growPipe(edgeGrowbed, curve, 420);
    spawnConnectPulse(pumpOutletWorld); spawnConnectPulse(port.pos);
    port.connected = true;
    port.knobMat.emissive.set(PORT_CONNECTED);
    refreshPlumbingUI();
  }
  function disconnectGrowbed(){
    if(!edgeGrowbed.connected) return;
    stopGrowing(edgeGrowbed);
    scene.remove(edgeGrowbed.pipe, edgeGrowbed.clamp1, edgeGrowbed.clamp2);
    edgeGrowbed.pipe.geometry.dispose();
    growbedPorts[edgeGrowbed.targetIndex].connected = false;
    growbedPorts[edgeGrowbed.targetIndex].knobMat.emissive.set(PORT_UNCONNECTED);
    edgeGrowbed.connected = false; edgeGrowbed.pipe = null; edgeGrowbed.curve = null;
    edgeGrowbed.clamp1 = null; edgeGrowbed.clamp2 = null; edgeGrowbed.targetIndex = -1;
    refreshPlumbingUI();
  }

  function flowActive(){ return edgeResPump.connected && edgeGrowbed.connected && pumpOn; }
  function refreshPlumbingUI(){
    const c1 = document.getElementById('conn-res');
    const c2 = document.getElementById('conn-bed');
    c1.textContent = edgeResPump.connected ? 'connected' : 'not connected';
    c1.className = edgeResPump.connected ? 'yes' : 'no';
    c2.textContent = edgeGrowbed.connected ? 'connected' : 'not connected';
    c2.className = edgeGrowbed.connected ? 'yes' : 'no';
    const flow = document.getElementById('flow-state');
    const active = flowActive();
    flow.textContent = active ? 'yes' : 'no';
    flow.className = active ? 'yes' : 'no';
  }

  const fittingMat1 = new THREE.MeshStandardMaterial({color:0x22302a, emissive:PORT_UNCONNECTED, emissiveIntensity:0.9, roughness:0.4});
  const fittingMat2 = new THREE.MeshStandardMaterial({color:0x22302a, emissive:PORT_UNCONNECTED, emissiveIntensity:0.9, roughness:0.4});
  const fittingPump = new THREE.Mesh(new THREE.SphereGeometry(0.11,12,12), fittingMat1);
  fittingPump.position.copy(pumpInletWorld); scene.add(fittingPump);
  const fittingPumpOut = new THREE.Mesh(new THREE.SphereGeometry(0.11,12,12), fittingMat2);
  fittingPumpOut.position.copy(pumpOutletWorld); scene.add(fittingPumpOut);

  const FLOW_PARTICLES = 10;
  const flowMat = new THREE.MeshStandardMaterial({color:0x9fe8ff, emissive:0x4fb0e8, emissiveIntensity:1.4, roughness:0.2});
  const flowParticles = [];
  for(let i=0;i<FLOW_PARTICLES;i++){
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), flowMat);
    m.userData.t = i / FLOW_PARTICLES;
    m.visible = false;
    scene.add(m);
    flowParticles.push(m);
  }
  function pointOnFullPath(t){
    if(!edgeResPump.curve || !edgeGrowbed.curve) return null;
    if(t < 0.5) return edgeResPump.curve.getPoint(t*2);
    return edgeGrowbed.curve.getPoint((t-0.5)*2);
  }

  // ============================================================
  // GROW LIGHTS (bars) + their aimed spotlights
  // ============================================================
  function ledTexture(){
    const c = document.createElement('canvas'); c.width = 256; c.height = 32;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#0c0c10'; ctx.fillRect(0,0,256,32);
    const cols = ['#ff3d63','#ff3d63','#4a7bff','#ff3d63','#c85bff','#4a7bff','#ff3d63'];
    for(let i=0;i<64;i++){
      ctx.fillStyle = cols[i % cols.length];
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.arc(4 + i*3.9, 16 + (Math.random()*4-2), 1.6, 0, Math.PI*2);
      ctx.fill();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }
  const ledMat = new THREE.MeshStandardMaterial({
    color:0x1a1a1f, emissive:0xffffff, emissiveMap:ledTexture(), emissiveIntensity:1.5, roughness:0.6
  });
  const barCaseMat = new THREE.MeshStandardMaterial({color:0x14161a, roughness:0.5, metalness:0.3});

  const lightGroup = new THREE.Group();
  const lightY = RES_H + 3.6;
  const barCount = 3;
  const lightHitMeshes = [];
  for(let i=0;i<barCount;i++){
    const bx = -totalWidth*0.32 + i * (totalWidth*0.32);
    const bar = new THREE.Group();
    const casing = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.08, CHAN_LEN + 0.6), barCaseMat);
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.02, CHAN_LEN + 0.55), ledMat);
    led.position.y = -0.045;
    bar.add(casing, led);
    bar.position.set(bx, lightY, 0.1);
    bar.rotation.z = (i - 1) * 0.05;
    lightGroup.add(bar);
    lightHitMeshes.push(casing, led);

    [-CHAN_LEN/2 + 0.3, CHAN_LEN/2 - 0.3].forEach(wz=>{
      const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.012,0.012, 1.7, 6), new THREE.MeshBasicMaterial({color:0x111214}));
      wire.position.set(bx, lightY + 0.85, wz);
      lightGroup.add(wire);
    });

    const spot = new THREE.SpotLight(0xffeaf2, 0, 9, 0.62, 0.55, 1.4);
    spot.position.set(bx, lightY - 0.15, 0.1);
    const spotTarget = new THREE.Object3D();
    spotTarget.position.set(bx, RES_H + 0.3, 0);
    spotTargetsGroup.add(spotTarget);
    spot.target = spotTarget;
    scene.add(spot);
    spotLights.push(spot);
  }
  scene.add(lightGroup);
  glowPink.position.set(-1.4, lightY - 0.6, 0);
  glowBlue.position.set(1.4, lightY - 0.6, 0);

  const PPFD_MAX = 800;
  const lightSlider = document.getElementById('light-slider');
  const lightValEl = document.getElementById('light-val');
  const lightPopupSlider = document.getElementById('light-popup-slider');
  const lightPopupValEl = document.getElementById('light-popup-val');
  function applyLightIntensity(ppfd, source){
    const f = ppfd / PPFD_MAX;
    ledMat.emissiveIntensity = 0.05 + f * 5.5;
    glowPink.intensity = BASE_PINK * (0.1 + f * 2.4);
    glowBlue.intensity = BASE_BLUE * (0.1 + f * 2.4);
    spotLights.forEach(s => s.intensity = f * 5.0);
    ambientLight.intensity = 0.14 + f * 0.22;
    const label = ppfd + ' µmol·m⁻²·s⁻¹';
    lightValEl.textContent = label;
    lightPopupValEl.textContent = label;
    if(source !== 'sidebar') lightSlider.value = ppfd;
    if(source !== 'popup') lightPopupSlider.value = ppfd;
  }
  lightSlider.addEventListener('input', (e)=> applyLightIntensity(parseInt(e.target.value,10), 'sidebar'));
  lightPopupSlider.addEventListener('input', (e)=> applyLightIntensity(parseInt(e.target.value,10), 'popup'));
  applyLightIntensity(parseInt(lightSlider.value,10));

  const lightBackdrop = document.getElementById('light-backdrop');
  const lightPopup = document.getElementById('light-popup');
  function openLightPopup(){
    lightPopupSlider.value = lightSlider.value;
    lightPopupValEl.textContent = lightValEl.textContent;
    lightPopup.style.display = 'block';
    lightBackdrop.style.display = 'block';
  }
  function closeLightPopup(){
    lightPopup.style.display = 'none';
    lightBackdrop.style.display = 'none';
  }
  document.getElementById('light-popup-close').addEventListener('click', closeLightPopup);
  lightBackdrop.addEventListener('click', closeLightPopup);

  // ============================================================
  // COCOPEAT / LETTUCE FACTORIES
  // ============================================================
  const cocopeatGeo = new THREE.CylinderGeometry(0.155, 0.14, 0.16, 14);
  const cocopeatMatBase = new THREE.MeshStandardMaterial({color:0x4a2c14, roughness:0.92});
  function makeCocopeat(){
    const m = new THREE.Mesh(cocopeatGeo, cocopeatMatBase);
    m.castShadow = true;
    return m;
  }
  const leafGeo = new THREE.SphereGeometry(0.16, 10, 8);
  function makeLettuce(){
    const g = new THREE.Group();
    const outerGreens = [0x2f5f18, 0x3d7620, 0x468426, 0x356b1c];
    const innerGreens = [0x5cae2c, 0x6bc432, 0x5aab2a];

    function addLeafRing(count, radius, heightBase, scaleXYZ, colors, tiltX){
      for(let i=0;i<count;i++){
        const mat = new THREE.MeshPhysicalMaterial({
          color: colors[i % colors.length],
          roughness: 0.5, clearcoat: 0.25, clearcoatRoughness: 0.4
        });
        const leaf = new THREE.Mesh(leafGeo, mat);
        const ang = (i / count) * Math.PI * 2 + (i % 2) * 0.18;
        const jitter = 0.85 + Math.random()*0.3;
        leaf.position.set(Math.cos(ang)*radius, heightBase + (i%2)*0.025, Math.sin(ang)*radius);
        leaf.scale.set(scaleXYZ[0]*jitter, scaleXYZ[1], scaleXYZ[2]*jitter);
        leaf.rotation.y = ang;
        leaf.rotation.x = tiltX;
        leaf.castShadow = true;
        g.add(leaf);
      }
    }

    // outer, darker, larger curled-back leaves
    addLeafRing(8, 0.115, 0.07, [0.95, 0.5, 1.25], outerGreens, -0.55);
    // inner, brighter, upright younger leaves
    addLeafRing(6, 0.06, 0.1, [0.6, 0.65, 0.8], innerGreens, -0.15);

    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.075,10,8),
      new THREE.MeshPhysicalMaterial({color:0xbfe888, roughness:0.45, clearcoat:0.3})
    );
    core.position.y = 0.1;
    core.scale.y = 0.85;
    g.add(core);
    g.scale.setScalar(0.55);
    return g;
  }


  // ============================================================
  // CAMERA ORBIT (custom, damped => buttery smooth)
  // ============================================================
  const camTarget = new THREE.Vector3(1.8, 0.6, -0.1);
  const spherical = { theta: 0.58, phi: 1.05, radius: 20.5 };
  const desired   = { theta: 0.58, phi: 1.05, radius: 20.5 };
  const MIN_PHI = 0.32, MAX_PHI = 1.45;
  const MIN_R = 7, MAX_R = 34;

  function applyCamera(){
    const sp = spherical;
    const x = camTarget.x + sp.radius * Math.sin(sp.phi) * Math.sin(sp.theta);
    const y = camTarget.y + sp.radius * Math.cos(sp.phi);
    const z = camTarget.z + sp.radius * Math.sin(sp.phi) * Math.cos(sp.theta);
    camera.position.set(x,y,z);
    camera.lookAt(camTarget);
  }
  applyCamera();

  const raycaster = new THREE.Raycaster();
  function ndcFromEvent(e){
    const rect = canvas.getBoundingClientRect();
    return new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
  }
  function pickHoleAt(e){
    raycaster.setFromCamera(ndcFromEvent(e), camera);
    const hits = raycaster.intersectObjects(holeMeshes, false);
    return hits.length ? hits[0].object.userData.holeIndex : null;
  }
  function pickSwitchAt(e){
    raycaster.setFromCamera(ndcFromEvent(e), camera);
    return raycaster.intersectObject(switchHit, false).length > 0;
  }
  function pickLightAt(e){
    raycaster.setFromCamera(ndcFromEvent(e), camera);
    return raycaster.intersectObjects(lightHitMeshes, false).length > 0;
  }
  function pickReservoirAt(e){
    raycaster.setFromCamera(ndcFromEvent(e), camera);
    return raycaster.intersectObject(reservoirHitBox, false).length > 0;
  }
  function pickDoseBoxAt(e){
    raycaster.setFromCamera(ndcFromEvent(e), camera);
    return raycaster.intersectObject(doseHitBox, false).length > 0;
  }
  function pickPumpAt(e){
    raycaster.setFromCamera(ndcFromEvent(e), camera);
    return raycaster.intersectObject(pumpHitBox, false).length > 0;
  }
  function pickGrowbedPortAt(e){
    raycaster.setFromCamera(ndcFromEvent(e), camera);
    const hits = raycaster.intersectObjects(growbedPorts.map(p=>p.knob), false);
    if(!hits.length) return -1;
    return growbedPorts.findIndex(p=>p.knob === hits[0].object);
  }

  // ---- right-click context menu ----
  const ctxMenu = document.getElementById('ctx-menu');
  function hideCtxMenu(){ ctxMenu.style.display = 'none'; ctxMenu.innerHTML = ''; }
  function buildMenu(items, x, y){
    ctxMenu.innerHTML = '';
    items.forEach(it=>{
      const b = document.createElement('button');
      b.textContent = it.label;
      if(it.cls) b.className = it.cls;
      b.addEventListener('click', ()=>{ hideCtxMenu(); it.onClick(); });
      ctxMenu.appendChild(b);
    });
    ctxMenu.style.left = x + 'px';
    ctxMenu.style.top = y + 'px';
    ctxMenu.style.display = 'block';
  }
  function openPlumbingMenu(type, index, e){
    const rect = viewport.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    const items = [];
    if(type === 'reservoir'){
      items.push({
        label: edgeResPump.connected ? 'Disconnect Pipe' : 'Connect Pipe to Pump',
        cls: edgeResPump.connected ? 'disconnect' : '',
        onClick: ()=> edgeResPump.connected ? disconnectResPump() : beginConnect('res-pump')
      });
    } else if(type === 'pump'){
      items.push({
        label: edgeResPump.connected ? 'Disconnect from Reservoir' : 'Connect Pipe to Reservoir',
        cls: edgeResPump.connected ? 'disconnect' : '',
        onClick: ()=> edgeResPump.connected ? disconnectResPump() : beginConnect('res-pump')
      });
      items.push({
        label: edgeGrowbed.connected ? 'Disconnect from Grow Bed' : 'Connect Pipe to Grow Bed',
        cls: edgeGrowbed.connected ? 'disconnect' : '',
        onClick: ()=> edgeGrowbed.connected ? disconnectGrowbed() : beginConnect('pump-growbed')
      });
    } else if(type === 'growbed'){
      const port = growbedPorts[index];
      items.push({
        label: port.connected ? 'Disconnect Pipe' : 'Connect Pipe to Pump',
        cls: port.connected ? 'disconnect' : '',
        onClick: ()=> port.connected ? disconnectGrowbed() : beginConnect('growbed-pump', index)
      });
    }
    buildMenu(items, x, y);
  }
  viewport.addEventListener('click', (e)=>{
    if(ctxMenu.style.display === 'block' && !ctxMenu.contains(e.target)) hideCtxMenu();
  });

  // ---- click-to-connect mode: a preview hose follows the cursor until
  // you left-click the matching target port (right-click / Esc cancels) ----
  const previewMat = new THREE.MeshPhysicalMaterial({color:0x9fe8ff, transparent:true, opacity:0.55, roughness:0.2});
  const connecting = { active:false, mode:null, fixedIndex:null, previewMesh:null };
  const previewPlane = new THREE.Plane();
  const previewPoint = new THREE.Vector3();

  function connectingSourcePos(){
    if(connecting.mode === 'res-pump') return pumpInletWorld;
    if(connecting.mode === 'pump-growbed') return pumpOutletWorld;
    if(connecting.mode === 'growbed-pump') return growbedPorts[connecting.fixedIndex].pos;
    return null;
  }
  // while previewing, hovering the actual valid port snaps the preview
  // hose exactly onto it (and lights it up) so there's no jump/mismatch
  // between what you see and what gets built on click
  function connectingTargetInfo(e){
    if(connecting.mode === 'res-pump'){
      if(pickReservoirAt(e)) return {pos:resPortPos, knobMat:reservoirPortKnobMat, arc:0.3};
      return null;
    }
    if(connecting.mode === 'pump-growbed'){
      const gi = pickGrowbedPortAt(e);
      if(gi >= 0) return {pos:growbedPorts[gi].pos, knobMat:growbedPorts[gi].knobMat, arc:0.55};
      return null;
    }
    if(connecting.mode === 'growbed-pump'){
      if(pickPumpAt(e)) return {pos:pumpOutletWorld, knobMat:fittingMat2, arc:0.55};
      return null;
    }
    return null;
  }
  let hoverTargetMat = null;
  function setHoverTarget(mat){
    if(hoverTargetMat && hoverTargetMat !== mat) hoverTargetMat.emissiveIntensity = 0.9;
    if(mat) mat.emissiveIntensity = 1.7;
    hoverTargetMat = mat;
  }
  function beginConnect(mode, fixedIndex){
    connecting.active = true;
    connecting.mode = mode;
    connecting.fixedIndex = (fixedIndex !== undefined ? fixedIndex : null);
    canvas.classList.add('connecting');
    showToast('Click the matching port to connect — right-click or Esc cancels');
  }
  function cancelConnecting(){
    connecting.active = false; connecting.mode = null; connecting.fixedIndex = null;
    canvas.classList.remove('connecting');
    setHoverTarget(null);
    if(connecting.previewMesh){
      scene.remove(connecting.previewMesh);
      connecting.previewMesh.geometry.dispose();
      connecting.previewMesh = null;
    }
  }
  function updateConnectingPreview(e){
    const src = connectingSourcePos();
    if(!src) return;
    const target = connectingTargetInfo(e);
    setHoverTarget(target ? target.knobMat : null);

    let endPoint, arcHeight, ready;
    if(target){
      endPoint = target.pos; arcHeight = target.arc; ready = true;
    } else {
      previewPlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0,1,0), src);
      raycaster.setFromCamera(ndcFromEvent(e), camera);
      if(!raycaster.ray.intersectPlane(previewPlane, previewPoint)) return;
      endPoint = previewPoint; arcHeight = 0.4; ready = false;
    }

    if(connecting.previewMesh){
      scene.remove(connecting.previewMesh);
      connecting.previewMesh.geometry.dispose();
    }
    const curve = buildCurve(src, endPoint, arcHeight);
    previewMat.color.set(ready ? PORT_CONNECTED : 0x9fe8ff);
    previewMat.opacity = ready ? 0.85 : 0.5;
    connecting.previewMesh = new THREE.Mesh(tubeFromCurve(curve, ready ? PIPE_R : PIPE_R*0.55), previewMat);
    scene.add(connecting.previewMesh);
  }
  function finishConnecting(e){
    let valid = false;

    if(connecting.mode === 'res-pump'){
      // valid target: the reservoir's drain-valve port only
      valid = pickReservoirAt(e);
      if(valid){
        connectResPump();
        valid = edgeResPump.connected; // re-check the edge actually got built
      }
    } else if(connecting.mode === 'pump-growbed'){
      // valid target: any one of the 3 grow-bed inlet knobs
      const gi = pickGrowbedPortAt(e);
      valid = gi >= 0;
      if(valid){
        connectGrowbed(gi);
        valid = edgeGrowbed.connected && edgeGrowbed.targetIndex === gi;
      }
    } else if(connecting.mode === 'growbed-pump'){
      // valid target: the pump only
      valid = pickPumpAt(e);
      if(valid){
        connectGrowbed(connecting.fixedIndex);
        valid = edgeGrowbed.connected && edgeGrowbed.targetIndex === connecting.fixedIndex;
      }
    }

    if(valid){
      showToast('Pipe connection successfully established');
    } else {
      showToast('Connection cancelled — not a valid port', true);
    }
    cancelConnecting();
  }

  canvas.addEventListener('contextmenu', (e)=> e.preventDefault());

  let dragging = false, lastX = 0, lastY = 0, moved = 0;
  let reservoirDragging = false, rightMoved = 0, rightLastX = 0, rightLastY = 0;
  let pendingRightHit = null;
  const reservoirTarget = new THREE.Vector3().copy(reservoirGroup.position);
  const groundHit = new THREE.Vector3();

  canvas.addEventListener('pointerdown', (e)=>{
    if(e.button === 2){
      if(connecting.active){ cancelConnecting(); showToast('Connection cancelled', true); return; }
      hideCtxMenu();
      if(pickReservoirAt(e)){
        reservoirDragging = true; rightMoved = 0;
        rightLastX = e.clientX; rightLastY = e.clientY;
        canvas.classList.add('moving');
        canvas.setPointerCapture(e.pointerId);
        return;
      }
      if(pickPumpAt(e)){ pendingRightHit = {type:'pump'}; return; }
      const gi = pickGrowbedPortAt(e);
      if(gi >= 0){ pendingRightHit = {type:'growbed', index:gi}; return; }
      pendingRightHit = null;
      return;
    }
    if(e.button !== 0) return;
    if(connecting.active){ finishConnecting(e); return; }
    dragging = true; moved = 0;
    lastX = e.clientX; lastY = e.clientY;
    canvas.classList.add('dragging');
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e)=>{
    if(connecting.active){ updateConnectingPreview(e); return; }
    if(reservoirDragging){
      rightMoved += Math.abs(e.clientX - rightLastX) + Math.abs(e.clientY - rightLastY);
      rightLastX = e.clientX; rightLastY = e.clientY;
      raycaster.setFromCamera(ndcFromEvent(e), camera);
      if(raycaster.ray.intersectPlane(groundPlane, groundHit)){
        reservoirTarget.set(groundHit.x, 0, groundHit.z);
      }
      return;
    }
    if(!dragging) return;
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    moved += Math.abs(dx) + Math.abs(dy);
    desired.theta -= dx * 0.006;
    desired.phi = Math.min(MAX_PHI, Math.max(MIN_PHI, desired.phi - dy * 0.005));
    lastX = e.clientX; lastY = e.clientY;
  });
  function endDrag(e){
    if(reservoirDragging){
      reservoirDragging = false;
      canvas.classList.remove('moving');
      if(rightMoved < 6){ openPlumbingMenu('reservoir', -1, e); }
      else { showToast('Reservoir placed'); }
      return;
    }
    if(pendingRightHit){
      if(pendingRightHit.type === 'pump') openPlumbingMenu('pump', -1, e);
      else openPlumbingMenu('growbed', pendingRightHit.index, e);
      pendingRightHit = null;
      return;
    }
    if(dragging && moved < 6){ handleClickPick(e); }
    dragging = false;
    canvas.classList.remove('dragging');
  }
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointerleave', ()=>{
    if(!reservoirDragging){ dragging=false; canvas.classList.remove('dragging'); }
  });
  canvas.addEventListener('wheel', (e)=>{
    e.preventDefault();
    desired.radius = Math.min(MAX_R, Math.max(MIN_R, desired.radius + e.deltaY * 0.012));
  }, {passive:false});

  function handleClickPick(e){
    if(pickSwitchAt(e)){ togglePump(); return; }
    if(pickLightAt(e)){ openLightPopup(); return; }
    if(pickDoseBoxAt(e)){ openNutrientPopup(); return; }
    const idx = pickHoleAt(e);
    if(idx === null) return;
    const state = holeState[idx];
    if(state.plant){
      rackGroup.remove(state.plant);
      state.plant = null;
      showToast('Removed lettuce');
      updateStats();
    } else if(state.cocopeat){
      rackGroup.remove(state.cocopeat);
      state.cocopeat = null;
      showToast('Removed cocopeat plug');
      updateStats();
    }
  }

  // ============================================================
  // DRAG & DROP PLANTING FROM SIDEBAR
  // ============================================================
  const dropHintEl = document.getElementById('dropzone-hint');
  document.querySelectorAll('.drag-item').forEach(item=>{
    item.addEventListener('dragstart', (e)=>{
      e.dataTransfer.setData('text/plain', item.dataset.type);
      e.dataTransfer.effectAllowed = 'copy';
      item.classList.add('dragging-source');
    });
    item.addEventListener('dragend', ()=> item.classList.remove('dragging-source'));
  });
  viewport.addEventListener('dragover', (e)=>{ e.preventDefault(); dropHintEl.classList.add('active'); });
  viewport.addEventListener('dragleave', ()=> dropHintEl.classList.remove('active'));
  viewport.addEventListener('drop', (e)=>{
    e.preventDefault();
    dropHintEl.classList.remove('active');
    const type = e.dataTransfer.getData('text/plain');
    const idx = pickHoleAt(e);
    if(idx === null){ showToast('Drop it right on a hole', true); return; }
    const state = holeState[idx];
    if(type === 'cocopeat'){
      if(state.cocopeat){ showToast('That hole already has cocopeat', true); return; }
      const m = makeCocopeat();
      m.position.copy(state.worldPos).add(new THREE.Vector3(0, 0.06, 0));
      rackGroup.add(m);
      state.cocopeat = m;
      showToast('Cocopeat plug placed');
    } else if(type === 'lettuce'){
      if(!state.cocopeat){ showToast('Place cocopeat here first', true); return; }
      if(state.plant){ showToast('Already planted', true); return; }
      const g = makeLettuce();
      g.position.copy(state.worldPos).add(new THREE.Vector3(0, 0.13, 0));
      rackGroup.add(g);
      state.plant = g;
      showToast('Lettuce seedling planted');
    }
    updateStats();
  });

  // ============================================================
  // PUMP SWITCH (3D lever + sidebar toggle, kept in sync)
  // ============================================================
  let pumpOn = false;
  const pumpToggle = document.getElementById('pump-toggle');
  const switchOnAngle = -0.55, switchOffAngle = 0.55;

  function applyPumpVisuals(){
    pumpLedMat.emissive.set(pumpOn ? 0x7ee08a : 0xff5566);
    leverMat.color.set(pumpOn ? 0x7ee08a : 0xff5566);
    leverMat.emissive.set(pumpOn ? 0x7ee08a : 0xff5566);
    pumpLedGlow.color.set(pumpOn ? 0x7ee08a : 0xff5566);
    pumpLedGlow.intensity = pumpOn ? 0.85 : 0.35;
    doseLedMat.emissive.set(pumpOn ? 0x7ee08a : 0xff5566);
    flowParticles.forEach(p=> p.visible = flowActive());
    pumpToggle.checked = pumpOn;
    refreshPlumbingUI();
  }
  function togglePump(){
    pumpOn = !pumpOn;
    applyPumpVisuals();
    showToast(pumpOn ? 'Pump switched on' : 'Pump switched off');
  }
  pumpToggle.addEventListener('change', (e)=>{
    pumpOn = e.target.checked;
    applyPumpVisuals();
    showToast(pumpOn ? 'Pump switched on' : 'Pump switched off');
  });
  applyPumpVisuals();
  switchLever.rotation.z = switchOffAngle;

  // ============================================================
  // STATS / TOAST
  // ============================================================
  const totalHoles = CHANNELS * HOLES_PER_CHANNEL;
  function updateStats(){
    const planted = holeState.filter(s=>s.plant).length;
    document.getElementById('stat-planted').textContent = planted + ' / ' + totalHoles;
  }
  document.getElementById('reset-btn').addEventListener('click', ()=>{
    holeState.forEach(s=>{
      if(s.plant) rackGroup.remove(s.plant);
      if(s.cocopeat) rackGroup.remove(s.cocopeat);
      s.plant = null; s.cocopeat = null;
    });
    updateStats();
    showToast('Rack reset');
  });

  let toastTimer = null;
  function showToast(msg, warn){
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.toggle('warn', !!warn);
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(()=> el.classList.remove('show'), 2000);
  }

  let ph = 6.1, ec = 1.42, temp = 21.4;
  setInterval(()=>{
    ph = Math.max(4.0, Math.min(8.0, ph + (chemTargets.pH - ph)*0.3 + (Math.random()-0.5)*0.02));
    const ecTarget = computeSolutionEC();
    ec = Math.max(0.4, Math.min(3.6, ec + (ecTarget - ec)*0.35 + (Math.random()-0.5)*0.03));
    temp = Math.max(10, Math.min(35, temp + (chemTargets.temp - temp)*0.3 + (Math.random()-0.5)*0.08));
    document.getElementById('stat-ph').textContent = ph.toFixed(2);
    document.getElementById('stat-ec').textContent = ec.toFixed(2);
    document.getElementById('stat-temp').textContent = temp.toFixed(1) + '°C';
  }, 2400);

  // ============================================================
  // RENDER LOOP
  // ============================================================
  let tankLevel = 0.84;
  let bedLevel = 0.0;
  const BED_MAX_H = RES_H * 0.7;
  let lastT = performance.now();
  const lastResPos = new THREE.Vector3().copy(reservoirGroup.position);

  function animate(){
    requestAnimationFrame(animate);
    const now = performance.now();
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;

    updateConnectAnimations(now);

    spherical.theta += (desired.theta - spherical.theta) * 0.12;
    spherical.phi   += (desired.phi   - spherical.phi)   * 0.12;
    spherical.radius+= (desired.radius- spherical.radius)* 0.12;
    applyCamera();

    // smooth follow toward the drop target (feels buttery even mid-drag)
    reservoirGroup.position.x += (reservoirTarget.x - reservoirGroup.position.x) * 0.16;
    reservoirGroup.position.z += (reservoirTarget.z - reservoirGroup.position.z) * 0.16;
    if(reservoirGroup.position.distanceTo(lastResPos) > 0.002){
      updateResPortPos();
      reservoirPortKnob.position.copy(resPortPos);
      rebuildResPumpPipe();
      lastResPos.copy(reservoirGroup.position);
    }

    const lf = parseInt(lightSlider.value,10)/PPFD_MAX;
    glowPink.intensity = (BASE_PINK*(0.1+lf*2.4)) + Math.sin(now*0.0009)*0.1*lf;
    glowBlue.intensity = (BASE_BLUE*(0.1+lf*2.4)) + Math.cos(now*0.0011)*0.08*lf;

    const targetAngle = pumpOn ? switchOnAngle : switchOffAngle;
    switchLever.rotation.z += (targetAngle - switchLever.rotation.z) * 0.25;

    const active = flowActive();
    if(pumpOn){
      motor.rotation.x += dt * 14;
      fanBlade.rotation.x += dt * 14;
    }
    if(active){
      tankLevel = Math.max(0.08, tankLevel - dt*0.012);
      bedLevel = Math.min(1, bedLevel + dt*0.08);
    } else {
      bedLevel = Math.max(0, bedLevel - dt*0.03);
    }
    const tw = Math.max(0.02, tankLevel * (tankH - innerPad*2));
    tankWater.scale.y = tw;
    tankWater.position.y = 0.13 + innerPad + tw/2;
    document.getElementById('stat-res').textContent = Math.round(tankLevel*100) + '%';
    document.getElementById('stat-bed').textContent = Math.round(bedLevel*100) + '%';

    const bh = Math.max(0.0001, bedLevel * BED_MAX_H);
    bedWater.scale.y = bh;
    bedWater.position.y = padIn + bh/2;
    bedGlow.position.y = padIn + bh;

    flowParticles.forEach(p=> p.visible = active);
    if(active){
      flowParticles.forEach(p=>{
        p.userData.t += dt * 0.3;
        if(p.userData.t > 1) p.userData.t -= 1;
        const pt = pointOnFullPath(p.userData.t);
        if(pt) p.position.copy(pt);
      });
    }

    renderer.render(scene, camera);
  }

  resize();
  animate();
})();
