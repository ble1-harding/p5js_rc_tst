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
let _draggingArrow = false;
let _draggedArrowAxis = -1;
let _hoveredArrowAxis = -1;
let _arrowDragStart = null;
// Move speed for arrow dragging — adjustable via HUD
let moveSpeed = 1.0;
let _hudNeedsUpdate = true;

// 3D Grid for reference
let grid = {
  spacing: 50,
  size: 1000
};

// Array to store currently pressed keys
let keys = [];
let keysPressedDown = []; // The keys that have been immediately pressed down within the frame
let keysPressedUp = []; // Ditto, but keys that have been released

// Persisted settings save/load
function saveSettings() {
  try {
    localStorage.setItem('moveSpeed', String(moveSpeed));
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
    let stored = localStorage.getItem('moveSpeed');
    if (stored !== null) {
      let n = parseFloat(stored);
      if (!isNaN(n) && n > 0) moveSpeed = n;
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
  obj.meta.moveSpeed = moveSpeed;
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
      if (obj.meta.moveSpeed) {
        moveSpeed = obj.meta.moveSpeed;
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

  processControls();
  
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



function processControls() {
  if (keys['_1']) { console.log(true);currentViewpoint = 0; camera3D.snapToView(viewpoints[0]); }
  if (keys['_2']) { currentViewpoint = 1; camera3D.snapToView(viewpoints[1]); }
  if (keys['_3']) { currentViewpoint = 2; camera3D.snapToView(viewpoints[2]); }
  if (keys['_4']) { currentViewpoint = 3; camera3D.snapToView(viewpoints[3]); }
  
  // Add vertex: V (avoid colliding with WASD movement)
  if (keysPressedDown['_v']) {
    coaster.addVertex(createVector(random(-300, 300), random(-200, 0), random(-300, 300)));
    _hudNeedsUpdate = true;
    hudPanel.deleteClicked = false;
  }
  // Delete vertex: Delete or Backspace (avoids conflict with D movement)
  // keys.pressStart ensures that vertecies aren't deleted every single frame the key is held
  if (keysPressedDown[BACKSPACE] || keysPressedDown[DELETE]) {
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
  if (keys['_r']) {
    setup();
  }


  
  // curve type selection removed
  
  // Coordinate editing with arrow keys
  if (selectedVertexIndex >= 0) {
    let v = selectedIsControl ? (coaster.controls[selectedVertexIndex] || null) : coaster.getVertex(selectedVertexIndex);
    let speed = keys[SHIFT] ? 10 : 5;
    
    if (keys['_j']) {
      v.position.x -= speed;
    }
    if (keys['_l']) {
      v.position.x += speed;
    }
    if (keys['_i']) {
      v.position.z += speed;
    }
    if (keys['_k']) {
      v.position.z -= speed;
    }
    if (keys['_u']) {
      v.position.y -= speed;
    }
    if (keys['_o']) {
      v.position.y += speed;
    }
    
    coaster.updateCurves();
  }


  // Reset the list of keys which have been immediately pressed
  keysPressedDown = [];
}

function keyPressed() {
  // For key press checks, simply check if `key[(keycode)]` or `key[_(lowercased key)]` is true
  let keyLitteral = '_' + key.toString().toLowerCase();
  keys[keyCode] = true;
  keys[keyLitteral] = true;
  keysPressedDown[keyCode] = true;
  keysPressedDown[keyLitteral] = true;
}

function keyReleased() {
  // Resets key press value if released
  let keyLitteral = '_' + key.toString().toLowerCase();
  keys[keyCode] = false;
  keys[keyLitteral] = false;
}

function mouseDragged() {
  // Determine if this is a drag (exceeds small movement threshold)
  if (!_mouseDownPos) {
    _mouseDownPos = { x: mouseX, y: mouseY };
  }
  let dx = mouseX - _mouseDownPos.x;
  let dy = mouseY - _mouseDownPos.y;
  if (sqrt(dx*dx + dy*dy) > 4) {
    _isDragging = true;
  }

  // Handle arrow dragging
  if (_draggingArrow && _draggedArrowAxis >= 0 && selectedVertexIndex >= 0 && !selectedIsControl) {
    let selectedV = coaster.getVertex(selectedVertexIndex);
    let mouseDelta = createVector(mouseX - pmouseX, mouseY - pmouseY);
    
    // Project mouse movement onto the selected axis
    let axisDir = createVector(0, 0, 0);
    if (_draggedArrowAxis === 0) axisDir.x = 1;      // X axis
    else if (_draggedArrowAxis === 1) axisDir.y = -1; // Y axis (up)
    else axisDir.z = 1;                               // Z axis
    
    // Convert axis direction to screen space
    let worldAxisEnd = p5.Vector.add(selectedV.position, p5.Vector.mult(axisDir, 100));
    let screenStart = worldToScreen(selectedV.position);
    let screenEnd = worldToScreen(worldAxisEnd);
    
    if (screenStart.z > 0 && screenEnd.z > 0) {
      let screenAxisDir = createVector(screenEnd.x - screenStart.x, screenEnd.y - screenStart.y).normalize();
      let projectedMovement = p5.Vector.dot(mouseDelta, screenAxisDir);
      
      // Apply movement directly following mouse
      let movement = p5.Vector.mult(axisDir, projectedMovement * 0.5);
      selectedV.position.add(movement);
      
      coaster.updateCurves();
      _hudNeedsUpdate = true;
    }
  }
  // Left-button drag = look around (disabled when dragging gizmo)
  else if (!hudPanel.mouseOverHUD() && mouseButton === LEFT && !_draggingArrow) {
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

    // Check if clicking on arrow first
    if (selectedVertexIndex >= 0 && !selectedIsControl && _hoveredArrowAxis >= 0) {
      _draggingArrow = true;
      _draggedArrowAxis = _hoveredArrowAxis;
      _arrowDragStart = createVector(mouseX, mouseY);
      return; // Don't change selection when clicking arrow
    } else if (closestIndex >= 0) {
      selectedVertexIndex = closestIndex;
      selectedIsControl = closestIsControl;
      _hudNeedsUpdate = true;
    }
  }
}

function mouseReleased() {
  // Save settings when arrow dragging ends
  if (_draggingArrow) {
    saveSettings();
  }
  
  // stop dragging vertex and arrow
  _draggingVertex = false;
  _draggedVertexIndex = -1;
  _draggedIsControl = false;
  _draggingArrow = false;
  _draggedArrowAxis = -1;
  _arrowDragStart = null;
  _mouseDownPos = null;
  _isDragging = false;
}





function worldToScreen(pos) {
  let forward = camera3D.getForwardVector();
  let right = camera3D.getRightVector();
  let up = p5.Vector.cross(right, forward);
  
  let toPoint = p5.Vector.sub(pos, camera3D.pos);
  
  let x = p5.Vector.dot(toPoint, right);
  let y = p5.Vector.dot(toPoint, up);
  let z = p5.Vector.dot(toPoint, forward);
  
  if (z <= 0.1) return { x: -9999, y: -9999, z: z };
  
  // Match p5.js default perspective: fovy = PI/3, aspect = width/height
  let fovy = PI / 3;
  let aspect = width / height;
  let f = 1 / tan(fovy / 2);
  
  return {
    x: (x * f / (z * aspect)) * (width / 2) + width / 2,
    y: (y * f / z) * (height / 2) + height / 2,
    z: z
  };
}

function getRayFromMouse() {
  let fovy = PI / 3;
  let aspect = width / height;
  let f = 1 / tan(fovy / 2);
  
  let forward = camera3D.getForwardVector();
  let right = camera3D.getRightVector();
  let up = p5.Vector.cross(right, forward);
  
  let ndcX = (mouseX / width) * 2 - 1;
  let ndcY = ((mouseY / height) * 2 - 1);
  
  let camX = ndcX / (f / aspect);
  let camY = ndcY / f;
  
  let dir = p5.Vector.add(
    p5.Vector.add(
      p5.Vector.mult(right, camX),
      p5.Vector.mult(up, camY)
    ),
    forward
  ).normalize();
  
  return {
    origin: camera3D.pos.copy(),
    dir: dir
  };
}

function screenRadiusForWorldSize(pos, worldRadius) {
  // approximate the screen-space radius of a sphere of worldRadius at pos
  let center = worldToScreen(pos);
  if (center.z <= 0) return 0;
  // offset a point to the right by worldRadius in world space
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



function drawGrid() {
  push();
  stroke(80, 80, 80, 100);
  strokeWeight(1);
  noFill();
  let half = grid.size / 2;
  let s = grid.spacing;
  
  // XY plane lines
  for (let x = -half; x <= half; x += s) {
    line(x, -half, 0, x, half, 0);
  }
  for (let y = -half; y <= half; y += s) {
    line(-half, y, 0, half, y, 0);
  }
  
  // XZ plane lines
  for (let x = -half; x <= half; x += s) {
    line(x, 0, -half, x, 0, half);
  }
  for (let z = -half; z <= half; z += s) {
    line(-half, 0, z, half, 0, z);
  }
  
  // YZ plane lines
  for (let y = -half; y <= half; y += s) {
    line(0, y, -half, 0, y, half);
  }
  for (let z = -half; z <= half; z += s) {
    line(0, -half, z, 0, half, z);
  }
  
  // Origin marker
  push();
  stroke(255, 100, 100);
  strokeWeight(5);
  point(0, 0, 0);
  pop();
  
  pop();
}

function mouseWheel(event) {
  if (!hudPanel.mouseOverHUD()) {
    let delta = event.delta * 5;
    let deltaThreshold = 50
    if (delta > deltaThreshold || delta < -deltaThreshold) {
      camera3D.zoom(delta);
    }
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
    
    // Selection outline
    if (this.selected) {
      stroke(255, 0, 255, 120);
      strokeWeight(1);
    } else if (this.hovered) {
      stroke(255, 0, 255, 80);
      strokeWeight(0.5);
    } else {
      noStroke();
    }

    if (this.isControl) {
      fill(255, 200, 100);
    } else {
      fill(100, 200, 255);
    }

    let drawSize = size;
    sphere(drawSize);
    
    // Draw arrows for selected non-control vertices
    if (this.selected && !this.isControl) {
      this.drawAxisArrows(size);
    }
    
    pop();
  }
  
  drawAxisArrows(size) {
    let arrowLength = size * 2.5;
    let arrowHead = size * 0.6;
    strokeWeight(3);
    
    // X axis - Red
    let xColor = _hoveredArrowAxis === 0 || _draggedArrowAxis === 0 ? [255, 150, 150] : [200, 80, 80];
    stroke(xColor[0], xColor[1], xColor[2]);
    line(0, 0, 0, arrowLength, 0, 0);
    push();
    translate(arrowLength, 0, 0);
    rotateZ(-PI/2);
    fill(xColor[0], xColor[1], xColor[2]);
    noStroke();
    cone(arrowHead, arrowHead * 1.5);
    pop();
    
    // Y axis - Green (negative Y is up)
    let yColor = _hoveredArrowAxis === 1 || _draggedArrowAxis === 1 ? [150, 255, 150] : [80, 200, 80];
    stroke(yColor[0], yColor[1], yColor[2]);
    line(0, 0, 0, 0, -arrowLength, 0);
    push();
    translate(0, -arrowLength, 0);
    rotateX(PI);
    fill(yColor[0], yColor[1], yColor[2]);
    noStroke();
    cone(arrowHead, arrowHead * 1.5);
    pop();
    
    // Z axis - Blue
    let zColor = _hoveredArrowAxis === 2 || _draggedArrowAxis === 2 ? [150, 150, 255] : [80, 80, 200];
    stroke(zColor[0], zColor[1], zColor[2]);
    line(0, 0, 0, 0, 0, arrowLength);
    push();
    translate(0, 0, arrowLength);
    rotateX(PI/2);
    fill(zColor[0], zColor[1], zColor[2]);
    noStroke();
    cone(arrowHead, arrowHead * 1.5);
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
      // remove corresponding control - if deleting last vertex, remove the control before it
      if (index === this.vertices.length && index > 0) {
        // deleting last vertex, remove control at index-1
        if (this.controls[index - 1]) this.controls.splice(index - 1, 1);
      } else if (index < this.controls.length) {
        // deleting middle vertex, remove control at same index
        this.controls.splice(index, 1);
      }
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
    // Check hover states
    let hoveredIndex = -1;
    let hoveredIsControl = false;
    
    for (let i = 0; i < this.vertices.length; i++) {
      let v = this.vertices[i];
      let sp = worldToScreen(v.position);
      let r = max(8, screenRadiusForWorldSize(v.position, 15));
      let distp = dist(mouseX, mouseY, sp.x, sp.y);
      if (distp <= r) {
        hoveredIndex = i;
        hoveredIsControl = false;
      }
    }
    
    for (let i = 0; i < (this.controls ? this.controls.length : 0); i++) {
      let cv = this.controls[i];
      if (!cv) continue;
      let sp = worldToScreen(cv.position);
      let r = max(8, screenRadiusForWorldSize(cv.position, 12));
      let distp = dist(mouseX, mouseY, sp.x, sp.y);
      if (distp <= r) {
        hoveredIndex = i;
        hoveredIsControl = true;
      }
    }
    
    // Check arrow hover for selected vertex
    _hoveredArrowAxis = -1;
    if (selectedVertexIndex >= 0 && !selectedIsControl && !_draggingArrow) {
      let selectedV = this.vertices[selectedVertexIndex];
      _hoveredArrowAxis = this.checkArrowHover(selectedV.position);
    }
    
    // Update HUD highlighting
    this.updateHUDHighlighting(hoveredIndex, hoveredIsControl);
    
    for (let i = 0; i < this.vertices.length; i++) {
      let v = this.vertices[i];
      v.selected = (!selectedIsControl && i === selectedVertexIndex);
      v.hovered = (!hoveredIsControl && i === hoveredIndex);
      v.render();
    }
    
    if (this.controls) {
      for (let i = 0; i < this.controls.length; i++) {
        if (this.controls[i]) {
          this.controls[i].selected = (selectedIsControl && i === selectedVertexIndex);
          this.controls[i].hovered = (hoveredIsControl && i === hoveredIndex);
        }
      }
    }
    
    for (let c of this.curves) {
      c.render();
    }
    

    

  }
  
  updateHUDHighlighting(hoveredIndex, hoveredIsControl) {
    // Clear all HUD highlights first
    let hudVertices = document.querySelectorAll('.hud-vertex');
    hudVertices.forEach(el => {
      if (!el.classList.contains('selected')) {
        el.style.backgroundColor = '';
        el.style.border = '';
      }
    });
    
    // Add hover highlight to HUD
    if (hoveredIndex >= 0) {
      let selector = `.hud-vertex[data-index="${hoveredIndex}"][data-is-control="${hoveredIsControl}"]`;
      let hudElement = document.querySelector(selector);
      if (hudElement && !hudElement.classList.contains('selected')) {
        if (hoveredIsControl) {
          hudElement.style.backgroundColor = 'rgba(255, 200, 100, 0.05)';
          hudElement.style.border = '1px solid rgba(255, 200, 100, 0.15)';
        } else {
          hudElement.style.backgroundColor = 'rgba(100, 200, 255, 0.05)';
          hudElement.style.border = '1px solid rgba(100, 200, 255, 0.15)';
        }
      }
    }
    
    // Add selection highlight to HUD
    if (selectedVertexIndex >= 0) {
      let selector = `.hud-vertex[data-index="${selectedVertexIndex}"][data-is-control="${selectedIsControl}"]`;
      let hudElement = document.querySelector(selector);
      if (hudElement) {
        hudElement.style.backgroundColor = 'rgba(255, 0, 255, 0.08)';
        hudElement.style.border = '1px solid rgba(255, 0, 255, 0.2)';
      }
    }
  }
  
  getVertexCount() {
    return this.vertices.length;
  }
  
  getVertex(index) {
    return this.vertices[index];
  }
  
  checkArrowHover(vertexPos) {
    let arrowLength = 37.5; // size * 2.5 where size = 15
    let threshold = 20;
    
    // Get mouse ray for 3D collision
    let ray = getRayFromMouse();
    
    for (let axis = 0; axis < 3; axis++) {
      let axisDir = createVector(0, 0, 0);
      if (axis === 0) axisDir.x = 1;      // X axis
      else if (axis === 1) axisDir.y = -1; // Y axis (up)
      else axisDir.z = 1;                  // Z axis
      
      let arrowEnd = p5.Vector.add(vertexPos, p5.Vector.mult(axisDir, arrowLength));
      
      // Use math.js for precise line-to-ray distance calculation
      let distance = this.rayToLineDistance(ray.origin, ray.dir, vertexPos, arrowEnd);
      
      if (distance < threshold) {
        // Additional screen-space check for better UX
        let screenStart = worldToScreen(vertexPos);
        let screenEnd = worldToScreen(arrowEnd);
        if (screenStart.z > 0 && screenEnd.z > 0) {
          let screenDist = this.pointToLineDistance2D(
            mouseX, mouseY,
            screenStart.x, screenStart.y,
            screenEnd.x, screenEnd.y
          );
          if (screenDist < 25) return axis;
        }
      }
    }
    return -1;
  }
  
  pointToLineDistance2D(px, py, x1, y1, x2, y2) {
    let A = px - x1;
    let B = py - y1;
    let C = x2 - x1;
    let D = y2 - y1;
    
    let dot = A * C + B * D;
    let lenSq = C * C + D * D;
    
    if (lenSq === 0) return Math.sqrt(A * A + B * B);
    
    let param = dot / lenSq;
    param = Math.max(0, Math.min(1, param));
    
    let xx = x1 + param * C;
    let yy = y1 + param * D;
    
    let dx = px - xx;
    let dy = py - yy;
    return Math.sqrt(dx * dx + dy * dy);
  }
  

  
  rayToLineDistance(rayOrigin, rayDir, lineStart, lineEnd) {
    // Use math.js for more precise calculations
    try {
      let lineDir = [lineEnd.x - lineStart.x, lineEnd.y - lineStart.y, lineEnd.z - lineStart.z];
      let toRay = [rayOrigin.x - lineStart.x, rayOrigin.y - lineStart.y, rayOrigin.z - lineStart.z];
      let rayD = [rayDir.x, rayDir.y, rayDir.z];
      
      let a = math.dot(rayD, rayD);
      let b = math.dot(rayD, lineDir);
      let c = math.dot(lineDir, lineDir);
      let d = math.dot(rayD, toRay);
      let e = math.dot(lineDir, toRay);
      
      let denom = a * c - b * b;
      if (Math.abs(denom) < 1e-6) return Infinity;
      
      let s = (b * e - c * d) / denom;
      let t = (a * e - b * d) / denom;
      
      t = Math.max(0, Math.min(1, t)); // Clamp to line segment
      
      let rayPoint = [rayOrigin.x + s * rayD[0], rayOrigin.y + s * rayD[1], rayOrigin.z + s * rayD[2]];
      let linePoint = [lineStart.x + t * lineDir[0], lineStart.y + t * lineDir[1], lineStart.z + t * lineDir[2]];
      
      return math.distance(rayPoint, linePoint);
    } catch (err) {
      // Fallback to p5.js calculation if math.js fails
      let lineDir = p5.Vector.sub(lineEnd, lineStart);
      let toRay = p5.Vector.sub(rayOrigin, lineStart);
      
      let a = p5.Vector.dot(rayDir, rayDir);
      let b = p5.Vector.dot(rayDir, lineDir);
      let c = p5.Vector.dot(lineDir, lineDir);
      let d = p5.Vector.dot(rayDir, toRay);
      let e = p5.Vector.dot(lineDir, toRay);
      
      let denom = a * c - b * b;
      if (abs(denom) < 1e-6) return Infinity;
      
      let s = (b * e - c * d) / denom;
      let t = (a * e - b * d) / denom;
      
      t = constrain(t, 0, 1);
      
      let rayPoint = p5.Vector.add(rayOrigin, p5.Vector.mult(rayDir, s));
      let linePoint = p5.Vector.add(lineStart, p5.Vector.mult(lineDir, t));
      
      return p5.Vector.dist(rayPoint, linePoint);
    }
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
    this.angularFriction = 0.75;
    this.moveSpeed = 6;
    this.flySpeed = 5;
    this.smooth = 0.15;

    this.velocity = createVector(0, 0, 0);
    this.acceleration = 0.3;
    this.friction = 0.75;

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
      if (keys[87]) { // W
        move.add(horiz_movement);
      }
      if (keys[83]) { // S
        move.sub(horiz_movement);
      }
      if (keys[65]) { // A
        move.sub(this.getRightVector());
      }
      if (keys[68]) { // D
        move.add(this.getRightVector());
      }
      if (keys[81]) { // Q down
        move.y -= 1; // Use 1 since it's a direction
      }
      if (keys[69]) { // E up
        move.y += 1;
      }
      // Additional vertical controls: Space = down, CONTROL/Shift = up
      if (keys[32]) { // SPACE
        move.y -= 1;
      }
      if (keys[17] || keys[CONTROL] || keys[SHIFT]) { // CONTROL
        move.y += 1;
      }
    }

    if (move.mag() > 0) {
      move.normalize();
      move.mult(this.acceleration);
      this.velocity.add(move.mult(this.flySpeed));
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

  isMouseOver() {
    
  }
}

// ========== HUD PANEL CLASS ==========
class HUDPanel {
  constructor() {
    this._lastVertexCount = -1;
    this.container = document.getElementById('hud') || (function(){ let d=document.createElement('div'); d.id='hud'; document.body.appendChild(d); return d; })();
    // create structural elements
    this.titleRow = document.createElement('div'); this.titleRow.style.display = 'flex'; this.titleRow.style.justifyContent = 'space-between'; this.titleRow.style.alignItems = 'center';
    this.title = document.createElement('h3'); this.title.innerText = 'VERTICES'; this.title.style.margin = '0';
    this.hideButton = document.createElement('button'); this.hideButton.innerText = '−'; this.hideButton.className = 'hud-btn'; this.hideButton.style.width = '20px'; this.hideButton.style.height = '20px'; this.hideButton.style.padding = '0';
    this.vertexList = document.createElement('div');
    this.isHidden = false;
    this.controlsRow = document.createElement('div');
    this.speedLabel = document.createElement('span');
    this.speedSlider = document.createElement('input'); this.speedSlider.type='range'; this.speedSlider.min='1'; this.speedSlider.max='100'; this.speedSlider.value='10';
    this.importInput = document.createElement('input'); this.importInput.type = 'file'; this.importInput.accept = '.json,application/json'; this.importInput.style.display='none';
    this.importButton = document.createElement('button'); this.importButton.innerText = 'Import JSON';
    this.exportButton = document.createElement('button'); this.exportButton.innerText = 'Export JSON';
    this.resetButton = document.createElement('button'); this.resetButton.innerText = 'Reset saved settings';
    this.clearButton = document.createElement('button'); this.clearButton.innerText = 'Clear all vertices';
    this.testButton = document.createElement('button'); this.testButton.innerText = 'Add test vertices';
    this.coordRow = document.createElement('div');
    this.coordInput = document.createElement('input'); this.coordInput.type='text'; this.coordInput.className='hud-input'; this.coordInput.style.width='180px'; this.coordInput.placeholder='x, y, z';
    this.undoButton = document.createElement('button'); this.undoButton.innerText='Undo'; this.undoButton.className='hud-btn';
    this.coordHistory = [];

    // assemble
    this.titleRow.appendChild(this.title);
    this.titleRow.appendChild(this.hideButton);
    this.container.appendChild(this.titleRow);
    this.container.appendChild(this.vertexList);
    this.controlsRow.appendChild(this.speedLabel); this.controlsRow.appendChild(this.speedSlider);
    this.controlsRow.appendChild(document.createElement('br'));
    this.controlsRow.appendChild(this.importButton); this.controlsRow.appendChild(this.exportButton); this.controlsRow.appendChild(this.resetButton); this.controlsRow.appendChild(this.clearButton); this.controlsRow.appendChild(this.testButton);
    this.container.appendChild(this.controlsRow);
    this.container.appendChild(document.createElement('hr'));
    this.coordRow.appendChild(this.coordInput); this.coordRow.appendChild(this.undoButton);
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
    this.speedSlider.addEventListener('input', ()=>{ moveSpeed = parseFloat(this.speedSlider.value); saveSettings(); this.updateSpeedLabel(); });
    this.coordInput.addEventListener('input', ()=>{ this.updateCoordinates(); });
    this.coordInput.addEventListener('keydown', (e)=>{ e.stopPropagation(); });
    this.coordInput.addEventListener('keyup', (e)=>{ e.stopPropagation(); });
    this.undoButton.addEventListener('click', ()=>{ this.undoCoordinates(); });
    this.hideButton.addEventListener('click', ()=>{ this.isHidden = !this.isHidden; this.vertexList.style.display = this.isHidden ? 'none' : 'block'; this.controlsRow.style.display = this.isHidden ? 'none' : 'block'; this.coordRow.style.display = this.isHidden ? 'none' : 'block'; this.hideButton.innerText = this.isHidden ? '+' : '−'; });
  }

  updateSpeedLabel() { this.speedLabel.innerText = ' Move speed: ' + Math.round(moveSpeed) + ' '; this.speedSlider.value = moveSpeed; }

  render(coaster, selectedIndex) {
    try {
      console.log('HUDPanel.render called; vertexCount=', coaster.getVertexCount(), 'selectedIndex=', selectedIndex, 'selectedIsControl=', selectedIsControl);
    } catch (e) {}
    // update speed label
    this.updateSpeedLabel();
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
        let del = document.createElement('button'); del.className='hud-btn'; del.innerText='×'; del.addEventListener('click', (ev)=>{ ev.stopPropagation(); coaster.deleteVertex(i); if (selectedVertexIndex===i){ selectedVertexIndex=-1; selectedIsControl=false; } this.render(coaster, selectedIndex); });
        let content = document.createElement('div'); content.className='hud-vertex-content'; content.innerHTML = '<strong>Vertex '+i+'</strong><div>('+Math.round(v.position.x)+', '+Math.round(v.position.y)+', '+Math.round(v.position.z)+')</div>';
        div.appendChild(content);
        div.appendChild(del);
        div.addEventListener('click', ()=>{ selectedVertexIndex = i; selectedIsControl = false; this.syncCoordInputs(); });
        div.addEventListener('mouseenter', ()=>{ 
          if (!(i === selectedIndex && !selectedIsControl)) {
            div.style.backgroundColor = 'rgba(100, 200, 255, 0.1)';
            div.style.border = '1px solid rgba(100, 200, 255, 0.3)';
          }
        });
        div.addEventListener('mouseleave', ()=>{ 
          if (!(i === selectedIndex && !selectedIsControl)) {
            div.style.backgroundColor = '';
            div.style.border = '';
          }
        });
        this.vertexList.appendChild(div);
        
        // add control vertex if present
        if (coaster.controls && coaster.controls[i]) {
          let cv = coaster.controls[i];
          let cdiv = document.createElement('div'); cdiv.className='hud-vertex hud-control'+(i===selectedIndex && selectedIsControl?' selected':'');
          cdiv.dataset.index = i; cdiv.dataset.isControl = true;
          let ccontent = document.createElement('div'); ccontent.className='hud-vertex-content'; ccontent.innerHTML = '<strong style="color:#fc8">CONTROL '+i+'</strong><div>('+Math.round(cv.position.x)+', '+Math.round(cv.position.y)+', '+Math.round(cv.position.z)+')</div>';
          cdiv.appendChild(ccontent);
          cdiv.addEventListener('click', ()=>{ selectedVertexIndex = i; selectedIsControl = true; this.syncCoordInputs(); });
          cdiv.addEventListener('mouseenter', ()=>{ 
            if (!(i === selectedIndex && selectedIsControl)) {
              cdiv.style.backgroundColor = 'rgba(255, 200, 100, 0.1)';
              cdiv.style.border = '1px solid rgba(255, 200, 100, 0.3)';
            }
          });
          cdiv.addEventListener('mouseleave', ()=>{ 
            if (!(i === selectedIndex && selectedIsControl)) {
              cdiv.style.backgroundColor = '';
              cdiv.style.border = '';
            }
          });
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
        this.coordInput.value = '(' + Math.round(v.position.x) + ', ' + Math.round(v.position.y) + ', ' + Math.round(v.position.z) + ')';
        this.coordInput.style.display='inline-block'; this.undoButton.style.display='inline-block';
        return;
      }
    }
    this.coordInput.style.display='none'; this.undoButton.style.display='none';
  }
  
  updateCoordinates() {
    if (selectedVertexIndex < 0) return;
    let coords = this.coordInput.value.split(',').map(s => parseFloat(s.trim()));
    if (coords.length === 3 && coords.every(c => !isNaN(c))) {
      let v = selectedIsControl ? (coaster.controls[selectedVertexIndex]||null) : coaster.getVertex(selectedVertexIndex);
      if (v) {
        this.coordHistory.push({x: v.position.x, y: v.position.y, z: v.position.z});
        if (this.coordHistory.length > 10) this.coordHistory.shift();
        
        if (selectedIsControl) coaster.updateControlPosition(selectedVertexIndex, createVector(coords[0], coords[1], coords[2]));
        else coaster.updateVertexPosition(selectedVertexIndex, createVector(coords[0], coords[1], coords[2]));
        coaster.updateCurves();
        saveSettings();
      }
    }
  }
  
  undoCoordinates() {
    if (selectedVertexIndex < 0 || this.coordHistory.length === 0) return;
    let lastPos = this.coordHistory.pop();
    if (selectedIsControl) coaster.updateControlPosition(selectedVertexIndex, createVector(lastPos.x, lastPos.y, lastPos.z));
    else coaster.updateVertexPosition(selectedVertexIndex, createVector(lastPos.x, lastPos.y, lastPos.z));
    coaster.updateCurves();
    this.syncCoordInputs();
    saveSettings();
  }

  mouseOverHUD() {
    let rect = this.container.getBoundingClientRect();
    return (mouseX >= rect.left && mouseX <= rect.right && mouseY >= rect.top && mouseY <= rect.bottom);
  }
}
