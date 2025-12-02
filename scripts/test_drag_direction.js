const PI = Math.PI;
function cos(x){return Math.cos(x);}function sin(x){return Math.sin(x);}function normalize(v){let m=Math.hypot(v.x,v.y,v.z); if(m===0) return {x:0,y:0,z:0}; return {x:v.x/m,y:v.y/m,z:v.z/m};}
function cross(a,b){return {x: a.y*b.z - a.z*b.y, y: a.z*b.x - a.x*b.z, z: a.x*b.y - a.y*b.x}};
function dot(a,b){return a.x*b.x + a.y*b.y + a.z*b.z}

function getForward(yaw,pitch=0){
  let cosY = cos(yaw), sinY = sin(yaw);
  let cosP = cos(pitch), sinP = sin(pitch);
  let px = 0; let py = sinP; let pz = -cosP;
  let wx = cosY * px - sinY * pz;
  let wy = py;
  let wz = sinY * px + cosY * pz;
  return normalize({x:wx,y:wy,z:wz});
}
function getRight(yaw,pitch=0){
  let f = getForward(yaw,pitch);
  let up = {x:0,y:1,z:0};
  return normalize(cross(f,up));
}

function testYaw(yaw){
  const delta = 0.01; // small positive yaw change (like moving mouse right)
  let f0 = getForward(yaw,0);
  let r0 = getRight(yaw,0);
  // world point ahead
  let P = {x: f0.x*10, y: f0.y*10, z: f0.z*10};
  let px0 = dot(P, r0);
  // new forward after yaw+delta
  let f1 = getForward(yaw+delta,0);
  // new right vector at same original camera basis? We measure projection onto original right axis
  let px1 = dot(P, r0); // but we want apparent motion of P on screen relative to new camera orientation
  // Actually project P into camera space after rotation: compute coordinates in new camera basis
  // New right, up, forward axes:
  let r1 = getRight(yaw+delta,0);
  let u1 = {x:0,y:1,z:0}; // up roughly
  let f1vec = f1;
  // In camera space, coordinates = [dot(P, r1), dot(P, u1), dot(P, f1vec)]
  let screenX0 = dot(P, r0);
  let screenX1 = dot(P, r1);
  return {yaw: yaw, screenDelta: screenX1 - screenX0, screenX0: screenX0, screenX1: screenX1};
}

let yaws = [0, 0.1, 0.5, Math.PI*0.499, Math.PI*0.5, Math.PI*0.501, Math.PI-0.1, Math.PI, Math.PI+0.1, 1.5*Math.PI, 2*Math.PI-0.1];
console.log('yaw, screenDelta (positive => object moves right after positive yaw delta). We expect positive yaw delta (camera rotates right) -> scene moves left -> screenDelta negative.');
for(let y of yaws){
  console.log(testYaw(y));
}
