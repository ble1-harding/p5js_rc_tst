// Rollercoaster Modeling Program
// 3D vertex-based track design with curve templates and HUD manipulation

let coaster;
let hudPanel;
let camera3D;
let selectedVertexIndex = -1;
let viewpoints = [];
let currentViewpoint = 0;
let curveTypeIndex = 0;
let curveTypes = ['line', 'bezier', 'arc45', 'arc90', 'elliptical'];

function setup() {
  createCanvas(windowWidth, windowHeight, WEBGL);
  
  // Initialize coaster system
  coaster = new Coaster();
  hudPanel = new HUDPanel();
  camera3D = new Camera3D();
  
  // Define camera snap positions
  viewpoints = [
    { name: 'Front', pos: createVector(0, 0, 1000), target: createVector(0, 0, 0) },
    { name: 'Top', pos: createVector(0, -800, 0), target: createVector(0, 0, 0) },
    { name: 'Side', pos: createVector(1000, 0, 0), target: createVector(0, 0, 0) },
    { name: 'Isometric', pos: createVector(600, -600, 600), target: createVector(0, 0, 0) }
  ];
  
  // Add default vertices
  coaster.addVertex(createVector(-200, 0, -300));
  coaster.addVertex(createVector(0, -100, 0));
  coaster.addVertex(createVector(200, 0, 300));
}

function draw() {
  background(50);
  
  // Lighting
  lights();
  ambientLight(150);
  directionalLight(255, 255, 255, 0, 1, -1);
  
  // Update camera
  camera3D.update();
  
  // Render coaster
  coaster.render();
  
  // Render HUD
  push();
  perspective();
  camera(0, 0, 500, 0, 0, 0, 0, 1, 0);
  hudPanel.render(coaster, selectedVertexIndex);
  pop();
  
  // Display viewpoint info
  push();
  fill(255);
  textSize(14);
  text('Viewpoint: ' + viewpoints[currentViewpoint].name + ' (Press 1-4)', -windowWidth/2 + 10, -windowHeight/2 + 25);
  pop();
}

function keyPressed() {
  if (key === '1') currentViewpoint = 0;
  if (key === '2') currentViewpoint = 1;
  if (key === '3') currentViewpoint = 2;
  if (key === '4') currentViewpoint = 3;
  
  if (key === 'a' || key === 'A') {
    coaster.addVertex(createVector(random(-300, 300), random(-200, 0), random(-300, 300)));
    hudPanel.deleteClicked = false;
  }
  if (key === 'd' || key === 'D') {
    if (selectedVertexIndex >= 0) {
      coaster.deleteVertex(selectedVertexIndex);
      selectedVertexIndex = -1;
      hudPanel.deleteClicked = false;
    }
  }
  if (key === 'r' || key === 'R') {
    setup();
  }
  
  // Cycle curve types with C key
  if (key === 'c' || key === 'C') {
    curveTypeIndex = (curveTypeIndex + 1) % curveTypes.length;
    coaster.setCurveType(curveTypeIndex);
  }
  
  // Coordinate editing with arrow keys
  if (selectedVertexIndex >= 0) {
    let v = coaster.getVertex(selectedVertexIndex);
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

function mousePressed() {
  if (!hudPanel.mouseOverHUD()) {
    // 3D ray picking
    let ray = getRayFromMouse();
    let closestIndex = -1;
    let closestDist = 20;
    
    for (let i = 0; i < coaster.getVertexCount(); i++) {
      let v = coaster.getVertex(i);
      let screenPos = screenCoord(v.position);
      let dist = sqrt(pow(mouseX - screenPos.x, 2) + pow(mouseY - screenPos.y, 2));
      
      if (dist < closestDist) {
        closestDist = dist;
        closestIndex = i;
      }
    }
    
    selectedVertexIndex = closestIndex;
  }
}

function getRayFromMouse() {
  // Simplified ray-sphere intersection
  return { mx: mouseX, my: mouseY };
}

function screenCoord(pos) {
  // Project 3D point to screen (simplified)
  let vp = viewpoints[currentViewpoint];
  let dx = pos.x - vp.pos.x;
  let dy = pos.y - vp.pos.y;
  let dz = pos.z - vp.pos.z;
  
  let sx = (width / 2) + (dx * 300) / (dz + 1000);
  let sy = (height / 2) + (dy * 300) / (dz + 1000);
  
  return { x: sx, y: sy };
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
    
    if (this.selected) {
      fill(255, 100, 100);
    } else if (this.isControl) {
      fill(255, 200, 100);
    } else {
      fill(100, 200, 255);
    }
    
    sphere(size);
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
    switch(this.type) {
      case 'line': return this.getLinePoints();
      case 'arc90': return this.getArcPoints(Math.PI / 2);
      case 'arc45': return this.getArcPoints(Math.PI / 4);
      case 'elliptical': return this.getEllipticalPoints();
      case 'bezier': return this.getBezierPoints();
      default: return this.getLinePoints();
    }
  }
  
  getLinePoints() {
    let points = [];
    for (let i = 0; i <= this.segments; i++) {
      let t = i / this.segments;
      let p = p5.Vector.lerp(this.start.position, this.end.position, t);
      points.push(p);
    }
    return points;
  }
  
  getArcPoints(angle) {
    let points = [];
    let startPos = this.start.position;
    let endPos = this.end.position;
    let midPoint = p5.Vector.add(startPos, endPos).mult(0.5);
    
    let radius = this.radius;
    let startAngle = p5.Vector.sub(startPos, midPoint).heading();
    
    for (let i = 0; i <= this.segments; i++) {
      let t = i / this.segments;
      let currentAngle = startAngle + angle * t;
      let x = midPoint.x + radius * cos(currentAngle);
      let y = midPoint.y;
      let z = midPoint.z + radius * sin(currentAngle);
      points.push(createVector(x, y, z));
    }
    return points;
  }
  
  getEllipticalPoints() {
    let points = [];
    let startPos = this.start.position;
    let endPos = this.end.position;
    let midPoint = p5.Vector.add(startPos, endPos).mult(0.5);
    
    for (let i = 0; i <= this.segments; i++) {
      let t = i / this.segments;
      let angle = TWO_PI * t;
      let x = midPoint.x + this.radius * cos(angle);
      let y = midPoint.y + this.radiusY * sin(angle);
      let z = midPoint.z;
      points.push(createVector(x, y, z));
    }
    return points;
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
  }
  
  addVertex(pos, isControl = false) {
    let v = new Vertex(pos, isControl);
    this.vertices.push(v);
    this.updateCurves();
    return v;
  }
  
  deleteVertex(index) {
    if (index >= 0 && index < this.vertices.length) {
      this.vertices.splice(index, 1);
      this.updateCurves();
    }
  }
  
  updateVertexPosition(index, newPos) {
    if (index >= 0 && index < this.vertices.length) {
      this.vertices[index].position = newPos.copy();
    }
  }
  
  updateCurves() {
    this.curves = [];
    for (let i = 0; i < this.vertices.length - 1; i++) {
      let curveType = i % 4;
      let type = ['line', 'bezier', 'arc45', 'arc90'][curveType];
      
      let controlVertex = null;
      if (type === 'bezier' && i > 0 && i < this.vertices.length - 1) {
        let offset = p5.Vector.sub(this.vertices[i+1].position, this.vertices[i].position);
        offset.rotate(HALF_PI).mult(0.5);
        controlVertex = new Vertex(p5.Vector.add(this.vertices[i].position, offset), true);
      }
      
      this.curves.push(new CurveSegment(type, this.vertices[i], this.vertices[i+1], {
        controlVertex: controlVertex,
        radius: 100
      }));
    }
  }
  
  setCurveType(typeIndex) {
    // Apply curve type to all segments
    for (let i = 0; i < this.curves.length; i++) {
      this.curves[i].type = curveTypes[typeIndex];
    }
  }
  
  render() {
    for (let v of this.vertices) {
      v.render();
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
    this.angle = 0;
    this.elevation = -PI/4;
    this.distance = 600;
  }
  
  update() {
    let vp = viewpoints[currentViewpoint];
    let targetPos = vp.target;
    let camPos = vp.pos;
    camera(camPos.x, camPos.y, camPos.z, targetPos.x, targetPos.y, targetPos.z, 0, 1, 0);
  }
  
  rotate(dx, dy) {
    this.angle -= dx * 0.01;
    this.elevation += dy * 0.01;
    this.elevation = constrain(this.elevation, -PI/2, PI/2);
  }
  
  zoom(delta) {
    this.distance += delta * 0.5;
    this.distance = constrain(this.distance, 100, 2000);
  }
}

// ========== HUD PANEL CLASS ==========
class HUDPanel {
  constructor() {
    this.inputs = [];
    this.deleteButtons = [];
    this.width = 320;
    this.height = windowHeight - 20;
    this.x = -windowWidth/2 + 10;
    this.y = -windowHeight/2 + 50;
    this.scrollOffset = 0;
  }
  
  render(coaster, selectedIndex) {
    push();
    fill(0, 0, 0, 220);
    stroke(100, 150, 200);
    strokeWeight(2);
    rect(this.x, this.y, this.width, this.height);
    
    fill(100, 150, 200);
    textAlign(LEFT);
    textSize(14);
    textStyle(BOLD);
    text('VERTICES', this.x + 15, this.y + 25);
    textStyle(NORMAL);
    
    let itemHeight = 85;
    let scrollY = this.y + 45;
    let visibleItems = floor((this.height - 70) / itemHeight);
    
    for (let i = 0; i < coaster.getVertexCount(); i++) {
      let v = coaster.getVertex(i);
      let isSelected = i === selectedIndex;
      
      if (scrollY > this.y + this.height - 100) break;
      
      // Vertex box
      if (isSelected) {
        fill(80, 100, 150);
        stroke(150, 200, 255);
      } else {
        fill(30, 40, 60);
        stroke(60, 80, 120);
      }
      strokeWeight(1);
      rect(this.x + 8, scrollY, this.width - 16, itemHeight - 5);
      
      // Vertex label
      fill(150, 200, 255);
      textSize(12);
      textStyle(BOLD);
      text('Vertex ' + i, this.x + 15, scrollY + 18);
      textStyle(NORMAL);
      
      // Coordinates display
      textSize(10);
      fill(200, 200, 200);
      text('X: ' + v.position.x.toFixed(1), this.x + 15, scrollY + 32);
      text('Y: ' + v.position.y.toFixed(1), this.x + 15, scrollY + 45);
      text('Z: ' + v.position.z.toFixed(1), this.x + 15, scrollY + 58);
      
      // Delete button
      fill(180, 80, 80);
      rect(this.x + 225, scrollY + 5, 90, 22);
      fill(255);
      textSize(11);
      text('Delete', this.x + 240, scrollY + 19);
      
      // Store button position for click detection
      if (mouseIsPressed && mouseX > this.x + 225 && mouseX < this.x + 315 &&
          mouseY > scrollY + 5 && mouseY < scrollY + 27 && !hudPanel.deleteClicked) {
        coaster.deleteVertex(i);
        hudPanel.deleteClicked = true;
        if (selectedVertexIndex === i) selectedVertexIndex = -1;
      }
      
      scrollY += itemHeight;
    }
    
    if (!mouseIsPressed) {
      hudPanel.deleteClicked = false;
    }
    
    // Instructions
    fill(150, 150, 150);
    textSize(9);
    text('A: Add | D: Del | 1-4: View | C: Curve', this.x + 15, this.y + this.height - 30);
    text('Curve: ' + curveTypes[curveTypeIndex].toUpperCase(), this.x + 15, this.y + this.height - 15);
    
    pop();
  }
  
  mouseOverHUD() {
    return mouseX > this.x && mouseX < this.x + this.width &&
           mouseY > this.y && mouseY < this.y + this.height;
  }
}
