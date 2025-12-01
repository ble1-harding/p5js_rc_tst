let nodes = [];
let selectedIndex = -1;
let canvas;
let dragging = false;
let dragStartMouse = null;
let dragStartPos = null;
let cam;

class Node3 {
  constructor(id, x, y, z, col) {
    this.id = id;
    this.pos = createVector(x, y, z);
    this.col = col || color(random(100, 255), random(100, 255), random(100, 255));
  }
}

function setup() {
  canvas = createCanvas(windowWidth, windowHeight, WEBGL);
  canvas.elt.style.display = 'block';
  colorMode(RGB);
  // sample nodes: create 10 nodes in a circle
  createTestCircleNodes(10, 160);
  saveNodesToStorage();

  // place initial camera so circle is visible
  cam = createCamera();
  cam.setPosition(0, -200, 600);
  cam.lookAt(0, 0, 0);

  setupUI();
}

function createTestCircleNodes(count = 10, radius = 120) {
  nodes = [];
  for (let i = 0; i < count; i++) {
    const angle = TWO_PI * i / count;
    const x = cos(angle) * radius;
    const z = sin(angle) * radius;
    const y = 0;
    nodes.push(new Node3(i + 1, x, y, z));
  }
  selectedIndex = -1;
  refreshUI();
}

function draw() {
  background(30);
  if (!dragging) orbitControl();

  ambientLight(100);
  directionalLight(255, 255, 255, -0.5, -1, -0.5);

  drawGrid(400, 40);
  drawAxes(200);

  // draw nodes
  for (let i = 0; i < nodes.length; i++) {
    push();
    let n = nodes[i];
    translate(n.pos.x, n.pos.y, n.pos.z);
    if (i === selectedIndex) {
      ambientMaterial(255, 220, 0);
      sphere(18);
    }
    ambientMaterial(n.col);
    sphere(12);
    pop();
  }

  // update node list overlay positions (optional small highlight)
}

function drawGrid(size, step) {
  push();
  rotateX(HALF_PI);
  stroke(80);
  strokeWeight(1);
  for (let x = -size; x <= size; x += step) {
    line(x, -size, x, size);
  }
  for (let y = -size; y <= size; y += step) {
    line(-size, y, size, y);
  }
  pop();
}

function drawAxes(len) {
  push();
  strokeWeight(3);
  // X axis - red
  stroke(200, 50, 50);
  line(0, 0, 0, len, 0, 0);
  // Y axis - green
  stroke(50, 200, 50);
  line(0, 0, 0, 0, -len, 0);
  // Z axis - blue
  stroke(50, 50, 200);
  line(0, 0, 0, 0, 0, len);
  pop();
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

// Selection by clicking near projected screen position
function mousePressed() {
  // ignore clicks on the UI panel
  const panel = document.getElementById('panel');
  const rect = panel.getBoundingClientRect();
  if (mouseX > rect.left && mouseX < rect.right && mouseY > rect.top && mouseY < rect.bottom) {
    return;
  }

  let found = -1;
  let minD = 9999;
  for (let i = 0; i < nodes.length; i++) {
    let n = nodes[i];
    let sx = screenX(n.pos.x, n.pos.y, n.pos.z);
    let sy = screenY(n.pos.x, n.pos.y, n.pos.z);
    let d = dist(mouseX, mouseY, sx, sy);
    if (d < 16 && d < minD) {
      found = i;
      minD = d;
    }
  }
  selectedIndex = found;
  refreshUI();

  // begin dragging if a node was clicked
  if (selectedIndex >= 0) {
    dragging = true;
    dragStartMouse = createVector(mouseX, mouseY);
    dragStartPos = nodes[selectedIndex].pos.copy();
  }
}

function mouseDragged() {
  if (!dragging || selectedIndex < 0) return;
  // disable orbit while dragging by skipping orbitControl in draw when dragging
  const curMouse = createVector(mouseX, mouseY);
  const screenDelta = p5.Vector.sub(curMouse, dragStartMouse);

  const base = dragStartPos;
  // project small world offsets to screen to compute Jacobian
  const sx0 = screenX(base.x, base.y, base.z);
  const sy0 = screenY(base.x, base.y, base.z);
  const sx_dx = screenX(base.x + 1, base.y, base.z);
  const sy_dx = screenY(base.x + 1, base.y, base.z);
  const sx_dy = screenX(base.x, base.y + 1, base.z);
  const sy_dy = screenY(base.x, base.y + 1, base.z);

  const m00 = sx_dx - sx0; // screen per world x (x -> sx)
  const m10 = sy_dx - sy0; // screen per world x (x -> sy)
  const m01 = sx_dy - sx0; // screen per world y (y -> sx)
  const m11 = sy_dy - sy0; // screen per world y (y -> sy)

  // 2x2 matrix M = [m00 m01; m10 m11], we want worldDelta = M^{-1} * screenDelta
  const det = m00 * m11 - m01 * m10;
  let worldDx = 0, worldDy = 0;
  if (abs(det) > 1e-6) {
    const inv00 = m11 / det;
    const inv01 = -m01 / det;
    const inv10 = -m10 / det;
    const inv11 = m00 / det;
    worldDx = inv00 * screenDelta.x + inv01 * screenDelta.y;
    worldDy = inv10 * screenDelta.x + inv11 * screenDelta.y;
  } else {
    // fallback: scale by a heuristic
    const scale = 0.5;
    worldDx = screenDelta.x * scale;
    worldDy = screenDelta.y * scale;
  }

  const n = nodes[selectedIndex];
  n.pos.x = dragStartPos.x + worldDx;
  n.pos.y = dragStartPos.y + worldDy;
  refreshUI();
  saveNodesToStorage();
}

function mouseReleased() {
  if (dragging) {
    dragging = false;
    dragStartMouse = null;
    dragStartPos = null;
    saveNodesToStorage();
  }
}

function keyPressed() {
  if (selectedIndex < 0) return;
  let n = nodes[selectedIndex];
  const step = keyIsDown(SHIFT) ? 10 : 4;
  if (keyCode === LEFT_ARROW) n.pos.x -= step;
  if (keyCode === RIGHT_ARROW) n.pos.x += step;
  if (keyCode === UP_ARROW) n.pos.y -= step;
  if (keyCode === DOWN_ARROW) n.pos.y += step;
  if (keyCode === 33) n.pos.z -= step; // PageUp
  if (keyCode === 34) n.pos.z += step; // PageDown
  refreshUI();
  saveNodesToStorage();
}

// UI wiring
function setupUI() {
  document.getElementById('createBtn').addEventListener('click', () => {
    const id = nodes.length ? nodes[nodes.length - 1].id + 1 : 1;
    // create at camera center (near origin of view)
    nodes.push(new Node3(id, random(-50, 50), random(-20, 20), random(-50, 50)));
    refreshUI();
    saveNodesToStorage();
  });

  document.getElementById('dupBtn').addEventListener('click', () => {
    if (selectedIndex < 0) return;
    const src = nodes[selectedIndex];
    const id = nodes.length ? nodes[nodes.length - 1].id + 1 : 1;
    nodes.push(new Node3(id, src.pos.x + 20, src.pos.y + 20, src.pos.z + 20, src.col));
    refreshUI();
    saveNodesToStorage();
  });

  document.getElementById('delBtn').addEventListener('click', () => {
    if (selectedIndex < 0) return;
    nodes.splice(selectedIndex, 1);
    selectedIndex = -1;
    refreshUI();
    saveNodesToStorage();
  });

  document.getElementById('updateBtn').addEventListener('click', () => {
    if (selectedIndex < 0) return;
    const x = parseFloat(document.getElementById('coordX').value) || 0;
    const y = parseFloat(document.getElementById('coordY').value) || 0;
    const z = parseFloat(document.getElementById('coordZ').value) || 0;
    let n = nodes[selectedIndex];
    n.pos.set(x, y, z);
    refreshUI();
    saveNodesToStorage();
  });

  refreshUI();
}

// --- JSON export / import and storage ---
function exportNodes() {
  const out = nodes.map(n => ({ id: n.id, x: n.pos.x, y: n.pos.y, z: n.pos.z }));
  return JSON.stringify({ nodes: out }, null, 2);
}

function downloadJSON(filename = 'nodes.json') {
  const data = exportNodes();
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function importNodesFromObject(obj) {
  if (!obj || !Array.isArray(obj.nodes)) return false;
  nodes = obj.nodes.map((n, i) => new Node3(n.id ?? i + 1, n.x || 0, n.y || 0, n.z || 0));
  selectedIndex = -1;
  refreshUI();
  saveNodesToStorage();
  return true;
}

function handleFileInput(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const obj = JSON.parse(e.target.result);
      if (!importNodesFromObject(obj)) alert('Invalid node file');
    } catch (err) {
      alert('Failed to parse JSON: ' + err.message);
    }
  };
  reader.readAsText(file);
}

function saveNodesToStorage() {
  try {
    localStorage.setItem('p5_nodes', exportNodes());
  } catch (e) { /* ignore */ }
}

function loadNodesFromStorage() {
  try {
    const s = localStorage.getItem('p5_nodes');
    if (!s) return false;
    const obj = JSON.parse(s);
    return importNodesFromObject(obj);
  } catch (e) { return false; }
}

// wire save/load UI after setupUI
const origSetupUI = setupUI;
setupUI = function() {
  origSetupUI();

  document.getElementById('saveBtn').addEventListener('click', () => {
    downloadJSON();
  });

  document.getElementById('loadFileBtn').addEventListener('click', () => {
    const fi = document.getElementById('fileInput');
    if (fi.files && fi.files[0]) handleFileInput(fi.files[0]);
    else alert('Choose a JSON file first');
  });

  document.getElementById('fileInput').addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      // auto-load on select
    }
  });

  document.getElementById('loadSavedBtn').addEventListener('click', () => {
    if (!loadNodesFromStorage()) alert('No saved nodes found');
  });

  // attempt load at startup
  loadNodesFromStorage();
};

function refreshUI() {
  const info = document.getElementById('selectedInfo');
  const list = document.getElementById('nodeList');
  list.innerHTML = '';
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    const item = document.createElement('div');
    item.className = 'nodeItem';
    const label = document.createElement('div');
    label.textContent = `#${n.id} (${n.pos.x.toFixed(1)}, ${n.pos.y.toFixed(1)}, ${n.pos.z.toFixed(1)})`;
    if (i === selectedIndex) item.style.background = 'rgba(255,255,0,0.12)';
    const btns = document.createElement('div');
    const sel = document.createElement('button');
    sel.textContent = 'Select';
    sel.onclick = () => { selectedIndex = i; refreshUI(); };
    btns.appendChild(sel);
    item.appendChild(label);
    item.appendChild(btns);
    list.appendChild(item);
  }

  if (selectedIndex >= 0) {
    const n = nodes[selectedIndex];
    info.textContent = `Selected: #${n.id}`;
    document.getElementById('coordX').value = n.pos.x.toFixed(2);
    document.getElementById('coordY').value = n.pos.y.toFixed(2);
    document.getElementById('coordZ').value = n.pos.z.toFixed(2);
  } else {
    info.textContent = 'No node selected';
    document.getElementById('coordX').value = '';
    document.getElementById('coordY').value = '';
    document.getElementById('coordZ').value = '';
  }
}

