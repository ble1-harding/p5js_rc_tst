// Rollercoaster Modeling Program
// 3D vertex-based track design with curve templates and HUD manipulation
// Mon 1 Dec 2025
// ble
// made with microsoft copilot

let coaster;
let hudPanel;
let camera3D;
let selectedVertexIndex = -1;
let selectedIsControl = false;
let viewpoints = [];
let currentViewpoint = 0;
// All segments modeled as Bezier curves; curve-type selection removed
// Mouse drag/select state
let _mouseDownPos = null;
let _isDragging = false;
let _draggingVertex = false;
let _draggedVertexIndex = -1;
let _draggedIsControl = false;
// Drag threshold (pixels) for distinguishing click vs drag — adjustable via HUD
let dragThreshold = 4;
let _hudNeedsUpdate = true;

// Grid plane for positioning
let grid = {
  axis: 0, // 0=XY,1=YZ,2=XZ
  d: 0, // distance along normal from origin
  spacing: 50,
  size: 2000
};

// Persisted settings save/load
function saveSettings() {
  try {
    localStorage.setItem('dragThreshold', String(dragThreshold));
    if (camera3D) {
      localStorage.setItem('cameraPos', JSON.stringify({ x: camera3D.pos.x, y: camera3D.pos.y, z: camera3D.pos.z }));
      localStorage.setItem('cameraYaw', String(camera3D.yaw));
      localStorage.setItem('cameraPitch', String(camera3D.pitch));
    }
    // curve type removed
    // save control vertices
    if (coaster && coaster.controls) {
      try {
        let arr = coaster.controls.map(c => ({ x: c.position.x, y: c.position.y, z: c.position.z }));
        localStorage.setItem('controlVertices', JSON.stringify(arr));
      } catch (e) {}
    }
    // save full coaster vertices as well
    if (coaster && coaster.vertices) {
      try {
        let varr = coaster.vertices.map(v => ({ x: v.position.x, y: v.position.y, z: v.position.z }));
        localStorage.setItem('coasterVertices', JSON.stringify(varr));
      } catch (e) {}
    }
  } catch (e) {
    // ignore storage errors
  }
}

function loadSettings() {
  let loadedCamera = false;
  try {
    let stored = localStorage.getItem('dragThreshold');
    if (stored !== null) {
      let n = parseInt(stored, 10);
      if (!isNaN(n) && n > 0) dragThreshold = n;
    }
    // curve type removed
    let cam = localStorage.getItem('cameraPos');
    if (cam && camera3D) {
      let cp = JSON.parse(cam);
      if (cp && typeof cp.x === 'number') {
        camera3D.pos = createVector(cp.x, cp.y, cp.z);
        let yaw = parseFloat(localStorage.getItem('cameraYaw'));
        let pitch = parseFloat(localStorage.getItem('cameraPitch'));
        if (!isNaN(yaw)) camera3D.yaw = yaw;
        if (!isNaN(pitch)) camera3D.pitch = pitch;
        loadedCamera = true;
      }
    }
    // load control vertices
    try {
      let cv = localStorage.getItem('controlVertices');
      if (cv && coaster) {
        let arr = JSON.parse(cv);
        coaster.controls = [];
        for (let i = 0; i < arr.length; i++) {
          let it = arr[i];
          if (it && typeof it.x === 'number') {
            coaster.controls[i] = new Vertex(createVector(it.x, it.y, it.z), true);
          }
        }
      }
    } catch (e) {}
    // load full coaster vertices if present
    try {
      let cvtx = localStorage.getItem('coasterVertices');
      if (cvtx && coaster) {
        let arr = JSON.parse(cvtx);
        coaster.vertices = [];
        for (let i = 0; i < arr.length; i++) {
          let it = arr[i];
          if (it && typeof it.x === 'number') {
            coaster.vertices.push(new Vertex(createVector(it.x, it.y, it.z), false));
          }
        }
        coaster.updateCurves();
      }
    } catch (e) {}
  } catch (e) {
    // ignore
  }
  return loadedCamera;
}

function exportCoasterJSON() {
  if (!coaster) return;
  let obj = { vertices: [], controls: [], meta: {} };
  obj.vertices = coaster.vertices.map(v => ({ x: v.position.x, y: v.position.y, z: v.position.z }));
  obj.controls = (coaster.controls || []).map(c => c ? ({ x: c.position.x, y: c.position.y, z: c.position.z }) : null);
  obj.meta.grid = { axis: grid.axis, d: grid.d, spacing: grid.spacing };
  if (camera3D) obj.meta.camera = { x: camera3D.pos.x, y: camera3D.pos.y, z: camera3D.pos.z, yaw: camera3D.yaw, pitch: camera3D.pitch };
  // Use p5 helper to save JSON file
  try {
    saveJSON(obj, 'coaster_export.json');
  } catch (e) {
    // fallback: create blob
    try {
      let blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
      let url = URL.createObjectURL(blob);
      let a = document.createElement('a');
      a.href = url;
      a.download = 'coaster_export.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {}
  }
}

function loadCoasterFromJSON(obj) {
  if (!obj) return;
  try {
    if (obj.vertices && Array.isArray(obj.vertices)) {
      coaster.vertices = [];
      for (let v of obj.vertices) {
        coaster.vertices.push(new Vertex(createVector(v.x || 0, v.y || 0, v.z || 0), false));
      }
    }
    coaster.controls = [];
    if (obj.controls && Array.isArray(obj.controls)) {
      for (let c of obj.controls) {
        if (c) coaster.controls.push(new Vertex(createVector(c.x || 0, c.y || 0, c.z || 0), true));
        else coaster.controls.push(null);
      }
    }
    if (obj.meta) {
      // curve type metadata removed
      if (obj.meta.grid) {
        grid.axis = obj.meta.grid.axis || grid.axis;
        grid.d = obj.meta.grid.d || grid.d;
        grid.spacing = obj.meta.grid.spacing || grid.spacing;
      }
      if (obj.meta.camera && camera3D) {
        camera3D.pos = createVector(obj.meta.camera.x || 0, obj.meta.camera.y || 0, obj.meta.camera.z || 0);
        camera3D.yaw = obj.meta.camera.yaw || camera3D.yaw;
        camera3D.pitch = obj.meta.camera.pitch || camera3D.pitch;
      }
    }
    coaster.updateCurves();
    saveSettings();
  } catch (e) {}
}

function setup() {
  createCanvas(windowWidth, windowHeight, WEBGL);
  
  // Initialize coaster system
  coaster = new Coaster();
  hudPanel = new HUDPanel();
  camera3D = new Camera3D();
  // Load persisted settings (drag threshold, curve type, camera)
  let hadCamera = loadSettings();
  
  // Define camera snap positions
  viewpoints = [
    { name: 'Front', pos: createVector(0, 0, 1000), target: createVector(0, 0, 0) },
    { name: 'Top', pos: createVector(0, -800, 0), target: createVector(0, 0, 0) },
    { name: 'Side', pos: createVector(1000, 0, 0), target: createVector(0, 0, 0) },
    { name: 'Isometric', pos: createVector(600, -600, 600), target: createVector(0, 0, 0) }
  ];
  
  // Add default vertices only if no vertices were loaded from storage
  if (coaster.getVertexCount() === 0) {
    coaster.addVertex(createVector(-200, 0, -300));
    coaster.addVertex(createVector(0, -100, 0));
    coaster.addVertex(createVector(200, 0, 300));
    _hudNeedsUpdate = true;
  }
  
  // Snap camera to initial viewpoint only if no saved camera state
  if (!hadCamera) camera3D.snapToView(viewpoints[currentViewpoint]);

  // Save on unload
  try { window.addEventListener('beforeunload', saveSettings); } catch (e) {}

}

function draw() {
  background(50);
  
  // Lighting
  lights();
  ambientLight(150);
  directionalLight(255, 255, 255, 0, 1, -1);
  
  // Update camera
  camera3D.update();
  
  // Render grid then coaster
  drawGrid();
  coaster.render();
  
  // Render HUD - only update if coaster changed
  if (_hudNeedsUpdate || coaster.getVertexCount() !== hudPanel._lastVertexCount) {
    hudPanel.render(coaster, selectedVertexIndex);
    _hudNeedsUpdate = false;
  } else {
    hudPanel.syncCoordInputs();
  }

  // Update DOM debug panel
  renderDebugHUD();
}

function renderDebugHUD() {
  // output debug information into the #debug DOM element
  try {
    let dbg = document.getElementById('debug');
    if (!dbg) {
      dbg = document.createElement('div'); dbg.id = 'debug'; document.body.appendChild(dbg);
    }
    let lines = [];
    if (camera3D) {
      lines.push('<strong>Player:</strong> ' + nf(camera3D.pos.x,1,1) + ', ' + nf(camera3D.pos.y,1,1) + ', ' + nf(camera3D.pos.z,1,1) + '<br>');
      lines.push('<strong>Yaw, Pitch:</strong> ' + nf(camera3D.yaw,1,2) + ', ' + nf(camera3D.pitch,1,2) + '<br>');
    }
    lines.push('<strong>Mouse:</strong> (' + nf(mouseX,1,0) + ', ' + nf(mouseY,1,0) + ')<br>');
    try {
      let r = getRayFromMouse();
      lines.push('<strong>Ray O:</strong> ' + nf(r.origin.x,1,1) + ',' + nf(r.origin.y,1,1) + ',' + nf(r.origin.z,1,1) + '<br>');
      lines.push('<strong>Ray D:</strong> ' + nf(r.dir.x,1,2) + ',' + nf(r.dir.y,1,2) + ',' + nf(r.dir.z,1,2) + '<br>');
    } catch (e) {}
    let selText = 'none';
    if (selectedVertexIndex >= 0) {
      selText = (selectedIsControl ? 'Control ' : 'Vertex ') + selectedVertexIndex;
      let v = selectedIsControl ? (coaster.controls[selectedVertexIndex] || null) : coaster.getVertex(selectedVertexIndex);
      if (v) selText += ' (' + nf(v.position.x,1,1) + ',' + nf(v.position.y,1,1) + ',' + nf(v.position.z,1,1) + ')';
    }
    lines.push('<strong>Selected:</strong> ' + selText + '<br>');
    lines.push('<strong>View:</strong> ' + (viewpoints[currentViewpoint] ? viewpoints[currentViewpoint].name : '—') + '<br>');
    
    // Per-vertex pick debug
    lines.push('<strong style="color:#f90; margin-top:10px;">==== PICK DEBUG ====</strong>');
    for (let i = 0; i < coaster.getVertexCount(); i++) {
      let v = coaster.getVertex(i);
      let sp = worldToScreen(v.position);
      let r = max(8, screenRadiusForWorldSize(v.position, 15));
      let distp = dist(mouseX, mouseY, sp.x, sp.y);
      let isHit = distp <= r;
      lines.push('<div style="' + (isHit ? 'color:#0f0' : 'color:#999') + '"><strong>V' + i + ':</strong> scr(' + nf(sp.x,1,0) + ',' + nf(sp.y,1,0) + ') r=' + nf(r,1,1) + ' d=' + nf(distp,1,1) + (isHit ? ' ✓HIT' : '') + '</div>');
    }
    for (let i = 0; i < (coaster.controls ? coaster.controls.length : 0); i++) {
      let cv = coaster.controls[i];
      if (!cv) continue;
      let sp = worldToScreen(cv.position);
      let r = max(6, screenRadiusForWorldSize(cv.position, 8));
      let distp = dist(mouseX, mouseY, sp.x, sp.y);
      let isHit = distp <= r;
      lines.push('<div style="' + (isHit ? 'color:#0f0' : 'color:#999') + '"><strong>C' + i + ':</strong> scr(' + nf(sp.x,1,0) + ',' + nf(sp.y,1,0) + ') r=' + nf(r,1,1) + ' d=' + nf(distp,1,1) + (isHit ? ' ✓HIT' : '') + '</div>');
    }
    
    dbg.innerHTML = lines.map(l => typeof l === 'string' && (l.startsWith('<div') || l.startsWith('<strong')) ? l : '<div>' + l + '</div>').join('');
  } catch (e) {}
}



function keyPressed() {
  if (key === '1') { currentViewpoint = 0; camera3D.snapToView(viewpoints[0]); }
  if (key === '2') { currentViewpoint = 1; camera3D.snapToView(viewpoints[1]); }
  if (key === '3') { currentViewpoint = 2; camera3D.snapToView(viewpoints[2]); }
  if (key === '4') { currentViewpoint = 3; camera3D.snapToView(viewpoints[3]); }
  
  // Add vertex: V (avoid colliding with WASD movement)
  if (key === 'v' || key === 'V') {
    coaster.addVertex(createVector(random(-300, 300), random(-200, 0), random(-300, 300)));
    _hudNeedsUpdate = true;
    hudPanel.deleteClicked = false;
  }
  // Delete vertex: Delete or Backspace (avoids conflict with D movement)
  if (keyCode === BACKSPACE || keyCode === DELETE) {
    if (selectedVertexIndex >= 0) {
      if (selectedIsControl) {
        // remove control handle
        if (coaster.controls && selectedVertexIndex < coaster.controls.length) {
          coaster.controls.splice(selectedVertexIndex, 1);
          coaster.updateCurves();
        }
      } else {
        coaster.deleteVertex(selectedVertexIndex);
      }
      selectedVertexIndex = -1;
      selectedIsControl = false;
      hudPanel.deleteClicked = false;
      _hudNeedsUpdate = true;
    }
  }
  if (key === 'r' || key === 'R') {
    setup();
  }

  // Grid depth control: ',' = backward, '.' = forward (adjacent keys)
  if (key === ',') {
    grid.d -= grid.spacing;
  }
  if (key === '.') {
    grid.d += grid.spacing;
  }
  // Toggle grid axis with G
  if (key === 'g' || key === 'G') {
    grid.axis = (grid.axis + 1) % 3;
  }
  
  // curve type selection removed
  
  // Coordinate editing with arrow keys
  if (selectedVertexIndex >= 0) {
    let v = selectedIsControl ? (coaster.controls[selectedVertexIndex] || null) : coaster.getVertex(selectedVertexIndex);
    let speed = keyIsDown(SHIFT) ? 10 : 5;
    
    if (keyCode === LEFT_ARROW) {
      v.position.x -= speed;
    }
    if (keyCode === RIGHT_ARROW) {
      v.position.x += speed;
    }
    if (keyCode === UP_ARROW) {
      if (keyIsDown(CTRL) || keyIsDown(META)) {
        v.position.z += speed;
      } else {
        v.position.y -= speed;
      }
    }
    if (keyCode === DOWN_ARROW) {
      if (keyIsDown(CTRL) || keyIsDown(META)) {
        v.position.z -= speed;
      } else {
        v.position.y += speed;
      }
    }
    
    coaster.updateCurves();
  }
}

function mouseDragged() {
  // Determine if this is a drag (exceeds small movement threshold)
  if (!_mouseDownPos) {
    _mouseDownPos = { x: mouseX, y: mouseY };
  }
  let dx = mouseX - _mouseDownPos.x;
  let dy = mouseY - _mouseDownPos.y;
  if (sqrt(dx*dx + dy*dy) > dragThreshold) {
    _isDragging = true;
  }


  // If dragging a selected vertex with left button, move it in camera-facing plane
  if (!hudPanel.mouseOverHUD() && _draggingVertex && mouseButton === LEFT && _draggedVertexIndex >= 0) {
    let idx = _draggedVertexIndex;
    let isCtrl = _draggedIsControl;
    let r = getRayFromMouse();
    // plane through current vertex, normal pointing toward camera (opposite of forward)
    let targetV = isCtrl ? coaster.controls[idx] : coaster.getVertex(idx);
    if (targetV) {
      let planePoint = targetV.position.copy();
      let planeNormal = p5.Vector.mult(camera3D.getForwardVector(), -1);  // negate to point toward camera
      let denom = p5.Vector.dot(r.dir, planeNormal);
      if (abs(denom) > 1e-6) {
        let t = p5.Vector.dot(p5.Vector.sub(planePoint, r.origin), planeNormal) / denom;
        if (t > 0) {
          let ip = p5.Vector.add(r.origin, p5.Vector.mult(r.dir, t));
          if (isCtrl) coaster.updateControlPosition(idx, ip);
          else coaster.updateVertexPosition(idx, ip);
          coaster.updateCurves();
          saveSettings();
        }
      }
    }
  }
  // Left-button drag = look around (changed for trackpad friendliness)
  else if (!hudPanel.mouseOverHUD() && mouseButton === LEFT) {
    // use explicit delta from current/previous mouse positions for stability
    let dx = mouseX - pmouseX;
    let dy = mouseY - pmouseY;
    camera3D.look(dx, dy);
  } else if (!hudPanel.mouseOverHUD() && mouseIsPressed && mouseButton === CENTER) {
    // Middle button pan: translate camera sideways/up-down with momentum
    const panSpeed = 0.1; // Adjust this to control pan sensitivity
    let right = camera3D.getRightVector();
    let panForce = p5.Vector.mult(right, -movedX * panSpeed);
    panForce.y += movedY * panSpeed;
    
    camera3D.velocity.add(panForce);
    camera3D._snapped = false; // cancel snap state if user pans
  }
}

function mousePressed() {
  // Start mouse down state for drag-vs-click detection
  _mouseDownPos = { x: mouseX, y: mouseY };
  _isDragging = false;
  _draggingVertex = false;
  _draggedVertexIndex = -1;
  _draggedIsControl = false;

  if (!hudPanel.mouseOverHUD() && mouseButton === LEFT) {
    // try select nearest vertex/control within its projected radius
    let closestIndex = -1;
    let closestIsControl = false;
    let closestDist = Infinity;
    
    // check main vertices first
    for (let i = 0; i < coaster.getVertexCount(); i++) {
      let v = coaster.getVertex(i);
      let sp = worldToScreen(v.position);
      let r = max(8, screenRadiusForWorldSize(v.position, 15));
      let distp = dist(mouseX, mouseY, sp.x, sp.y);
      if (distp <= r && distp < closestDist) {
        closestDist = distp;
        closestIndex = i;
        closestIsControl = false;
      }
    }
    
    // check control vertices; only pick if no main vertex is closer
    // (give controls slightly higher priority by using same pick radius)
    for (let i = 0; i < (coaster.controls ? coaster.controls.length : 0); i++) {
      let cv = coaster.controls[i];
      if (!cv) continue;
      let sp = worldToScreen(cv.position);
      let r = max(8, screenRadiusForWorldSize(cv.position, 12));  // increased radius for better picking
      let distp = dist(mouseX, mouseY, sp.x, sp.y);
      // only pick control if it's strictly closer than the best main vertex
      if (distp <= r && distp < closestDist) {
        closestDist = distp;
        closestIndex = i;
        closestIsControl = true;
      }
    }

    if (closestIndex >= 0) {
      selectedVertexIndex = closestIndex;
      selectedIsControl = closestIsControl;
      // begin dragging this vertex
      _draggingVertex = true;
      _draggedVertexIndex = closestIndex;
      _draggedIsControl = closestIsControl;
    } else {
      // clicked empty space: deselect
      selectedVertexIndex = -1;
      selectedIsControl = false;
    }
  }
}

function mouseReleased() {
  // stop dragging vertex if any
  _draggingVertex = false;
  _draggedVertexIndex = -1;
  _draggedIsControl = false;
  _mouseDownPos = null;
  _isDragging = false;
}





function worldToScreen(pos) {
  // TODO: fix to convert 3d world coordinate to screen 2d coordinate
  let screen_pos = {
    x: 0,
    y: 0,
    z: 0
  };

  if (screen_pos.z > 1 || screen_pos.z < 0) {
    return {
      x: -1e9,
      y: -1e9,
      z: screen_pos.z
    };
  }

  return screen_pos;
}

function screenRadiusForWorldSize(pos, worldRadius) {
  // approximate the screen-space radius of a sphere of worldRadius at pos
  let center = worldToScreen(pos);
  if (center.z <= 0) return 0;
  // offset a point to the right by worldRadius in world space (approx using camera right vector)
  // get a small world-space offset in camera right direction
  let forward = camera3D.getForwardVector();
  let right = camera3D.getRightVector();
  let offsetPoint = p5.Vector.add(pos, p5.Vector.mult(right, worldRadius));
  let off = worldToScreen(offsetPoint);
  return dist(center.x, center.y, off.x, off.y);
}

function screenCoord(pos) {
  // Legacy; use worldToScreen instead for accurate projection
  let p = worldToScreen(pos);
  return { x: p.x, y: p.y };
}

function getGridPlane() {
  // returns { point, normal }
  if (grid.axis === 0) {
    // XY plane, normal +Z
    return { point: createVector(0,0,grid.d), normal: createVector(0,0,1) };
  } else if (grid.axis === 1) {
    // YZ plane, normal +X
    return { point: createVector(grid.d,0,0), normal: createVector(1,0,0) };
  } else {
    // XZ plane, normal +Y
    return { point: createVector(0,grid.d,0), normal: createVector(0,1,0) };
  }
}

function drawGrid() {
  push();
  stroke(120);
  strokeWeight(1);
  noFill();
  let half = grid.size / 2;
  let s = grid.spacing;
  if (grid.axis === 0) {
    // XY
    for (let x = -half; x <= half; x += s) {
      line(x, -half, grid.d, x, half, grid.d);
    }
    for (let y = -half; y <= half; y += s) {
      line(-half, y, grid.d, half, y, grid.d);
    }
  } else if (grid.axis === 1) {
    // YZ plane
    for (let z = -half; z <= half; z += s) {
      line(grid.d, -half, z, grid.d, half, z);
    }
    for (let y = -half; y <= half; y += s) {
      line(grid.d, y, -half, grid.d, y, half);
    }
  } else {
    // XZ plane
    for (let x = -half; x <= half; x += s) {
      line(x, grid.d, -half, x, grid.d, half);
    }
    for (let z = -half; z <= half; z += s) {
      line(-half, grid.d, z, half, grid.d, z);
    }
  }
  pop();
}

function mouseWheel(event) {
  if (!hudPanel.mouseOverHUD()) {
    camera3D.zoom(event.delta);
  }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

// ========== VERTEX CLASS ==========
class Vertex {
  constructor(pos, isControl = false) {
    this.position = pos.copy();
    this.isControl = isControl;
    this.selected = false;
  }
  
  render(size = 15) {
    push();
    translate(this.position.x, this.position.y, this.position.z);
    // Glow behind selected vertex for visual emphasis
    if (this.selected) {
      push();
      noStroke();
      fill(255, 215, 0, 70);
      sphere(size * 2.2);
      pop();
    }

    // Only draw stroke for selected vertices (golden outline)
    if (this.selected) {
      stroke(255, 215, 0);
      strokeWeight(2);
    } else {
      noStroke();
    }

    if (this.isControl) {
      fill(255, 200, 100);
    } else {
      fill(100, 200, 255);
    }

    let drawSize = this.selected ? size * 1.4 : size;
    sphere(drawSize);
    pop();
  }
  
  distance(other) {
    return dist(this.position.x, this.position.y, this.position.z,
                other.position.x, other.position.y, other.position.z);
  }
}

// ========== CURVE SEGMENT CLASS ==========
class CurveSegment {
  constructor(type, startVertex, endVertex, options = {}) {
    this.type = type; // 'line', 'arc90', 'arc45', 'elliptical', 'bezier'
    this.start = startVertex;
    this.end = endVertex;
    this.controlVertex = options.controlVertex || null;
    this.radius = options.radius || 100;
    this.radiusY = options.radiusY || this.radius;
    this.segments = options.segments || 50;
  }
  
  getPoints() {
    return this.getBezierPoints();
  }
  
  getBezierPoints() {
    let points = [];
    let p0 = this.start.position;
    let p1 = this.controlVertex ? this.controlVertex.position : p5.Vector.add(p0, this.end.position).mult(0.5);
    let p2 = this.end.position;
    
    for (let i = 0; i <= this.segments; i++) {
      let t = i / this.segments;
      let mt = 1 - t;
      let x = mt*mt*p0.x + 2*mt*t*p1.x + t*t*p2.x;
      let y = mt*mt*p0.y + 2*mt*t*p1.y + t*t*p2.y;
      let z = mt*mt*p0.z + 2*mt*t*p1.z + t*t*p2.z;
      points.push(createVector(x, y, z));
    }
    return points;
  }
  
  render() {
    let points = this.getPoints();
    push();
    stroke(100, 200, 100);
    strokeWeight(3);
    noFill();
    
    beginShape();
    for (let p of points) {
      vertex(p.x, p.y, p.z);
    }
    endShape();
    
    if (this.controlVertex) {
      stroke(255, 150, 0);
      strokeWeight(1);
      line(this.start.position.x, this.start.position.y, this.start.position.z,
           this.controlVertex.position.x, this.controlVertex.position.y, this.controlVertex.position.z);
      line(this.end.position.x, this.end.position.y, this.end.position.z,
           this.controlVertex.position.x, this.controlVertex.position.y, this.controlVertex.position.z);
      this.controlVertex.render(8);
    }
    pop();
  }
}

// ========== COASTER CLASS ==========
class Coaster {
  constructor() {
    this.vertices = [];
    this.curves = [];
    this.controls = []; // persistent control vertices for each segment
  }
  
  addVertex(pos, isControl = false) {
    let v = new Vertex(pos, isControl);
    this.vertices.push(v);
    // when adding a new vertex, also create a control for the previous segment
    if (this.vertices.length > 1) {
      let i = this.vertices.length - 2;
      let start = this.vertices[i];
      let end = this.vertices[i+1];
      let mid = p5.Vector.add(start.position, end.position).mult(0.5);
      this.controls[i] = new Vertex(mid, true);
    }
    this.updateCurves();
    return v;
  }
  
  deleteVertex(index) {
    if (index >= 0 && index < this.vertices.length) {
      this.vertices.splice(index, 1);
      // remove corresponding control(s)
      if (index < this.controls.length) this.controls.splice(index, 1);
      // if deleting middle vertex, the preceding control remains valid
      this.updateCurves();
    }
  }
  
  updateVertexPosition(index, newPos) {
    if (index >= 0 && index < this.vertices.length) {
      this.vertices[index].position = newPos.copy();
    }
  }
  
  updateCurves() {
    // Always create bezier segments using persistent control vertices when available
    this.curves = [];
    for (let i = 0; i < this.vertices.length - 1; i++) {
      let start = this.vertices[i];
      let end = this.vertices[i+1];

      // Use existing control if present, otherwise create at midpoint and store it
      if (!this.controls[i]) {
        let mid = p5.Vector.add(start.position, end.position).mult(0.5);
        this.controls[i] = new Vertex(mid, true);
      }

      this.curves.push(new CurveSegment('bezier', start, end, {
        controlVertex: this.controls[i],
        radius: 100
      }));
    }
  }

  updateControlPosition(index, newPos) {
    if (index >= 0 && index < this.controls.length) {
      this.controls[index].position = newPos.copy();
    }
  }
  
  // curve type selection removed; all segments use Beziers
  
  render() {
    for (let i = 0; i < this.vertices.length; i++) {
      let v = this.vertices[i];
      v.selected = (!selectedIsControl && i === selectedVertexIndex);
      v.render();
    }
    // mark control vertex selection state
    if (this.controls) {
      for (let i = 0; i < this.controls.length; i++) {
        if (this.controls[i]) this.controls[i].selected = (selectedIsControl && i === selectedVertexIndex);
      }
    }
    for (let c of this.curves) {
      c.render();
    }
  }
  
  getVertexCount() {
    return this.vertices.length;
  }
  
  getVertex(index) {
    return this.vertices[index];
  }
}

// ========== CAMERA CLASS ==========
class Camera3D {
  constructor() {
    this.pos = createVector(0, 0, 600);
    this.yaw = 0; // left/right
    this.pitch = 0; // up/down
    this.yawVelocity = 0;
    this.pitchVelocity = 0;
    this.lookSensitivity = 0.0005;
    this.angularFriction = 0.88;
    this.moveSpeed = 6;
    this.flySpeed = 4;
    this.smooth = 0.15;

    this.velocity = createVector(0, 0, 0);
    this.acceleration = 0.3;
    this.friction = 0.9;

    this.targetPos = this.pos.copy();
    this.targetYaw = this.yaw;
    this.targetPitch = this.pitch;
    this._lastSave = 0;
  }
  
  update() {
    // Apply angular momentum for look-around
    this.yaw += this.yawVelocity;
    this.pitch += this.pitchVelocity;

    this.yawVelocity *= this.angularFriction;
    this.pitchVelocity *= this.angularFriction;
    
    // Stop rotation if velocity is very low
    if (abs(this.yawVelocity) < 0.00001) this.yawVelocity = 0;
    if (abs(this.pitchVelocity) < 0.00001) this.pitchVelocity = 0;

    this.pitch = constrain(this.pitch, -PI/2 + 0.01, PI/2 - 0.01);

    // If a viewpoint snap is active, smoothly move to that camera
    if (this._snapped) {
      // interpolate position and angles toward snap
      this.pos.lerp(this._snapPos, 0.25);
      this.yaw = lerp(this.yaw, this._snapYaw, 0.25);
      this.pitch = lerp(this.pitch, this._snapPitch, 0.25);
      if (p5.Vector.dist(this.pos, this._snapPos) < 1) this._snapped = false;
    }

    // Movement (WASD + QE) with momentum
    let move = createVector(0, 0, 0);
    if (!hudPanel.mouseOverHUD()) {
      let horiz_movement = this.getForwardVector();
      horiz_movement.y = 0;
      horiz_movement.normalize();
      if (keyIsDown(87)) { // W
        move.add(horiz_movement);
      }
      if (keyIsDown(83)) { // S
        move.sub(horiz_movement);
      }
      if (keyIsDown(65)) { // A
        move.sub(this.getRightVector());
      }
      if (keyIsDown(68)) { // D
        move.add(this.getRightVector());
      }
      if (keyIsDown(81)) { // Q down
        move.y -= 1; // Use 1 since it's a direction
      }
      if (keyIsDown(69)) { // E up
        move.y += 1;
      }
      // Additional vertical controls: Space = down, Ctrl/Shift = up
      if (keyIsDown(32)) { // SPACE
        move.y -= 1;
      }
      if (keyIsDown(17) || keyIsDown(CONTROL) || keyIsDown(SHIFT)) { // CTRL
        move.y += 1;
      }
    }

    if (move.mag() > 0) {
      move.normalize();
      move.mult(this.acceleration);
      this.velocity.add(move);
      // cancel snap state if user moves
      this._snapped = false;
    } else {
      // Apply friction when no keys are pressed
      this.velocity.mult(this.friction);
    }

    // Limit velocity to max speed
    if (this.velocity.mag() > this.moveSpeed) {
      this.velocity.normalize().mult(this.moveSpeed);
    }
    
    // Stop movement if velocity is very low
    if (this.velocity.mag() < 0.01) {
        this.velocity.mult(0);
    }

    this.pos.add(this.velocity);

    // compute target (look-at) from yaw/pitch
    let forward = this.getForwardVector();
    let target = p5.Vector.add(this.pos, forward);
    camera(this.pos.x, this.pos.y, this.pos.z, target.x, target.y, target.z, 0, 1, 0);

    // Periodically persist camera + settings (throttled)
    if (millis() - this._lastSave > 2000) {
      saveSettings();
      this._lastSave = millis();
    }
  }
  
  // mouse look adjustments (dx, dy from mouse movement)
  look(dx, dy) {
    this.yawVelocity -= dx * this.lookSensitivity;
    this.pitchVelocity -= dy * this.lookSensitivity;
  }

  getForwardVector() {
    // compute forward vector from yaw/pitch using same rotation order as getRayFromMouse
    // (pitch around X, then yaw around Y)
    let cosY = cos(this.yaw), sinY = sin(this.yaw);
    let cosP = cos(this.pitch), sinP = sin(this.pitch);
    // start with forward in camera space: (0, 0, -1)
    let cx = 0;
    let cy = cosP * 0 - sinP * (-1);  // = sinP
    let cz = sinP * 0 + cosP * (-1);  // = -cosP
    // pitch around X: (0,0,-1) -> (0, sinP, -cosP)
      let px = 0;
      let py = sinP;
      let pz = -cosP;
      // yaw around Y: apply rotation matrix
      let wx = cosY * px - sinY * pz;   // = sinY * cosP
      let wy = py;                        // = sinP
      let wz = sinY * px + cosY * pz;   // = -cosY * cosP
      return createVector(wx, wy, wz).normalize();
    }

  getRightVector() {
    // right = forward cross up (camera's right direction)
    let forward = this.getForwardVector();
    let up = createVector(0, 1, 0);
    return p5.Vector.cross(forward, up).normalize();
  }

  snapToView(view) {
    this._snapped = true;
    this._snapPos = view.pos.copy();
    // compute yaw/pitch looking at target
    let dir = p5.Vector.sub(view.target, this._snapPos).normalize();
    this._snapYaw = atan2(dir.x, -dir.z);
    this._snapPitch = asin(dir.y);
  }

  zoom(delta) {
    // zoom implemented as forward/back movement
    let forward = this.getForwardVector();
    this.pos.add(p5.Vector.mult(forward, delta * -0.05));
  }
}

// ========== HUD PANEL CLASS ==========
class HUDPanel {
  constructor() {
    this._lastVertexCount = -1;
    this.container = document.getElementById('hud') || (function(){ let d=document.createElement('div'); d.id='hud'; document.body.appendChild(d); return d; })();
    // create structural elements
    this.title = document.createElement('h3'); this.title.innerText = 'VERTICES';
    this.vertexList = document.createElement('div');
    this.controlsRow = document.createElement('div');
    this.dragLabel = document.createElement('span');
    this.dragMinus = document.createElement('button'); this.dragMinus.innerText='-';
    this.dragPlus = document.createElement('button'); this.dragPlus.innerText='+';
    this.importInput = document.createElement('input'); this.importInput.type = 'file'; this.importInput.accept = '.json,application/json'; this.importInput.style.display='none';
    this.importButton = document.createElement('button'); this.importButton.innerText = 'Import JSON';
    this.exportButton = document.createElement('button'); this.exportButton.innerText = 'Export JSON';
    this.resetButton = document.createElement('button'); this.resetButton.innerText = 'Reset saved settings';
    this.clearButton = document.createElement('button'); this.clearButton.innerText = 'Clear all vertices';
    this.testButton = document.createElement('button'); this.testButton.innerText = 'Add test vertices';
    this.coordRow = document.createElement('div');
    this.xInput = document.createElement('input'); this.xInput.type='number'; this.xInput.className='hud-input';
    this.yInput = document.createElement('input'); this.yInput.type='number'; this.yInput.className='hud-input';
    this.zInput = document.createElement('input'); this.zInput.type='number'; this.zInput.className='hud-input';
    this.applyButton = document.createElement('button'); this.applyButton.innerText='Apply';

    // assemble
    this.container.appendChild(this.title);
    this.container.appendChild(this.vertexList);
    this.controlsRow.appendChild(this.dragMinus); this.controlsRow.appendChild(this.dragLabel); this.controlsRow.appendChild(this.dragPlus);
    this.controlsRow.appendChild(document.createElement('br'));
    this.controlsRow.appendChild(this.importButton); this.controlsRow.appendChild(this.exportButton); this.controlsRow.appendChild(this.resetButton); this.controlsRow.appendChild(this.clearButton); this.controlsRow.appendChild(this.testButton);
    this.container.appendChild(this.controlsRow);
    this.container.appendChild(document.createElement('hr'));
    this.coordRow.appendChild(this.xInput); this.coordRow.appendChild(this.yInput); this.coordRow.appendChild(this.zInput); this.coordRow.appendChild(this.applyButton);
    this.container.appendChild(this.coordRow);
    this.container.appendChild(this.importInput);

    // event wiring
    this.importButton.addEventListener('click', () => this.importInput.click());
    this.importInput.addEventListener('change', (ev) => {
      let f = ev.target.files[0]; if (!f) return; let reader = new FileReader(); reader.onload = (e)=>{ try{ let obj=JSON.parse(e.target.result); loadCoasterFromJSON(obj); }catch(e){} }; reader.readAsText(f);
    });
    this.exportButton.addEventListener('click', () => exportCoasterJSON());
    this.resetButton.addEventListener('click', () => { try { localStorage.removeItem('dragThreshold'); localStorage.removeItem('cameraPos'); localStorage.removeItem('cameraYaw'); localStorage.removeItem('cameraPitch'); localStorage.removeItem('controlVertices'); localStorage.removeItem('coasterVertices'); } catch(e){}; location.reload(); });
    this.clearButton.addEventListener('click', () => { coaster.vertices = []; coaster.controls = []; coaster.updateCurves(); selectedVertexIndex = -1; selectedIsControl = false; _hudNeedsUpdate = true; saveSettings(); });
    this.testButton.addEventListener('click', () => { coaster.addVertex(createVector(-200, 0, -300)); coaster.addVertex(createVector(0, -100, 0)); coaster.addVertex(createVector(200, 0, 300)); coaster.updateCurves(); _hudNeedsUpdate = true; saveSettings(); });
    this.dragMinus.addEventListener('click', ()=>{ dragThreshold = max(1, dragThreshold-1); saveSettings(); this.updateDragLabel(); });
    this.dragPlus.addEventListener('click', ()=>{ dragThreshold = dragThreshold+1; saveSettings(); this.updateDragLabel(); });
    this.applyButton.addEventListener('click', ()=>{ if (selectedVertexIndex>=0){ let vx=parseFloat(this.xInput.value); let vy=parseFloat(this.yInput.value); let vz=parseFloat(this.zInput.value); if (!isNaN(vx)&&!isNaN(vy)&&!isNaN(vz)){ if (selectedIsControl) coaster.updateControlPosition(selectedVertexIndex, createVector(vx,vy,vz)); else coaster.updateVertexPosition(selectedVertexIndex, createVector(vx,vy,vz)); coaster.updateCurves(); saveSettings(); } } });
  }

  updateDragLabel() { this.dragLabel.innerText = ' Drag threshold: ' + dragThreshold + ' '; }

  render(coaster, selectedIndex) {
    try {
      console.log('HUDPanel.render called; vertexCount=', coaster.getVertexCount(), 'selectedIndex=', selectedIndex, 'selectedIsControl=', selectedIsControl);
    } catch (e) {}
    // update drag label
    this.updateDragLabel();
    let vertexCount = coaster.getVertexCount();
    
    // only rebuild the list if vertex count changed
    if (vertexCount !== this._lastVertexCount) {
      this._lastVertexCount = vertexCount;
      // populate vertex list with main vertices and controls
      this.vertexList.innerHTML = '';
      for (let i=0;i<coaster.getVertexCount();i++){
        let v = coaster.getVertex(i);
        let div = document.createElement('div'); div.className='hud-vertex'+(i===selectedIndex && !selectedIsControl?' selected':'');
        div.dataset.index = i; div.dataset.isControl = false;
        div.innerHTML = '<strong>Vertex '+i+'</strong><div>X: '+v.position.x.toFixed(1)+', Y: '+v.position.y.toFixed(1)+', Z: '+v.position.z.toFixed(1)+'</div>';
        let del = document.createElement('button'); del.className='hud-btn'; del.innerText='Delete'; del.addEventListener('click', (ev)=>{ ev.stopPropagation(); coaster.deleteVertex(i); if (selectedVertexIndex===i){ selectedVertexIndex=-1; selectedIsControl=false; } this.render(coaster, selectedIndex); });
        div.appendChild(del);
        div.addEventListener('click', ()=>{ selectedVertexIndex = i; selectedIsControl = false; this.syncCoordInputs(); });
        this.vertexList.appendChild(div);
        
        // add control vertex if present
        if (coaster.controls && coaster.controls[i]) {
          let cv = coaster.controls[i];
          let cdiv = document.createElement('div'); cdiv.className='hud-vertex hud-control'+(i===selectedIndex && selectedIsControl?' selected':'');
          cdiv.dataset.index = i; cdiv.dataset.isControl = true;
          cdiv.innerHTML = '<strong style="color:#fc8">Ctrl '+i+'</strong><div>X: '+cv.position.x.toFixed(1)+', Y: '+cv.position.y.toFixed(1)+', Z: '+cv.position.z.toFixed(1)+'</div>';
          let cdel = document.createElement('button'); cdel.className='hud-btn'; cdel.innerText='Delete'; cdel.addEventListener('click', (ev)=>{ ev.stopPropagation(); if (coaster.controls[i]) coaster.controls.splice(i,1); coaster.updateCurves(); saveSettings(); if (selectedVertexIndex===i && selectedIsControl){ selectedVertexIndex=-1; selectedIsControl=false; } this.render(coaster, selectedIndex); });
          cdiv.appendChild(cdel);
          cdiv.addEventListener('click', ()=>{ selectedVertexIndex = i; selectedIsControl = true; this.syncCoordInputs(); });
          this.vertexList.appendChild(cdiv);
        }
      }
    }
    // sync coord inputs for selection
    this.syncCoordInputs();
  }

  syncCoordInputs() {
    if (selectedVertexIndex>=0) {
      let v = selectedIsControl ? (coaster.controls[selectedVertexIndex]||null) : coaster.getVertex(selectedVertexIndex);
      if (v) {
        this.xInput.value = v.position.x;
        this.yInput.value = v.position.y;
        this.zInput.value = v.position.z;
        this.xInput.style.display='inline-block'; this.yInput.style.display='inline-block'; this.zInput.style.display='inline-block'; this.applyButton.style.display='inline-block';
        return;
      }
    }
    this.xInput.style.display='none'; this.yInput.style.display='none'; this.zInput.style.display='none'; this.applyButton.style.display='none';
  }

  mouseOverHUD() {
    let rect = this.container.getBoundingClientRect();
    return (mouseX >= rect.left && mouseX <= rect.right && mouseY >= rect.top && mouseY <= rect.bottom);
  }
}
