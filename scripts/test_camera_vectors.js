// Test script for camera forward/right vector math
const PI = Math.PI;
function cos(x){return Math.cos(x);}function sin(x){return Math.sin(x);}function normalize(v){let m=Math.hypot(v.x,v.y,v.z); if(m===0) return {x:0,y:0,z:0}; return {x:v.x/m,y:v.y/m,z:v.z/m};}
function cross(a,b){return {x: a.y*b.z - a.z*b.y, y: a.z*b.x - a.x*b.z, z: a.x*b.y - a.y*b.x}};

function getForward(yaw, pitch){
  let cosY = cos(yaw), sinY = sin(yaw);
  let cosP = cos(pitch), sinP = sin(pitch);
  // pitch around X: (0,0,-1) -> (0, sinP, -cosP)
  let px = 0; let py = sinP; let pz = -cosP;
  // yaw around Y: apply rotation
  let wx = cosY * px - sinY * pz; // = sinY * cosP
  let wy = py;
  let wz = sinY * px + cosY * pz; // = -cosY * cosP
  return normalize({x:wx,y:wy,z:wz});
}
function getRight(yaw,pitch){
  let f = getForward(yaw,pitch);
  let up = {x:0,y:1,z:0};
  return normalize(cross(f,up));
}
function dot(a,b){return a.x*b.x + a.y*b.y + a.z*b.z}

let yaws = [ -0.01, 0, 0.01, PI*0.4999, PI*0.5, PI*0.5001, PI-0.01, PI, PI+0.01, 1.5*PI, 2*PI-0.01 ];
let pitch = 0;
console.log('yaw, forward, right, dot(right,forward) (should be ~0), A_move dot forward (should be ~0)');
for(let y of yaws){
  let f = getForward(y,pitch);
  let r = getRight(y,pitch);
  let d = dot(r,f);
  // simulate pressing A (move = -r) and check projection onto forward
  let Aproj = dot({x:-r.x,y:-r.y,z:-r.z}, f);
  let Dproj = dot(r,f);
  console.log(y.toFixed(4)+', f=(' + f.x.toFixed(3)+','+f.y.toFixed(3)+','+f.z.toFixed(3)+') r=(' + r.x.toFixed(3)+','+r.y.toFixed(3)+','+r.z.toFixed(3)+') dot=' + d.toFixed(6) + ' Aproj=' + Aproj.toFixed(6) + ' Dproj=' + Dproj.toFixed(6));
}

// Also test with small pitch
console.log('\nTesting small pitch (0.2)');
for(let y of [0, Math.PI/2, Math.PI, 3*Math.PI/2]){
  let f = getForward(y,0.2);
  let r = getRight(y,0.2);
  console.log('yaw',y.toFixed(4),'f',f,'r',r,'dot',dot(f,r).toFixed(6));
}
