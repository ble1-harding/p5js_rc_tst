// Tutorial video: https://www.youtube.com/watch?v=jutGtBIE6kk 
function preload(){
  szn = loadModel('szn.obj')
  check = loadImage('check.png')
}

created_gizmos = []

function setup() {
  createCanvas(800, 400, WEBGL);
  cam = createCamera();
  created_gizmos.push(new gizmo(0, 0, 0));
  created_gizmos.push(new gizmo(10, 50, 100))
  noStroke()
  szn.pos = {x: 0, y: 0, z: 0}
}

function draw() {
  background(220);
  // If the gizmos aren't being clicked, then allow looking around with dragging
  let canLookDrag = true
  // loop backwards to allow for looping without issue if items are deleted
  for (let i = created_gizmos.length - 1; i >= 0; i--) {
    if (created_gizmos[i].gizmoClicked) {
      canLookDrag = false;
      break;
    }
  }
  if(canLookDrag) orbitControl()
  
  // Lighting
  lights()
  pointLight(255, 255, 255, 200, 400, -600)
  
  // Draw checkerboard
  push()
    let gizPos = created_gizmos[1].pos
    translate(gizPos.x, gizPos.y, gizPos.z)
    rotateX(-PI/2)
    texture(check)
    plane(700, 700, 100, 10)
  pop()
  
  // Draw the Suzanne Model
  push()
    szn.pos = created_gizmos[0].pos;
  
    translate(szn.pos.x, szn.pos.y, szn.pos.z)
  
    specularMaterial(250);
    shininess(10);
    fill(255, 100, 0)
    model(szn)
  pop()
  
  for (let i = created_gizmos.length - 1; i >= 0; i--) {
    created_gizmos[i].show()
  }
}

function mousePressed() {
  for (let i = created_gizmos.length - 1; i >= 0; i--) {
    created_gizmos[i].update()
  }
}

function mouseReleased() {
  for (let i = created_gizmos.length - 1; i >= 0; i--) {
    created_gizmos[i].released()
  }
}