(function(){
"use strict";
const $=s=>document.querySelector(s);
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const lerp=(a,b,t)=>a+(b-a)*t;
const wrapA=a=>{while(a>Math.PI)a-=Math.PI*2;while(a<-Math.PI)a+=Math.PI*2;return a;};
function rng(seed){return function(){seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
const srand=rng(20261027);
const rnd=(a,b)=>a+Math.random()*(b-a);
const pick=a=>a[Math.floor(Math.random()*a.length)];

/* ---------- renderer ---------- */
const canvas=$('#c');
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(62,1,0.1,1200);
function resize(){const w=canvas.clientWidth||innerWidth,h=canvas.clientHeight||innerHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}
addEventListener('resize',resize);resize();

const FOG=0xe9997a;
scene.fog=new THREE.Fog(FOG,90,380);
const sky=new THREE.Mesh(new THREE.SphereGeometry(800,32,16),new THREE.ShaderMaterial({
  side:THREE.BackSide,depthWrite:false,fog:false,
  uniforms:{top:{value:new THREE.Color(0x1c2a5c)},mid:{value:new THREE.Color(0xc9637e)},bot:{value:new THREE.Color(0xffb26a)}},
  vertexShader:'varying vec3 vP;void main(){vP=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
  fragmentShader:'uniform vec3 top,mid,bot;varying vec3 vP;void main(){float h=vP.y;vec3 c=h>0.12?mix(mid,top,smoothstep(0.12,0.65,h)):mix(bot,mid,smoothstep(-0.04,0.12,h));gl_FragColor=vec4(c,1.0);}'
}));
scene.add(sky);
const sunDir=new THREE.Vector3(-0.75,0.16,-0.64).normalize();
const sun=new THREE.Mesh(new THREE.CircleGeometry(38,32),new THREE.MeshBasicMaterial({color:0xfff0c0,fog:false}));
scene.add(sun);
scene.add(new THREE.HemisphereLight(0xffd9b8,0x3c3f5a,0.95));
const dl=new THREE.DirectionalLight(0xffbe86,0.95);dl.position.copy(sunDir).multiplyScalar(100);scene.add(dl);

/* ---------- city layout ---------- */
const CELL=56,ROAD=14,BLOCK=CELL-ROAD,N=8,HALF=N*CELL/2,LANE=3.5;
const R=[];for(let k=0;k<=N;k++)R.push(-HALF+k*CELL);
const BC=[];for(let k=0;k<N;k++)BC.push(-HALF+k*CELL+CELL/2);
const boxes=[];          // collision AABBs {x0,x1,z0,z1,h}
const blocks=[];         // {x,z,park}
function inBlock1(v){if(v<=-HALF||v>=HALF)return false;const l=(v+HALF)%CELL;return l>ROAD/2&&l<CELL-ROAD/2;}
function groundH(x,z){return inBlock1(x)&&inBlock1(z)?0.3:0;}

// textures
function canvasTex(w,h,draw){const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;return t;}
const winRand=rng(77);
const litMap=[];for(let i=0;i<16;i++)litMap.push(winRand()<0.32);
const wallTex=canvasTex(128,128,(g,w,h)=>{
  g.fillStyle='#dcd6cd';g.fillRect(0,0,w,h);
  for(let r=0;r<4;r++){g.fillStyle='rgba(0,0,0,.09)';g.fillRect(0,r*32,w,3);
    for(let c=0;c<4;c++){const lit=litMap[r*4+c];g.fillStyle=lit?'#ffe0a0':'#394456';g.fillRect(c*32+6,r*32+8,20,19);
      if(!lit){g.fillStyle='rgba(255,255,255,.18)';g.fillRect(c*32+6,r*32+8,20,4);}}}
});
const emTex=canvasTex(128,128,(g,w,h)=>{g.fillStyle='#000';g.fillRect(0,0,w,h);
  for(let r=0;r<4;r++)for(let c=0;c<4;c++)if(litMap[r*4+c]){g.fillStyle='#ffc770';g.fillRect(c*32+6,r*32+8,20,19);}});
const dashTex=canvasTex(8,64,(g,w,h)=>{g.clearRect(0,0,w,h);g.fillStyle='#f2efe6';g.fillRect(0,0,w,h/2);});
const blobTex=canvasTex(64,64,(g,w,h)=>{const gr=g.createRadialGradient(32,32,2,32,32,32);gr.addColorStop(0,'rgba(0,0,0,.55)');gr.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=gr;g.fillRect(0,0,w,h);});
blobTex.wrapS=blobTex.wrapT=THREE.ClampToEdgeWrapping;
const blobMat=new THREE.MeshBasicMaterial({map:blobTex,transparent:true,depthWrite:false});
const blobGeo=new THREE.PlaneGeometry(1,1);blobGeo.rotateX(-Math.PI/2);
function blob(sx,sz){const m=new THREE.Mesh(blobGeo,blobMat);m.scale.set(sx,1,sz);m.position.y=0.04;m.renderOrder=1;return m;}

// ground
const grass=new THREE.Mesh(new THREE.PlaneGeometry(3000,3000),new THREE.MeshLambertMaterial({color:0x56703a}));
grass.rotation.x=-Math.PI/2;grass.position.y=-0.06;scene.add(grass);
const asphalt=new THREE.Mesh(new THREE.PlaneGeometry(N*CELL+ROAD,N*CELL+ROAD),new THREE.MeshLambertMaterial({color:0x3b3c43}));
asphalt.rotation.x=-Math.PI/2;scene.add(asphalt);
const LEN=N*CELL+ROAD;
dashTex.repeat.set(1,LEN/6);
const dashMat=new THREE.MeshBasicMaterial({map:dashTex,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2});
for(const r of R){
  const a=new THREE.Mesh(new THREE.PlaneGeometry(0.25,LEN),dashMat);a.rotation.x=-Math.PI/2;a.position.set(r,0.02,0);scene.add(a);
  const b=new THREE.Mesh(new THREE.PlaneGeometry(0.25,LEN),dashMat);b.rotation.x=-Math.PI/2;b.rotation.z=Math.PI/2;b.position.set(0,0.02,r);scene.add(b);
}
// crosswalk stripes
const zebraMat=new THREE.MeshBasicMaterial({color:0xe9e5da,polygonOffset:true,polygonOffsetFactor:-1});
const zebraGeo=new THREE.PlaneGeometry(0.6,3.2);zebraGeo.rotateX(-Math.PI/2);
const zebraCount=(N+1)*(N+1)*4*5;
const zebra=new THREE.InstancedMesh(zebraGeo,zebraMat,zebraCount);
{const d=new THREE.Object3D();let i=0;
 for(const x of R)for(const z of R)for(let s=0;s<4;s++)for(let k=0;k<5;k++){
   const off=-2.4+k*1.2;let px,pz,rot;
   if(s===0){px=x+off;pz=z+9;rot=0;}else if(s===1){px=x+off;pz=z-9;rot=0;}else if(s===2){px=x+9;pz=z+off;rot=Math.PI/2;}else{px=x-9;pz=z+off;rot=Math.PI/2;}
   d.position.set(px,0.015,pz);d.rotation.set(0,rot,0);d.updateMatrix();zebra.setMatrixAt(i++,d.matrix);}
}
scene.add(zebra);

const walkMat=new THREE.MeshLambertMaterial({color:0x9c978d});
const parkMat=new THREE.MeshLambertMaterial({color:0x5f8a3c});
const blockGeo=new THREE.BoxGeometry(BLOCK,0.3,BLOCK);
const wallTints=[0xffffff,0xf0d6b8,0xbcd0e6,0xe2b9a6,0xb3c4a4,0xd2c8e6,0xf3e3a8];
const wallMats=wallTints.map(c=>new THREE.MeshLambertMaterial({color:c,map:wallTex,emissive:0xffffff,emissiveMap:emTex,emissiveIntensity:0.55}));
const roofMat=new THREE.MeshLambertMaterial({color:0x58534f});
function building(x,z,w,d,h){
  const geo=new THREE.BoxGeometry(w,h,d);const uv=geo.attributes.uv;
  for(let i=0;i<uv.count;i++){const f=Math.floor(i/4);let su=1,sv=1;
    if(f<2){su=d/12;sv=h/14;}else if(f>3){su=w/12;sv=h/14;}
    uv.setXY(i,uv.getX(i)*su,uv.getY(i)*sv);}
  const wm=wallMats[Math.floor(srand()*wallMats.length)];
  const m=new THREE.Mesh(geo,[wm,wm,roofMat,roofMat,wm,wm]);m.position.set(x,0.3+h/2,z);scene.add(m);
  if(h>24&&srand()<0.7){const t=new THREE.Mesh(new THREE.BoxGeometry(w*0.35,2.2,d*0.35),roofMat);t.position.set(x+(srand()-0.5)*w*0.3,0.3+h+1.1,z+(srand()-0.5)*d*0.3);scene.add(t);}
  boxes.push({x0:x-w/2,x1:x+w/2,z0:z-d/2,z1:z+d/2,h:h+0.3});
}
const treePos=[];
for(let i=0;i<N;i++)for(let j=0;j<N;j++){
  const bx=BC[i],bz=BC[j];const dc=Math.hypot(bx,bz)/HALF;
  const park=srand()<0.14&&!(i===4&&j===4);
  const base=new THREE.Mesh(blockGeo,park?[walkMat,walkMat,parkMat,walkMat,walkMat,walkMat]:walkMat);base.position.set(bx,0.15,bz);scene.add(base);
  blocks.push({x:bx,z:bz,park});
  if(park){const n=9+Math.floor(srand()*5);
    for(let k=0;k<n;k++){const tx=bx+(srand()-0.5)*30,tz=bz+(srand()-0.5)*30;treePos.push([tx,tz,0.8+srand()*0.6]);boxes.push({x0:tx-0.4,x1:tx+0.4,z0:tz-0.4,z1:tz+0.4,h:6});}
    continue;}
  const down=Math.pow(Math.max(0,1-dc),1.4);
  if(srand()<0.1+0.35*down){const w=24+srand()*8,d=24+srand()*8;building(bx,bz,w,d,26+down*70*(0.5+srand()*0.6));}
  else for(const ox of[-9.5,9.5])for(const oz of[-9.5,9.5]){
    const w=10+srand()*6,d=10+srand()*6;const h=7+srand()*12+down*55*srand();
    building(bx+ox+(srand()-0.5)*1.5,bz+oz+(srand()-0.5)*1.5,w,d,h);}
}
// trees
{const trunk=new THREE.InstancedMesh(new THREE.CylinderGeometry(0.18,0.26,1.8,6),new THREE.MeshLambertMaterial({color:0x6b4a2f}),treePos.length);
 const crown=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1.7,0),new THREE.MeshLambertMaterial({color:0x3f7a35,flatShading:true}),treePos.length);
 const d=new THREE.Object3D();
 treePos.forEach((t,i)=>{d.position.set(t[0],0.3+0.9*t[2],t[1]);d.scale.setScalar(t[2]);d.rotation.set(0,i,0);d.updateMatrix();trunk.setMatrixAt(i,d.matrix);
   d.position.set(t[0],0.3+2.6*t[2],t[1]);d.updateMatrix();crown.setMatrixAt(i,d.matrix);});
 scene.add(trunk,crown);}
// street lamps
{const pts=[];for(const b of blocks)for(const sx of[-1,1])for(const sz of[-1,1])pts.push([b.x+sx*19.6,b.z+sz*19.6]);
 const pole=new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07,0.1,5,6),new THREE.MeshLambertMaterial({color:0x2a2c33}),pts.length);
 const head=new THREE.InstancedMesh(new THREE.BoxGeometry(0.5,0.18,0.5),new THREE.MeshBasicMaterial({color:0xffe2a8}),pts.length);
 const d=new THREE.Object3D();
 pts.forEach((p,i)=>{d.position.set(p[0],2.8,p[1]);d.updateMatrix();pole.setMatrixAt(i,d.matrix);d.position.y=5.35;d.updateMatrix();head.setMatrixAt(i,d.matrix);});
 scene.add(pole,head);}

/* ---------- collision ---------- */
function pushOut(o,cx,cz,r){ // returns [px,pz] push vector for a circle
  let px=0,pz=0;
  for(const b of boxes){
    if(cx+r<b.x0||cx-r>b.x1||cz+r<b.z0||cz-r>b.z1)continue;
    const qx=clamp(cx,b.x0,b.x1),qz=clamp(cz,b.z0,b.z1);let dx=cx-qx,dz=cz-qz;const d2=dx*dx+dz*dz;
    if(d2>=r*r)continue;
    if(d2>1e-6){const d=Math.sqrt(d2);px+=dx/d*(r-d);pz+=dz/d*(r-d);}
    else{const l=cx-b.x0,rr=b.x1-cx,t=cz-b.z0,bt=b.z1-cz;const m=Math.min(l,rr,t,bt);
      if(m===l)px-=l+r;else if(m===rr)px+=rr+r;else if(m===t)pz-=t+r;else pz+=bt+r;}
  }
  const lim=HALF+60;
  if(cx<-lim)px+=-lim-cx;if(cx>lim)px+=lim-cx;if(cz<-lim)pz+=-lim-cz;if(cz>lim)pz+=lim-cz;
  return [px,pz];
}
function insideBuilding(x,y,z){for(const b of boxes)if(x>b.x0-0.4&&x<b.x1+0.4&&z>b.z0-0.4&&z<b.z1+0.4&&y<b.h+0.3)return true;return false;}

/* ---------- models ---------- */
const carBodyGeo=new THREE.BoxGeometry(2,0.72,4.4);
const carCabGeo=new THREE.BoxGeometry(1.78,0.62,2.2);
const glassMat=new THREE.MeshLambertMaterial({color:0x1b2330});
const wheelGeo=new THREE.CylinderGeometry(0.42,0.42,0.32,12);wheelGeo.rotateZ(Math.PI/2);
const wheelMat=new THREE.MeshLambertMaterial({color:0x151517});
const headMat=new THREE.MeshBasicMaterial({color:0xfff3c4});
const tailMat=new THREE.MeshBasicMaterial({color:0xd8222e});
const lampGeo=new THREE.BoxGeometry(0.45,0.2,0.08);
const CAR_COLORS=[0xd9372f,0x2f6fd9,0xf2c230,0xeeeeee,0x2b2b2e,0x3aa35a,0xff7a2f,0x8c4bd6,0x9aa3ad,0x1fb3b3];
const redLight=new THREE.MeshBasicMaterial({color:0xff2030});
const blueLight=new THREE.MeshBasicMaterial({color:0x2a6bff});
const darkLight=new THREE.MeshBasicMaterial({color:0x222233});
function makeCarMesh(color,police){
  const g=new THREE.Group();const bm=new THREE.MeshLambertMaterial({color:police?0xf4f4f4:color});
  const body=new THREE.Mesh(carBodyGeo,bm);body.position.y=0.78;g.add(body);
  const cab=new THREE.Mesh(carCabGeo,[glassMat,glassMat,police?new THREE.MeshLambertMaterial({color:0x111a33}):bm,glassMat,glassMat,glassMat]);cab.position.set(0,1.44,-0.25);g.add(cab);
  const wheels=[];for(const sx of[-1,1])for(const sz of[-1,1]){const w=new THREE.Mesh(wheelGeo,wheelMat);w.position.set(sx*0.98,0.42,sz*1.42);g.add(w);wheels.push(w);}
  for(const sx of[-0.62,0.62]){const h=new THREE.Mesh(lampGeo,headMat);h.position.set(sx,0.86,2.21);g.add(h);const t=new THREE.Mesh(lampGeo,tailMat);t.position.set(sx,0.86,-2.21);g.add(t);}
  let lights=null;
  if(police){const stripe=new THREE.Mesh(new THREE.BoxGeometry(2.02,0.2,3.2),new THREE.MeshLambertMaterial({color:0x1d4fd0}));stripe.position.y=0.82;g.add(stripe);
    const l1=new THREE.Mesh(new THREE.BoxGeometry(0.6,0.18,0.35),redLight);l1.position.set(-0.4,1.84,-0.25);
    const l2=new THREE.Mesh(new THREE.BoxGeometry(0.6,0.18,0.35),blueLight);l2.position.set(0.4,1.84,-0.25);g.add(l1,l2);lights=[l1,l2];}
  g.add(blob(3,5.4));
  scene.add(g);return {g,wheels,lights,bm};
}
const SKIN=[0xf1c9a5,0xe0ac80,0xc68b5c,0x8d5a3b];
const SHIRTS=[0x2f6fd9,0xd9372f,0x3aa35a,0xf2c230,0x8c4bd6,0xeeeeee,0x222222,0xff7a2f,0x1fb3b3];
const PANTS=[0x2b3a55,0x333333,0x5a4632,0x6c7a89,0x1d1d2a];
const legGeo=new THREE.BoxGeometry(0.24,0.82,0.27);legGeo.translate(0,-0.41,0);
const armGeo=new THREE.BoxGeometry(0.17,0.7,0.2);armGeo.translate(0,-0.33,0);
const torsoGeo=new THREE.BoxGeometry(0.62,0.74,0.36);
const headGeo=new THREE.BoxGeometry(0.38,0.4,0.38);
const hairGeo=new THREE.BoxGeometry(0.4,0.14,0.4);
function makePerson(shirt,pants,skin,hair){
  const g=new THREE.Group();const sm=new THREE.MeshLambertMaterial({color:shirt}),pm=new THREE.MeshLambertMaterial({color:pants}),km=new THREE.MeshLambertMaterial({color:skin});
  const torso=new THREE.Mesh(torsoGeo,sm);torso.position.y=1.2;g.add(torso);
  const head=new THREE.Mesh(headGeo,km);head.position.y=1.8;g.add(head);
  const hr=new THREE.Mesh(hairGeo,new THREE.MeshLambertMaterial({color:hair}));hr.position.y=2.02;g.add(hr);
  const legL=new THREE.Mesh(legGeo,pm);legL.position.set(-0.15,0.84,0);const legR=new THREE.Mesh(legGeo,pm);legR.position.set(0.15,0.84,0);
  const armL=new THREE.Mesh(armGeo,sm);armL.position.set(-0.41,1.52,0);const armR=new THREE.Mesh(armGeo,sm);armR.position.set(0.41,1.52,0);
  g.add(legL,legR,armL,armR,blob(1.2,1.2));scene.add(g);
  return {g,legL,legR,armL,armR};
}
function animPerson(p,phase,amt){const s=Math.sin(phase)*0.75*amt;p.legL.rotation.x=s;p.legR.rotation.x=-s;p.armL.rotation.x=-s*0.8;p.armR.rotation.x=s*0.8;}

/* ---------- state ---------- */
const S={state:'menu',money:0,shown:0,wanted:0,evadeT:0,wantedCd:0,bustT:0,shake:0,time:0,nitro:1,record:0};
try{S.record=+localStorage.getItem('kc_record')||0;S.money=+localStorage.getItem('kc_money')||0;S.shown=S.money;}catch(e){}
const player={x:9,z:12,h:Math.PI,hp:100,phase:0,mesh:makePerson(0xe94f37,0x2b3a55,0xf1c9a5,0x3a2618),car:null,hitCd:0};
const cars=[];

function laneLat(l){return l.axis==='x'?l.line+l.dir*LANE:l.line-l.dir*LANE;}
function laneHead(l){return l.axis==='x'?(l.dir>0?Math.PI/2:-Math.PI/2):(l.dir>0?0:Math.PI);}
function placeOnLane(c){const lat=laneLat(c.lane);if(c.lane.axis==='x'){c.x=c.s;c.z=lat;}else{c.z=c.s;c.x=lat;}c.h=laneHead(c.lane);}
function randomLane(){return {axis:Math.random()<0.5?'x':'z',line:pick(R),dir:Math.random()<0.5?1:-1};}
function newCar(kind,color){
  const m=makeCarMesh(color,kind==='police');
  const c={...m,kind,x:0,z:0,h:0,vh:0,speed:0,s:0,lane:null,stop:0,wait:0,cruise:rnd(9,13),stuck:0,rev:0,driver:kind!=='parked',honkCd:0,siren:0,gone:false,mode:'chase',hp:kind==='police'?120:100,unloaded:false,shootCd:rnd(1,2)};
  cars.push(c);return c;
}
function freeSpot(x,z,r){for(const o of cars)if(Math.hypot(o.x-x,o.z-z)<r)return false;return Math.hypot(player.x-x,player.z-z)>r;}
function spawnTraffic(minDist){
  for(let tries=0;tries<30;tries++){
    const lane=randomLane();const s=rnd(-HALF+6,HALF-6);
    const tmp={lane,s};placeOnLane(tmp);
    if(minDist&&Math.hypot(tmp.x-player.x,tmp.z-player.z)<minDist)continue;
    if(!freeSpot(tmp.x,tmp.z,9))continue;
    const c=newCar('traffic',pick(CAR_COLORS));c.lane=lane;c.s=s;placeOnLane(c);c.vh=c.h;return c;}
  return null;
}
function removeCar(c){scene.remove(c.g);c.g.traverse(o=>{if(o.material&&o.material!==blobMat&&!Array.isArray(o.material)&&o.material.dispose)o.material.dispose();});const i=cars.indexOf(c);if(i>=0)cars.splice(i,1);}

const TRAFFIC=26;
for(let i=0;i<TRAFFIC;i++)spawnTraffic(12);
{const c=newCar('parked',0xf2c230);c.x=5.9;c.z=20;c.h=Math.PI;c.vh=c.h;c.driver=false;}

// pedestrians
const peds=[];const PA=BLOCK/2-1.2;
function perim(u){const L=8*PA;u=((u%L)+L)%L;const side=Math.floor(u/(2*PA));const t=u-side*2*PA-PA;
  if(side===0)return[t,-PA,Math.PI/2];if(side===1)return[PA,t,0];if(side===2)return[-t,PA,-Math.PI/2];return[-PA,-t,Math.PI];}
function respawnPed(p,far){
  for(let k=0;k<10;k++){p.b=pick(blocks);p.u=rnd(0,8*PA);const q=perim(p.u);p.x=p.b.x+q[0];p.z=p.b.z+q[1];if(!far||Math.hypot(p.x-player.x,p.z-player.z)>40)break;}
  p.dir=Math.random()<0.5?1:-1;p.spd=rnd(1.1,1.8);p.down=0;p.flee=0;p.hp=20;p.m.g.rotation.set(0,0,0);p.m.g.position.y=0.3;
}
for(let i=0;i<34;i++){const p={m:makePerson(pick(SHIRTS),pick(PANTS),pick(SKIN),pick([0x2a1a10,0x5a3a20,0xd9b36a,0x111111,0x8a8a8a])),phase:Math.random()*6};respawnPed(p);peds.push(p);}

// pickups
const coinGeo=new THREE.CylinderGeometry(0.6,0.6,0.16,20);coinGeo.rotateX(Math.PI/2);
const coinMat=new THREE.MeshLambertMaterial({color:0xffc933,emissive:0x8a5a00,emissiveIntensity:0.6});
const healGeo=new THREE.BoxGeometry(0.9,0.9,0.9);
const healMat=[0,1,2,3,4,5].map(()=>new THREE.MeshLambertMaterial({color:0xffffff,emissive:0x552222,map:canvasTex(32,32,(g)=>{g.fillStyle='#fff';g.fillRect(0,0,32,32);g.fillStyle='#e23b3b';g.fillRect(12,5,8,22);g.fillRect(5,12,22,8);})}));
const pickups=[];
function sidewalkPoint(){const b=pick(blocks);const q=perim(rnd(0,8*PA));return[b.x+q[0],b.z+q[1]];}
function placePickup(p){for(let k=0;k<10;k++){const q=sidewalkPoint();p.x=q[0];p.z=q[1];if(Math.hypot(p.x-player.x,p.z-player.z)>30)break;}p.mesh.position.set(p.x,1.2,p.z);p.mesh.visible=true;}
for(let i=0;i<16;i++){const p={type:'cash',mesh:new THREE.Mesh(coinGeo,coinMat),val:0};scene.add(p.mesh);placePickup(p);pickups.push(p);}
for(let i=0;i<4;i++){const p={type:'heal',mesh:new THREE.Mesh(healGeo,healMat)};scene.add(p.mesh);placePickup(p);pickups.push(p);}
const drops=[];
function dropCash(x,z,v){const m=new THREE.Mesh(coinGeo,coinMat);m.scale.setScalar(0.7);m.position.set(x,1,z);scene.add(m);drops.push({mesh:m,x,z,val:v,t:30});}

// mission
const beam=new THREE.Mesh(new THREE.CylinderGeometry(2.4,2.4,70,24,1,true),new THREE.MeshBasicMaterial({color:0xffd34d,transparent:true,opacity:0.32,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,fog:false}));
const ring=new THREE.Mesh(new THREE.RingGeometry(2.2,3.1,32),new THREE.MeshBasicMaterial({color:0xffd34d,transparent:true,opacity:0.85,side:THREE.DoubleSide,depthWrite:false}));ring.rotation.x=-Math.PI/2;
scene.add(beam,ring);
const mission={x:0,z:0,t:0,total:0,reward:0,active:false,wait:0,count:0};
const PLACES=['к рынку','к драмтеатру','на набережную','к Сусанинской площади','к общаге','к пожарной каланче','на вокзал','в шаурмичную','к универу','к торговым рядам'];
function newMission(){
  let x,z,d;for(let k=0;k<30;k++){const q=sidewalkPoint();x=q[0];z=q[1];d=Math.hypot(x-player.x,z-player.z);if(d>140&&d<360)break;}
  mission.x=x;mission.z=z;mission.total=Math.round(d/13+14);mission.t=mission.total;mission.reward=Math.round((d*1.1+60)/10)*10;mission.active=true;mission.place=pick(PLACES);
  beam.position.set(x,35,z);ring.position.set(x,groundH(x,z)+0.06,z);beam.visible=ring.visible=true;
}

/* ---------- audio ---------- */
const A={ctx:null,muted:false};
function initAudio(){
  if(A.ctx){A.ctx.resume&&A.ctx.resume();return;}
  try{const ac=new (window.AudioContext||window.webkitAudioContext)();A.ctx=ac;
    A.master=ac.createGain();A.master.gain.value=0.9;A.master.connect(ac.destination);
    A.eng=ac.createOscillator();A.eng.type='sawtooth';A.engF=ac.createBiquadFilter();A.engF.type='lowpass';A.engF.frequency.value=500;A.engG=ac.createGain();A.engG.gain.value=0;
    A.eng.connect(A.engF);A.engF.connect(A.engG);A.engG.connect(A.master);A.eng.start();
    A.sir=ac.createOscillator();A.sir.type='square';A.sirG=ac.createGain();A.sirG.gain.value=0;const sf=ac.createBiquadFilter();sf.type='lowpass';sf.frequency.value=1800;
    A.sir.connect(sf);sf.connect(A.sirG);A.sirG.connect(A.master);A.sir.start();
    const len=ac.sampleRate*0.5;A.noise=ac.createBuffer(1,len,ac.sampleRate);const d=A.noise.getChannelData(0);for(let i=0;i<len;i++)d[i]=(Math.random()*2-1)*(1-i/len);
  }catch(e){A.ctx=null;}
}
function tone(f,dur,type,vol,when){if(!A.ctx||A.muted)return;const ac=A.ctx,t=ac.currentTime+(when||0);const o=ac.createOscillator(),g=ac.createGain();o.type=type||'sine';o.frequency.setValueAtTime(f,t);
  g.gain.setValueAtTime(0.0001,t);g.gain.exponentialRampToValueAtTime(vol||0.15,t+0.01);g.gain.exponentialRampToValueAtTime(0.0001,t+dur);o.connect(g);g.connect(A.master);o.start(t);o.stop(t+dur+0.05);}
function noise(dur,vol,freq,ftype){if(!A.ctx||A.muted)return;const ac=A.ctx,s=ac.createBufferSource(),g=ac.createGain(),f=ac.createBiquadFilter();s.buffer=A.noise;f.type=ftype||'lowpass';f.frequency.value=freq||900;g.gain.value=vol||0.4;
  s.connect(f);f.connect(g);g.connect(A.master);s.start();s.stop(ac.currentTime+dur);}
const sfx={
  coin(){tone(988,0.09,'square',0.08);tone(1319,0.18,'square',0.08,0.07);},
  heal(){tone(523,0.1,'sine',0.15);tone(784,0.2,'sine',0.15,0.09);},
  crash(){noise(0.35,0.55,700);tone(70,0.25,'sawtooth',0.12);},
  thud(){noise(0.15,0.4,400);},
  horn(){tone(392,0.32,'square',0.06);tone(494,0.32,'square',0.06);},
  door(){noise(0.08,0.3,1500);tone(180,0.08,'square',0.06);},
  win(){[523,659,784,1047].forEach((f,i)=>tone(f,0.22,'triangle',0.13,i*0.09));},
  fail(){[392,330,262].forEach((f,i)=>tone(f,0.3,'triangle',0.12,i*0.14));},
  star(){tone(220,0.15,'square',0.07);tone(196,0.25,'square',0.07,0.12);},
  gun(f,v){noise(0.12,v||0.5,f||1400,'bandpass');noise(0.05,(v||0.5)*0.8,300);},
  boom(){noise(0.5,0.9,300);tone(55,0.6,'sawtooth',0.2);},
  click(){tone(1800,0.03,'square',0.05);},
  buy(){tone(660,0.08,'square',0.07);tone(990,0.14,'square',0.07,0.07);}
};
function audioTick(){
  if(!A.ctx)return;const t=A.ctx.currentTime;const c=player.car;
  const on=!A.muted&&S.state==='play'&&c;
  const sp=c?Math.abs(c.speed):0;
  A.engG.gain.setTargetAtTime(on?0.035+Math.min(sp,40)*0.0012:0,t,0.08);
  A.eng.frequency.setTargetAtTime(42+sp*4.2+(S.nitroOn?30:0),t,0.06);
  A.engF.frequency.setTargetAtTime(350+sp*28,t,0.1);
  let near=1e9;for(const o of cars)if(o.kind==='police'&&!o.gone)near=Math.min(near,Math.hypot(o.x-player.x,o.z-player.z));
  const sv=!A.muted&&S.state==='play'&&near<90?0.035*(1-near/90):0;
  A.sirG.gain.setTargetAtTime(sv,t,0.1);
  A.sir.frequency.setTargetAtTime(660+260*Math.sin(S.time*5),t,0.02);
}

/* ---------- input ---------- */
const input={jx:0,jy:0,nitro:false,brake:false,fire:false};
const keys={};
const joy={id:null,x0:0,y0:0};const cam={id:null,lx:0,ly:0,yaw:Math.PI,pitch:0.32,dragT:0,dist:7};
const joyEl=$('#joy'),knob=$('#knob');const JR=56;
const touchEl=$('#touch');
touchEl.addEventListener('pointerdown',e=>{
  if(S.state!=='play')return;
  const br=document.body.getBoundingClientRect();
  if(e.clientX<innerWidth*0.5&&joy.id===null){joy.id=e.pointerId;joy.x0=e.clientX;joy.y0=e.clientY;joyEl.style.left=(e.clientX-br.left)+'px';joyEl.style.top=(e.clientY-br.top)+'px';joyEl.classList.add('on');knob.style.transform='translate(0,0)';$('#joyHint').hidden=true;}
  else if(cam.id===null){cam.id=e.pointerId;cam.lx=e.clientX;cam.ly=e.clientY;}
  try{touchEl.setPointerCapture(e.pointerId);}catch(_){}
  e.preventDefault();
});
touchEl.addEventListener('pointermove',e=>{
  if(e.pointerId===joy.id){let dx=e.clientX-joy.x0,dy=e.clientY-joy.y0;const l=Math.hypot(dx,dy);if(l>JR){dx*=JR/l;dy*=JR/l;}
    knob.style.transform=`translate(${dx}px,${dy}px)`;input.jx=dx/JR;input.jy=-dy/JR;}
  else if(e.pointerId===cam.id){cam.yaw-=(e.clientX-cam.lx)*0.0068;cam.pitch=clamp(cam.pitch+(e.clientY-cam.ly)*0.004,0.06,0.95);cam.lx=e.clientX;cam.ly=e.clientY;cam.dragT=1.6;}
});
function endPtr(e){if(e.pointerId===joy.id){joy.id=null;input.jx=input.jy=0;joyEl.classList.remove('on');}if(e.pointerId===cam.id)cam.id=null;}
touchEl.addEventListener('pointerup',endPtr);touchEl.addEventListener('pointercancel',endPtr);
addEventListener('keydown',e=>{keys[e.code]=true;if(S.state==='play'){if(e.code==='KeyE'||e.code==='KeyF')action();if(e.code==='KeyH')horn();if(e.code==='KeyQ')swapWeapon();if(e.code==='Escape'||e.code==='KeyP')pause(true);}});
addEventListener('keyup',e=>{keys[e.code]=false;});
let mouseDrag=false,mlx=0,mly=0;
canvas.addEventListener('mousedown',e=>{mouseDrag=true;mlx=e.clientX;mly=e.clientY;});
addEventListener('mouseup',()=>mouseDrag=false);
function hold(el,key){const on=e=>{e.preventDefault();e.stopPropagation();input[key]=true;el.classList.add('held');},off=()=>{input[key]=false;el.classList.remove('held');};
  el.addEventListener('pointerdown',on);el.addEventListener('pointerup',off);el.addEventListener('pointercancel',off);el.addEventListener('pointerleave',off);}
hold($('#btnNitro'),'nitro');
hold($('#btnFire'),'fire');
$('#btnSwap').addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();swapWeapon();});
$('#btnAct').addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();action();});
$('#btnHorn').addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();horn();});
function readKeys(){
  let kx=0,ky=0;if(keys.KeyW||keys.ArrowUp)ky+=1;if(keys.KeyS||keys.ArrowDown)ky-=1;if(keys.KeyA||keys.ArrowLeft)kx-=1;if(keys.KeyD||keys.ArrowRight)kx+=1;
  return{x:joy.id!==null?input.jx:kx,y:joy.id!==null?input.jy:ky,nitro:input.nitro||keys.ShiftLeft||keys.ShiftRight,brake:keys.Space};
}

/* ---------- HUD ---------- */
const toastEl=$('#toast');let toastT=0;
function toast(t,sub,dur){toastEl.innerHTML=t+(sub?`<small>${sub}</small>`:'');toastEl.classList.add('show');toastT=dur||2.2;}
const starEls=[...document.querySelectorAll('#stars span')];
function setStars(){starEls.forEach((s,i)=>s.classList.toggle('on',i<S.wanted));}
function addWanted(n,why){if(S.wantedCd>0&&n<2)return;const before=S.wanted;S.wanted=clamp(S.wanted+n,0,5);S.wantedCd=2.5;S.evadeT=0;if(S.wanted>before){sfx.star();if(why)toast(why,'Розыск: '+'★'.repeat(S.wanted),1.8);}setStars();}
function fmtMoney(v){return '$'+Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g,' ');}
function save(){saveInv();try{localStorage.setItem('kc_money',String(Math.max(0,Math.round(S.money))));if(S.money>S.record){S.record=Math.round(S.money);localStorage.setItem('kc_record',String(S.record));}}catch(e){}}
const mapC=$('#map'),mg=mapC.getContext('2d');
function drawMap(){
  const W=mapC.width,cx=W/2,k=(W/2)/115;
  const fx=Math.sin(cam.yaw),fz=Math.cos(cam.yaw),rx=-Math.cos(cam.yaw),rz=Math.sin(cam.yaw);
  const px=player.car?player.car.x:player.x,pz=player.car?player.car.z:player.z;
  mg.setTransform(1,0,0,1,0,0);mg.clearRect(0,0,W,W);mg.save();mg.beginPath();mg.arc(cx,cx,cx,0,Math.PI*2);mg.clip();
  mg.fillStyle='#27402a';mg.fillRect(0,0,W,W);
  mg.setTransform(k*rx,-k*fx,k*rz,-k*fz,cx-k*(rx*px+rz*pz),cx+k*(fx*px+fz*pz));
  mg.fillStyle='#777b88';mg.fillRect(-HALF-7,-HALF-7,2*HALF+14,2*HALF+14);
  for(const b of blocks){mg.fillStyle=b.park?'#3d6a3a':'#30333f';mg.fillRect(b.x-BLOCK/2,b.z-BLOCK/2,BLOCK,BLOCK);}
  mg.fillStyle='#86e46f';for(const s of shops)mg.fillRect(s.x-6,s.z-6,12,12);
  mg.setTransform(1,0,0,1,0,0);
  const toM=(x,z)=>{const dx=x-px,dz=z-pz;return[cx+k*(dx*rx+dz*rz),cx-k*(dx*fx+dz*fz)];};
  for(const c of cops)if(c.down<=0){const[sx,sy]=toM(c.x,c.z);mg.fillStyle='#9fc1ff';mg.fillRect(sx-3,sy-3,6,6);}
  if(mission.active){let[sx,sy]=toM(mission.x,mission.z);const dx=sx-cx,dy=sy-cx,d=Math.hypot(dx,dy),lim=cx-12;if(d>lim){sx=cx+dx/d*lim;sy=cx+dy/d*lim;}
    mg.fillStyle='#ffd34d';mg.strokeStyle='#1a0f12';mg.lineWidth=3;mg.beginPath();mg.arc(sx,sy,9,0,Math.PI*2);mg.fill();mg.stroke();}
  const blink=Math.floor(S.time*6)%2;
  for(const o of cars)if(o.kind==='police'&&!o.gone){let[sx,sy]=toM(o.x,o.z);const dx=sx-cx,dy=sy-cx,d=Math.hypot(dx,dy),lim=cx-8;if(d>lim){sx=cx+dx/d*lim;sy=cx+dy/d*lim;}
    mg.fillStyle=blink?'#ff4050':'#4a8cff';mg.beginPath();mg.arc(sx,sy,6,0,Math.PI*2);mg.fill();}
  const h=player.car?player.car.h:player.h;const hx=Math.sin(h),hz=Math.cos(h);
  const ang=Math.atan2(hx*rx+hz*rz,hx*fx+hz*fz);
  mg.translate(cx,cx);mg.rotate(ang);mg.fillStyle='#fff';mg.strokeStyle='#000';mg.lineWidth=2.5;
  mg.beginPath();mg.moveTo(0,-13);mg.lineTo(9,10);mg.lineTo(0,5);mg.lineTo(-9,10);mg.closePath();mg.stroke();mg.fill();
  mg.restore();
}

/* ---------- actions ---------- */
function nearestCar(r){let best=null,bd=r;for(const c of cars){if(c.kind==='wreck'||(c.kind==='police'&&!c.gone&&!c.unloaded))continue;const d=Math.hypot(c.x-player.x,c.z-player.z);if(d<bd){bd=d;best=c;}}return best;}
function exitCar(wreck){
  const c=player.car;const lx=Math.cos(c.h),lz=-Math.sin(c.h);
  player.x=c.x+lx*2.2;player.z=c.z+lz*2.2;const p=pushOut(player,player.x,player.z,0.45);player.x+=p[0];player.z+=p[1];
  player.h=c.h;if(!wreck)c.kind=c.isPolice?'parkedPolice':'parked';c.driver=false;player.car=null;player.mesh.g.visible=true;sfx.door();
  $('#speedo').hidden=true;
  const parked=cars.filter(o=>o.kind==='parked'&&!o.sport);if(parked.length>6){parked.sort((a,b)=>Math.hypot(b.x-player.x,b.z-player.z)-Math.hypot(a.x-player.x,a.z-player.z));removeCar(parked[0]);}
}
function action(){
  if(S.state!=='play')return;
  if(player.car){
    if(Math.abs(player.car.speed)>14){toast('Сначала притормози');return;}
    exitCar(false);
  }else{
    const c=nearestCar(4.6);if(!c)return;
    if(c.kind==='traffic'&&c.driver){addWanted(1,'Угон!');const p=peds.find(q=>q.down<=0&&Math.hypot(q.x-player.x,q.z-player.z)>60);if(p){p.b=nearestBlock(c.x,c.z);placePedNear(p,c.x,c.z);p.flee=8;}}
    if(c.kind==='police'){addWanted(2,'Угнал полицейскую машину!');c.gone=true;}
    if(c.kind==='police'||c.kind==='parkedPolice')c.kind='player';else c.kind='player';
    c.isPolice=!!c.lights;c.driver=true;c.lane=null;player.car=c;player.mesh.g.visible=false;sfx.door();
    $('#speedo').hidden=false;
  }
}
function nearestBlock(x,z){let b=blocks[0],bd=1e9;for(const q of blocks){const d=Math.hypot(q.x-x,q.z-z);if(d<bd){bd=d;b=q;}}return b;}
function placePedNear(p,x,z){let best=0,bd=1e9;for(let u=0;u<8*PA;u+=1){const q=perim(u);const d=Math.hypot(p.b.x+q[0]-x,p.b.z+q[1]-z);if(d<bd){bd=d;best=u;}}p.u=best;const q=perim(best);p.x=p.b.x+q[0];p.z=p.b.z+q[1];p.down=0;p.m.g.rotation.set(0,0,0);p.m.g.position.y=0.3;}
let hornCd=0;
function horn(){if(hornCd>0)return;hornCd=0.4;sfx.horn();
  const hx=player.car?player.car.x:player.x,hz=player.car?player.car.z:player.z;
  for(const p of peds)if(p.down<=0&&Math.hypot(p.x-hx,p.z-hz)<14){p.flee=4;}}

/* ---------- car physics ---------- */
function carCircles(c){const fx=Math.sin(c.h),fz=Math.cos(c.h);return[[c.x+fx*1.2,c.z+fz*1.2],[c.x-fx*1.2,c.z-fz*1.2]];}
function physCar(c,thr,steer,brake,dt,maxS){
  if(thr>0)c.speed+=(c.speed<-0.5?30:15)*thr*dt;
  else if(thr<0)c.speed+=(c.speed>0.5?-30:-11)*(-thr)*dt;
  else c.speed-=Math.sign(c.speed)*Math.min(Math.abs(c.speed),4*dt);
  if(brake)c.speed-=Math.sign(c.speed)*Math.min(Math.abs(c.speed),38*dt);
  if(c.speed>maxS)c.speed=lerp(c.speed,maxS,Math.min(1,dt*2));
  c.speed=clamp(c.speed,-10,60);c.speed-=c.speed*0.05*dt;
  const st=steer*0.58/(1+Math.abs(c.speed)*0.05);
  c.h=wrapA(c.h-c.speed/2.6*Math.tan(st)*dt);
  c.x+=Math.sin(c.h)*c.speed*dt;c.z+=Math.cos(c.h)*c.speed*dt;
  let hit=false;
  for(let it=0;it<2;it++){const cs=carCircles(c);let px=0,pz=0;for(const q of cs){const p=pushOut(c,q[0],q[1],1.05);px+=p[0];pz+=p[1];}
    if(px||pz){c.x+=px;c.z+=pz;hit=true;}}
  if(hit){const impact=Math.abs(c.speed);if(impact>6){c.speed*=-0.25;if(c===player.car){sfx.crash();S.shake=Math.min(1,impact/25);if(impact>10)carDamage(c,(impact-8)*1.4,false);}}else c.speed*=0.6;}
  return hit;
}

/* ---------- weapons, inventory ---------- */
const WEAPONS={
  fists:{name:'Кулаки',dmg:10,rate:0.45,range:2.2,melee:true},
  pistol:{name:'Пистолет',desc:'Точный, для начала самое то',price:250,dmg:26,rate:0.32,range:45,pellets:1,acc:0.85,pack:24,packPrice:40,snd:1700,vol:0.45},
  uzi:{name:'Узи',desc:'Скорострельный, удобно стрелять из машины',price:700,dmg:12,rate:0.085,range:34,pellets:1,acc:0.7,pack:60,packPrice:70,snd:2300,vol:0.35},
  shotgun:{name:'Дробовик',desc:'Шесть дробин, страшен вблизи',price:1000,dmg:14,rate:0.9,range:20,pellets:6,acc:0.75,pack:12,packPrice:60,snd:650,vol:0.75},
  rifle:{name:'Автомат',desc:'Дальний и мощный, для пяти звёзд',price:1800,dmg:24,rate:0.11,range:60,pellets:1,acc:0.85,pack:60,packPrice:110,snd:1100,vol:0.55}
};
const WORDER=['fists','pistol','uzi','shotgun','rifle'];
const inv={owned:{fists:true},ammo:{},cur:'fists',armor:0};
try{const s=JSON.parse(localStorage.getItem('kc_inv')||'null');if(s&&s.owned){inv.owned=s.owned;inv.ammo=s.ammo||{};inv.cur=WEAPONS[s.cur]&&s.owned[s.cur]?s.cur:'fists';inv.armor=+s.armor||0;inv.owned.fists=true;}}catch(e){}
function saveInv(){try{localStorage.setItem('kc_inv',JSON.stringify(inv));}catch(e){}}
function resetInv(){inv.owned={fists:true};inv.ammo={};inv.cur='fists';saveInv();}
function swapWeapon(){if(S.state!=='play')return;const own=WORDER.filter(w=>inv.owned[w]);const i=own.indexOf(inv.cur);inv.cur=own[(i+1)%own.length];sfx.click();
  if(own.length===1)toast('Только кулаки','Оружие продаётся в «Калашном ряду»',1.6);saveInv();}

/* ---------- particles & tracers ---------- */
const partTex=canvasTex(64,64,(g)=>{const gr=g.createRadialGradient(32,32,0,32,32,32);gr.addColorStop(0,'rgba(255,255,255,1)');gr.addColorStop(0.45,'rgba(255,255,255,.55)');gr.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=gr;g.fillRect(0,0,64,64);});
partTex.wrapS=partTex.wrapT=THREE.ClampToEdgeWrapping;
const parts=[];
function emit(x,y,z,color,size,life,vx,vy,vz,add){
  let p=null;for(const q of parts)if(q.life<=0){p=q;break;}
  if(!p){if(parts.length>=120)return;p={s:new THREE.Sprite(new THREE.SpriteMaterial({map:partTex,transparent:true,depthWrite:false})),life:0};scene.add(p.s);parts.push(p);}
  p.s.material.color.setHex(color);p.s.material.blending=add?THREE.AdditiveBlending:THREE.NormalBlending;p.s.visible=true;
  p.s.position.set(x,y,z);p.vx=vx||0;p.vy=vy||0;p.vz=vz||0;p.life=p.max=life;p.size=size;
}
function updateParts(dt){for(const p of parts){if(p.life<=0)continue;p.life-=dt;if(p.life<=0){p.s.visible=false;continue;}const t=1-p.life/p.max;
  p.s.position.x+=p.vx*dt;p.s.position.y+=p.vy*dt;p.s.position.z+=p.vz*dt;p.s.scale.setScalar(p.size*(0.4+t*1.4));p.s.material.opacity=(1-t)*0.85;}}
const trGeo=new THREE.BoxGeometry(0.07,0.07,1);
const trMatP=new THREE.MeshBasicMaterial({color:0xffe9a0,transparent:true,opacity:0.95,fog:false});
const trMatE=new THREE.MeshBasicMaterial({color:0xff6a50,transparent:true,opacity:0.95,fog:false});
const tracers=[];
function tracer(x1,y1,z1,x2,y2,z2,enemy){let t=null;for(const q of tracers)if(q.t<=0){t=q;break;}
  if(!t){if(tracers.length>40)return;t={m:new THREE.Mesh(trGeo,trMatP),t:0};scene.add(t.m);tracers.push(t);}
  t.m.material=enemy?trMatE:trMatP;const len=Math.max(0.1,Math.hypot(x2-x1,y2-y1,z2-z1));
  t.m.position.set((x1+x2)/2,(y1+y2)/2,(z1+z2)/2);t.m.scale.set(1,1,len);t.m.lookAt(x2,y2,z2);t.m.visible=true;t.t=0.07;}
function updateTracers(dt){for(const t of tracers)if(t.t>0){t.t-=dt;if(t.t<=0)t.m.visible=false;}}
function los(x1,z1,x2,z2){const d=Math.hypot(x2-x1,z2-z1);const n=Math.ceil(d/2.5);for(let i=1;i<n;i++){const t=i/n;if(insideBuilding(x1+(x2-x1)*t,1.5,z1+(z2-z1)*t))return false;}return true;}

/* ---------- cops on foot ---------- */
const cops=[];
const capGeo=new THREE.BoxGeometry(0.44,0.12,0.5);
const gunGeo=new THREE.BoxGeometry(0.1,0.44,0.15);gunGeo.translate(0,-0.62,0.07);
const gunMat=new THREE.MeshLambertMaterial({color:0x18181b});
function addGun(person){const g=new THREE.Mesh(gunGeo,gunMat);person.armR.add(g);return g;}
player.gun=addGun(player.mesh);
function spawnCop(x,z){
  const m=makePerson(0x24365c,0x1a2130,pick(SKIN),0x111111);const cap=new THREE.Mesh(capGeo,new THREE.MeshLambertMaterial({color:0x14203d}));cap.position.y=2.07;m.g.add(cap);addGun(m);
  const p=pushOut(null,x,z,0.45);
  cops.push({m,x:x+p[0],z:z+p[1],h:0,hp:45,down:0,cd:rnd(0.7,1.5),phase:Math.random()*6,leave:0,aim:0});
}
function removeCop(c){scene.remove(c.m.g);const i=cops.indexOf(c);if(i>=0)cops.splice(i,1);}
function heat(){if(S.wanted<2){S.wanted=2;S.evadeT=0;setStars();sfx.star();toast('Полиция открывает огонь!','Розыск: ★★',1.8);}}
function downCop(c,h,byPlayer){
  if(c.down>0)return;c.down=8;c.hp=0;c.m.g.position.set(c.x,0.45,c.z);c.m.g.rotation.set(-Math.PI/2,h,0);animPerson(c.m,0,0);
  if(byPlayer){addWanted(1,'Нападение на полицейского!');heat();dropCash(c.x+1,c.z,30);}
}
function downPed(p,h,byPlayer,why){
  if(p.down>0)return;p.down=7;p.hp=0;const fx=Math.sin(h),fz=Math.cos(h);p.x+=fx*1.5;p.z+=fz*1.5;
  p.m.g.position.set(p.x,0.45,p.z);p.m.g.rotation.set(-Math.PI/2,h,0);animPerson(p.m,0,0);
  if(byPlayer){addWanted(1,why||'Нападение на прохожего!');dropCash(p.x+fz*1.5,p.z-fx*1.5,Math.round(rnd(10,40)));}
}
function panic(x,z,r){for(const p of peds)if(p.down<=0&&Math.hypot(p.x-x,p.z-z)<r)p.flee=6;}
function nearPolice(x,z,r){for(const c of cops)if(c.down<=0&&Math.hypot(c.x-x,c.z-z)<r)return true;for(const c of cars)if(c.kind==='police'&&!c.gone&&Math.hypot(c.x-x,c.z-z)<r)return true;return false;}
function updateCops(dt){
  const tx=player.car?player.car.x:player.x,tz=player.car?player.car.z:player.z;
  for(let i=cops.length-1;i>=0;i--){const c=cops[i];
    if(c.down>0){c.down-=dt;if(c.down<=0)removeCop(c);continue;}
    const dx=tx-c.x,dz=tz-c.z,d=Math.hypot(dx,dz);
    if(S.wanted===0||d>110){c.leave+=dt;if(c.leave>3||d>110){removeCop(c);continue;}}
    let move=0;
    const see=S.wanted>=2&&d<34&&d>2.5&&los(c.x,c.z,tx,tz);
    if(see){c.aim=1;c.cd-=dt;if(c.cd<=0){c.cd=rnd(0.8,1.4);enemyShot(c.x+Math.sin(c.h)*0.5,1.55,c.z+Math.cos(c.h)*0.5,tx,tz,0.62-d/90,5+S.wanted);}}
    else{c.aim=0;if(d>1.3&&S.wanted>0)move=5.4;}
    c.h=c.h+wrapA(Math.atan2(dx,dz)-c.h)*Math.min(1,dt*8);
    if(move){c.x+=Math.sin(c.h)*move*dt;c.z+=Math.cos(c.h)*move*dt;const p=pushOut(c,c.x,c.z,0.45);c.x+=p[0];c.z+=p[1];c.phase+=move*dt*1.7;animPerson(c.m,c.phase,1);}
    else animPerson(c.m,0,0);
    if(c.aim){c.m.armR.rotation.x=-Math.PI/2;c.m.armL.rotation.x=-1.2;}
    for(const car of cars){if(car.kind==='traffic'||Math.abs(car.speed)<5)continue;for(const q of carCircles(car))if(Math.hypot(c.x-q[0],c.z-q[1])<1.6){downCop(c,car.h,car===player.car);break;}if(c.down>0)break;}
    if(c.down<=0){c.m.g.position.set(c.x,groundH(c.x,c.z),c.z);c.m.g.rotation.y=c.h;}
  }
}

/* ---------- damage ---------- */
function damagePlayer(n){
  if(S.state!=='play')return;
  if(player.car){carDamage(player.car,n*1.5,false);n*=0.35;if(!player.car)return;}
  if(inv.armor>0){const a=Math.min(inv.armor,n*0.8);inv.armor-=a;n-=a;}
  player.hp=Math.max(0,player.hp-n);S.dmgFlash=0.45;
  if(player.hp<=0)gameOver('w');
}
function enemyShot(fx,fy,fz,tx,tz,prob,dmg){
  const moving=player.car?Math.max(0.45,1-Math.abs(player.car.speed)/40):1;
  const hit=Math.random()<clamp(prob*moving,0.08,0.8);
  const ty=player.car?1.2:1.3;
  tracer(fx,fy,fz,tx+(hit?rnd(-0.2,0.2):rnd(-1.8,1.8)),ty+rnd(-0.3,0.5),tz+(hit?rnd(-0.2,0.2):rnd(-1.8,1.8)),true);
  emit(fx,fy,fz,0xffc060,0.6,0.08,0,0,0,true);
  const dd=Math.hypot(fx-tx,fz-tz);sfx.gun(1500,0.35*clamp(1-dd/60,0.15,1));
  if(hit)damagePlayer(dmg);
}
function carDamage(c,n,byPlayer){
  if(!c||c.kind==='wreck')return;c.hp-=n;if(byPlayer)c.byPlayer=true;
  if(byPlayer&&c.kind==='police'&&!c.gone)heat();
  if(c.hp<=0)explode(c);
}
function explode(c){
  const byP=!!c.byPlayer;const wasMine=player.car===c;
  c.kind='wreck';c.wreckT=25;c.speed*=0.3;c.driver=false;c.gone=true;c.lane=null;c.bm.color.setHex(0x1c1b1a);
  if(c.lights){c.lights[0].material=darkLight;c.lights[1].material=darkLight;}
  for(let i=0;i<22;i++)emit(c.x+rnd(-1,1),1+rnd(0,1.2),c.z+rnd(-1,1),pick([0xff9a30,0xffd060,0xff5a20]),rnd(2.5,4.5),rnd(0.4,0.9),rnd(-4,4),rnd(2,7),rnd(-4,4),true);
  for(let i=0;i<10;i++)emit(c.x+rnd(-1,1),2,c.z+rnd(-1,1),0x2a2624,rnd(3,5),rnd(1.2,2),rnd(-1,1),rnd(2,4),rnd(-1,1),false);
  sfx.boom();
  const d=Math.hypot(player.x-c.x,player.z-c.z);S.shake=Math.max(S.shake,clamp(1.2-d/40,0,1));
  if(wasMine){exitCar(true);damagePlayer(30);toast('Машина взорвалась!',null,1.6);}
  else if(!player.car&&d<7)damagePlayer(45*(1-d/7));
  for(const p of peds)if(p.down<=0&&Math.hypot(p.x-c.x,p.z-c.z)<6)downPed(p,Math.atan2(p.x-c.x,p.z-c.z),byP);
  for(const q of cops)if(q.down<=0&&Math.hypot(q.x-c.x,q.z-c.z)<6)downCop(q,Math.atan2(q.x-c.x,q.z-c.z),byP);
  for(const o of cars)if(o!==c&&o.kind!=='wreck'&&Math.hypot(o.x-c.x,o.z-c.z)<6){if(byP)o.byPlayer=true;carDamage(o,45,false);}
  if(byP&&!wasMine)addWanted(1,'Взрыв!');
}

/* ---------- player shooting ---------- */
let fireCd=0;S.aimT=0;S.punchT=0;S.lock=null;S.dmgFlash=0;
const lockMark=new THREE.Mesh(new THREE.RingGeometry(0.45,0.62,24),new THREE.MeshBasicMaterial({color:0xff3b4a,side:THREE.DoubleSide,transparent:true,depthTest:false,fog:false}));
lockMark.renderOrder=5;lockMark.visible=false;scene.add(lockMark);
function findTarget(ox,oz,range){
  const ax=Math.sin(cam.yaw),az=Math.cos(cam.yaw);let best=null,bs=1e9;
  const consider=(x,z,y,type,ref,pri)=>{const dx=x-ox,dz=z-oz,d=Math.hypot(dx,dz);if(d>range||d<0.6)return;const cos=(dx*ax+dz*az)/d;if(cos<0.74)return;
    const s=d*(2.3-cos)*pri;if(s<bs&&los(ox,oz,x,z)){bs=s;best={x,z,y,type,ref};}};
  for(const c of cops)if(c.down<=0)consider(c.x,c.z,1.3,'cop',c,0.6);
  for(const c of cars)if(c!==player.car&&c.kind!=='wreck')consider(c.x,c.z,1.0,'car',c,c.kind==='police'?0.75:1.7);
  for(const p of peds)if(p.down<=0)consider(p.x,p.z,1.3,'ped',p,1.25);
  return best;
}
function hitTarget(t,dmg,yaw){
  emit(t.x+rnd(-0.3,0.3),t.y+rnd(0,0.5),t.z+rnd(-0.3,0.3),t.type==='car'?0xffe0a0:0xc81e2a,0.5,0.25,0,1,0,t.type==='car');
  if(t.type==='cop'){const c=t.ref;c.hp-=dmg;heat();if(c.hp<=0)downCop(c,yaw,true);}
  else if(t.type==='ped'){const p=t.ref;p.hp-=dmg;p.flee=6;if(p.hp<=0)downPed(p,yaw,true);else addWanted(1,'Нападение на прохожего!');}
  else{const c=t.ref;if(c.kind==='traffic')c.stop=1.5;carDamage(c,dmg*0.8,true);}
}
function punch(){
  S.punchT=0.25;const fx=Math.sin(player.h),fz=Math.cos(player.h);let hit=null,bd=2.3;
  const tryHit=(o,type)=>{const dx=o.x-player.x,dz=o.z-player.z,d=Math.hypot(dx,dz);if(d<bd&&(dx*fx+dz*fz)/Math.max(d,0.01)>0.3){bd=d;hit={o,type};}};
  for(const p of peds)if(p.down<=0)tryHit(p,'ped');for(const c of cops)if(c.down<=0)tryHit(c,'cop');
  if(!hit){tone(200,0.05,'sine',0.05);return;}
  sfx.thud();const yaw=Math.atan2(hit.o.x-player.x,hit.o.z-player.z);player.h=yaw;
  hitTarget({x:hit.o.x,z:hit.o.z,y:1.4,type:hit.type,ref:hit.o},10,yaw);
}
function fireTick(dt){
  fireCd-=dt;S.aimT-=dt;S.punchT-=dt;S.lock=null;
  if(S.state!=='play')return;
  const want=input.fire||keys.KeyJ;const w=WEAPONS[inv.cur];
  const ox=player.car?player.car.x:player.x,oz=player.car?player.car.z:player.z;
  if(!w.melee&&want)S.lock=findTarget(ox,oz,w.range);
  if(!want||fireCd>0)return;
  if(w.melee){if(player.car){fireCd=0.8;toast('Из машины кулаками не выйдет','Купи ствол в «Калашном ряду»',1.4);return;}punch();fireCd=w.rate;return;}
  if((inv.ammo[inv.cur]||0)<=0){fireCd=0.7;sfx.click();toast('Нет патронов','Купи в оружейной',1.3);return;}
  fireCd=w.rate;inv.ammo[inv.cur]--;
  const oy=player.car?1.6:1.45,t=S.lock;
  const yaw=t?Math.atan2(t.x-ox,t.z-oz):cam.yaw;
  if(!player.car)player.h=yaw;S.aimT=0.5;
  const off=player.car?1.3:0.75;const mx=ox+Math.sin(yaw)*off,mz=oz+Math.cos(yaw)*off;
  emit(mx,oy,mz,0xffd070,0.8,0.06,0,0,0,true);
  sfx.gun(w.snd,w.vol);panic(ox,oz,40);
  if(S.wanted===0&&nearPolice(ox,oz,45))addWanted(1,'Стрельба при полиции!');
  for(let k=0;k<w.pellets;k++){
    if(t){const d=Math.hypot(t.x-ox,t.z-oz);const ch=w.acc*(1-0.45*d/w.range);
      if(Math.random()<ch){tracer(mx,oy,mz,t.x+rnd(-0.2,0.2),t.y+rnd(-0.2,0.3),t.z+rnd(-0.2,0.2));if(t.ref.down>0||t.ref.kind==='wreck')continue;hitTarget(t,w.dmg,yaw);}
      else tracer(mx,oy,mz,t.x+rnd(-1.6,1.6),t.y+rnd(-0.5,1),t.z+rnd(-1.6,1.6));}
    else{const sp=w.pellets>1?0.12:0.03;const a=yaw+rnd(-sp,sp);let L=w.range;
      for(let s=2;s<w.range;s+=1.5){const x=ox+Math.sin(a)*s,z=oz+Math.cos(a)*s;if(insideBuilding(x,oy,z)){L=s;emit(x,oy,z,0xffe0a0,0.4,0.15,0,0.5,0,true);break;}}
      tracer(mx,oy,mz,ox+Math.sin(a)*L,oy+rnd(-0.1,0.1),oz+Math.cos(a)*L);}
  }
  if(inv.ammo[inv.cur]===0)saveInv();
}
function combatVisuals(dt){
  const onFoot=!player.car;
  player.gun.visible=inv.cur!=='fists';
  if(onFoot){if(S.punchT>0){player.mesh.armR.rotation.x=-Math.PI/2*Math.sin(S.punchT/0.25*Math.PI);}
    else if(S.aimT>0&&inv.cur!=='fists'){player.mesh.armR.rotation.x=-Math.PI/2;player.mesh.armL.rotation.x=inv.cur==='pistol'?-1.2:-1.45;}}
  const t=S.lock;
  if(t&&!(t.ref.down>0)&&t.ref.kind!=='wreck'){const x=t.type==='car'?t.ref.x:t.ref.x,z=t.ref.z;lockMark.position.set(x,(t.type==='car'?2.6:2.5),z);lockMark.quaternion.copy(camera.quaternion);lockMark.visible=true;}
  else lockMark.visible=false;
  S.smokeT=(S.smokeT||0)-dt;const puff=S.smokeT<=0;if(puff)S.smokeT=0.12;
  for(const c of cars.slice()){
    if(c.kind==='wreck'){c.wreckT-=dt;if(puff&&Math.random()<0.5)emit(c.x+rnd(-0.5,0.5),1.6,c.z+rnd(-0.5,0.5),c.wreckT>18?0xff8a30:0x2c2826,c.wreckT>18?2:2.8,1.6,rnd(-0.3,0.3),2.5,rnd(-0.3,0.3),c.wreckT>18);
      if(c.wreckT<=0&&Math.hypot(c.x-player.x,c.z-player.z)>40)removeCar(c);}
    else if(c.hp<40&&puff){const fx=Math.sin(c.h),fz=Math.cos(c.h);emit(c.x+fx*1.8,1.3,c.z+fz*1.8,c.hp<20?0xff8a30:0x6a6662,1.4,1.1,0,2,0,c.hp<20);}
  }
  if(S.dmgFlash>0)S.dmgFlash-=dt;$('#hurt').style.opacity=Math.max(0,S.dmgFlash*1.6).toFixed(2);
}

/* ---------- shops ---------- */
const shops=[];
const signTex=canvasTex(256,128,drawSign);signTex.wrapS=signTex.wrapT=THREE.ClampToEdgeWrapping;
function drawSign(g,w,h){g.clearRect(0,0,w,h);g.fillStyle='#14161d';g.beginPath();if(g.roundRect)g.roundRect(4,4,w-8,h-8,18);else g.rect(4,4,w-8,h-8);g.fill();
  g.strokeStyle='#86e46f';g.lineWidth=5;g.stroke();g.textAlign='center';g.fillStyle='#86e46f';g.font='46px "Russo One","Arial Black",sans-serif';g.fillText('ОРУЖИЕ',w/2,66);
  g.fillStyle='#f6efe3';g.font='600 22px Rubik,system-ui,sans-serif';g.fillText('Калашный ряд',w/2,100);}
if(document.fonts&&document.fonts.ready)document.fonts.ready.then(()=>{drawSign(signTex.image.getContext('2d'),256,128);signTex.needsUpdate=true;});
const shopRingMat=new THREE.MeshBasicMaterial({color:0x86e46f,transparent:true,opacity:0.85,side:THREE.DoubleSide,depthWrite:false});
const awnMat=new THREE.MeshLambertMaterial({color:0x2f8a3c});
for(const [bi,bj,side] of [[4,4,0],[1,6,0],[6,1,2],[2,2,1]]){
  const b=blocks.find(q=>q.x===BC[bi]&&q.z===BC[bj]);
  const ox=[0,PA,0,-PA][side],oz=[-PA,0,PA,0][side];const x=b.x+ox,z=b.z+oz;
  const r=new THREE.Mesh(new THREE.RingGeometry(1.4,2,32),shopRingMat);r.rotation.x=-Math.PI/2;r.position.set(x,0.34,z);scene.add(r);
  const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:signTex,transparent:true}));sp.scale.set(6,3,1);sp.position.set(x,5.2,z);scene.add(sp);
  const aw=new THREE.Mesh(new THREE.BoxGeometry(side%2?1.8:6,0.25,side%2?6:1.8),awnMat);aw.position.set(x+Math.sign(-ox)*0.8,3.3,z+Math.sign(-oz)*0.8);scene.add(aw);
  shops.push({x,z,r,side,ox,oz});
}
S.shopLock=false;
function updateShops(dt){
  let nearest=1e9,ns=null;for(const s of shops){s.r.rotation.z+=dt*0.8;const d=Math.hypot(player.x-s.x,player.z-s.z);if(d<nearest){nearest=d;ns=s;}}
  if(nearest>3.5)S.shopLock=false;
  if(!player.car&&nearest<2.1&&!S.shopLock)openShop(ns);
  else if(player.car&&Math.hypot(player.car.x-ns.x,player.car.z-ns.z)<4&&!S.shopTold){S.shopTold=true;toast('Выйди из машины','чтобы зайти в оружейную',1.6);}
  if(player.car&&nearest>12)S.shopTold=false;
}
let curShop=null;
function openShop(s){curShop=s;S.state='shop';joy.id=null;cam.id=null;input.jx=input.jy=0;input.fire=false;joyEl.classList.remove('on');$('#shop').hidden=false;$('#shopMsg').textContent='Выбирай, что нравится';sfx.door();renderShop();}
function closeShop(){$('#shop').hidden=true;S.state='play';S.shopLock=true;save();}
$('#shopClose').addEventListener('click',closeShop);
function renderShop(){
  $('#shopMoney').textContent=fmtMoney(S.money);let h='';
  for(const id of WORDER.slice(1)){const w=WEAPONS[id],own=inv.owned[id];
    h+=`<div class="item"><div class="info"><b>${w.name}</b><span>${w.desc}</span>${own?`<em>Патронов: ${inv.ammo[id]||0}</em>`:`<em>В комплекте ${w.pack} патр.</em>`}</div><div class="acts">`;
    if(own){h+=`<button data-a="ammo" data-id="${id}" ${S.money<w.packPrice?'disabled':''}>+${w.pack} · ${fmtMoney(w.packPrice)}</button>`;
      h+=inv.cur===id?'<span class="eq">В руках</span>':`<button data-a="eq" data-id="${id}" class="alt">Взять</button>`;}
    else h+=`<button data-a="buy" data-id="${id}" ${S.money<w.price?'disabled':''}>${fmtMoney(w.price)}</button>`;
    h+='</div></div>';}
  const ar=Math.round(inv.armor);
  h+=`<div class="item"><div class="info"><b>Бронежилет</b><span>Принимает на себя большую часть урона</span><em>Броня: ${ar}%</em></div><div class="acts"><button data-a="armor" ${S.money<300||ar>=100?'disabled':''}>${ar>=100?'Полная':fmtMoney(300)}</button></div></div>`;
  h+=`<div class="item"><div class="info"><b>Аптечка</b><span>Сразу восстанавливает всё здоровье</span><em>Здоровье: ${Math.round(player.hp)}%</em></div><div class="acts"><button data-a="heal" ${S.money<150||player.hp>=100?'disabled':''}>${player.hp>=100?'Не нужна':fmtMoney(150)}</button></div></div>`;
  h+=`<div class="item"><div class="info"><b>Спорткар «Волга-GT»</b><span>Быстрее любой машины в городе, крепкий корпус. Пригонят ко входу</span></div><div class="acts"><button data-a="car" ${S.money<2000?'disabled':''}>${fmtMoney(2000)}</button></div></div>`;
  $('#shopList').innerHTML=h;
}
$('#shopList').addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b||b.disabled)return;const a=b.dataset.a,id=b.dataset.id,w=WEAPONS[id];let msg='';
  if(a==='buy'&&S.money>=w.price){S.money-=w.price;inv.owned[id]=true;inv.ammo[id]=(inv.ammo[id]||0)+w.pack;inv.cur=id;msg=w.name+' куплен и уже в руках';}
  else if(a==='ammo'&&S.money>=w.packPrice){S.money-=w.packPrice;inv.ammo[id]=(inv.ammo[id]||0)+w.pack;msg='+'+w.pack+' патронов: '+w.name;}
  else if(a==='eq'){inv.cur=id;msg='В руках: '+w.name;}
  else if(a==='armor'&&S.money>=300){S.money-=300;inv.armor=100;msg='Бронежилет надет';}
  else if(a==='heal'&&S.money>=150){S.money-=150;player.hp=100;msg='Здоровье восстановлено';}
  else if(a==='car'&&S.money>=2000){S.money-=2000;spawnSport(curShop);msg='«Волга-GT» ждёт у входа';}
  else return;
  sfx.buy();S.shown=S.money;$('#shopMsg').textContent=msg;save();renderShop();
});
function spawnSport(s){
  const c=newCar('parked',0xff2f6e);c.sport=true;c.hp=150;c.driver=false;
  const ux=s.ox?Math.sign(s.ox):0,uz=s.oz?Math.sign(s.oz):0;
  c.x=s.x+ux*2.4;c.z=s.z+uz*2.4;c.h=ux?0:Math.PI/2;c.vh=c.h;
  const sp=new THREE.Mesh(new THREE.BoxGeometry(2,0.1,0.55),new THREE.MeshLambertMaterial({color:0x111111}));sp.position.set(0,1.35,-2);c.g.add(sp);
  const st=new THREE.Mesh(new THREE.BoxGeometry(0.5,0.02,4.42),new THREE.MeshLambertMaterial({color:0xffffff}));st.position.set(0,1.15,0);c.g.add(st);
}

/* ---------- update ---------- */
function updatePlayer(dt,inp){
  if(player.car){
    const c=player.car;S.nitroOn=inp.nitro&&S.nitro>0.02&&inp.y>=0;
    if(S.nitroOn){S.nitro=Math.max(0,S.nitro-dt*0.35);}else S.nitro=Math.min(1,S.nitro+dt*0.08);
    const thr=S.nitroOn?1:inp.y;
    const top=c.sport?(S.nitroOn?64:48):(S.nitroOn?52:36);
    physCar(c,(thr+(S.nitroOn?0.6:0))*(c.sport?1.35:1),inp.x,inp.brake,dt,top);
    return;
  }
  S.nitroOn=false;S.nitro=Math.min(1,S.nitro+dt*0.08);
  const fx=Math.sin(cam.yaw),fz=Math.cos(cam.yaw),rx=-Math.cos(cam.yaw),rz=Math.sin(cam.yaw);
  let mx=fx*inp.y+rx*inp.x,mz=fz*inp.y+rz*inp.x;const m=Math.min(1,Math.hypot(mx,mz));
  if(m>0.05){const l=Math.hypot(mx,mz);mx/=l;mz/=l;const sp=(m>0.75?7.5:4)*m;player.x+=mx*sp*dt;player.z+=mz*sp*dt;
    const th=Math.atan2(mx,mz);player.h=player.h+wrapA(th-player.h)*Math.min(1,dt*12);player.phase+=sp*dt*1.7;animPerson(player.mesh,player.phase,Math.min(1,m*1.2));}
  else animPerson(player.mesh,0,0);
  let p=pushOut(player,player.x,player.z,0.45);player.x+=p[0];player.z+=p[1];
  for(const c of cars){for(const q of carCircles(c)){const dx=player.x-q[0],dz=player.z-q[1],d=Math.hypot(dx,dz);if(d<1.5&&d>1e-4){player.x+=dx/d*(1.5-d);player.z+=dz/d*(1.5-d);}}}
}
function hurt(n,c){
  if(player.hitCd>0)return;player.hitCd=0.8;sfx.thud();S.shake=0.6;
  if(c){const fx=Math.sin(c.h),fz=Math.cos(c.h);player.x+=fx*2.5;player.z+=fz*2.5;}
  damagePlayer(n);
}
function updateTraffic(dt){
  for(const c of cars){
    if(c.kind!=='traffic')continue;
    if(c.stop>0){c.stop-=dt;c.speed=0;}
    else{
      const fx=Math.sin(laneHead(c.lane)),fz=Math.cos(laneHead(c.lane));
      let target=c.cruise,blocked=null;
      const check=(ox,oz,obj)=>{const dx=ox-c.x,dz=oz-c.z;const ahead=dx*fx+dz*fz;if(ahead<=0||ahead>11)return;const lat=Math.abs(dx*fz-dz*fx);if(lat>2.0)return;const t=Math.max(0,(ahead-5)*2);if(t<target){target=t;blocked=obj;}};
      for(const o of cars)if(o!==c&&!(c.wait>3&&(o.kind==='parked'||o.kind==='parkedPolice'||o.kind==='wreck')))check(o.x,o.z,o);
      if(!player.car)check(player.x,player.z,'player');
      for(const p of peds)if(p.down<=0&&Math.abs(p.x-c.x)<12&&Math.abs(p.z-c.z)<12){const ax=p.x-c.x,az=p.z-c.z;const ahead=ax*fx+az*fz,lat=Math.abs(ax*fz-az*fx);if(ahead>0&&ahead<8&&lat<2.2)target=Math.min(target,Math.max(0,(ahead-3.5)*2));}
      if(target<0.5){c.wait+=dt;if(blocked==='player'||(blocked&&blocked.kind==='player')){c.honkCd-=dt;if(c.honkCd<=0&&c.wait>1.5){c.honkCd=3;if(S.state==='play')tone(330+Math.random()*80,0.25,'square',0.035);}}}
      else c.wait=0;
      c.speed+=clamp(target-c.speed,-22*dt,7*dt);
      const d=c.lane.dir,sp=c.s,sn=c.s+d*c.speed*dt;
      let turned=false;
      for(const r of R){const tp=r-d*LANE;if((sp-tp)*(sn-tp)<0||sn===tp){
        const border=Math.abs(r)===HALF&&Math.sign(r)===d;
        if(border||Math.random()<0.3){
          const oldLat=laneLat(c.lane);
          if(c.lane.axis==='x')c.lane={axis:'z',line:r,dir:d};else c.lane={axis:'x',line:r,dir:-d};
          c.s=oldLat;turned=true;break;}}}
      if(!turned)c.s=sn;
      placeOnLane(c);
    }
    if(!c.lane){continue;}
    c.h=laneHead(c.lane);
  }
}
function updatePolice(dt){
  const tx=player.car?player.car.x:player.x,tz=player.car?player.car.z:player.z;
  for(const c of cars){
    if(c.kind!=='police')continue;
    const dx=tx-c.x,dz=tz-c.z,dist=Math.hypot(dx,dz);
    let desired=Math.atan2(dx,dz);
    if(c.gone||S.wanted===0){c.gone=true;desired=Math.atan2(-dx,-dz);if(dist>130){removeCar(c);continue;}}
    let thr=1,steer=clamp(-wrapA(desired-c.h)*2.2,-1,1);
    if(!c.gone&&dist<9){thr=0.25;}
    if(!c.gone&&!c.unloaded&&S.wanted>=1&&dist<18&&Math.abs(c.speed)<6&&cops.filter(q=>q.down<=0).length<8){
      c.unloaded=true;const lx=Math.cos(c.h),lz=-Math.sin(c.h);spawnCop(c.x+lx*2.3,c.z+lz*2.3);spawnCop(c.x-lx*2.3,c.z-lz*2.3);}
    if(c.unloaded&&(dist>45||c.gone))c.unloaded=false;
    if(c.unloaded){physCar(c,0,0,true,dt,0);}
    else{
      if(c.rev>0){c.rev-=dt;thr=-1;steer=-steer;}
      else{if(Math.abs(c.speed)<1.2)c.stuck+=dt;else c.stuck=Math.max(0,c.stuck-dt);if(c.stuck>1.2){c.rev=1.1;c.stuck=0;}}
      physCar(c,thr,steer,false,dt,20+S.wanted*3);
      if(!c.gone&&S.wanted>=2&&dist<38){c.shootCd-=dt;if(c.shootCd<=0){c.shootCd=rnd(0.9,1.7);if(los(c.x,c.z,tx,tz))enemyShot(c.x+Math.sin(c.h)*0.6,1.65,c.z+Math.cos(c.h)*0.6,tx,tz,0.5-dist/110,4+S.wanted);}}
    }
    if(!player.car&&!c.gone&&dist<2.3&&Math.abs(c.speed)>5)hurt(12,c);
  }
  // spawn
  const want=S.wanted===0?0:Math.min(4,S.wanted+(S.wanted>2?1:0));
  const active=cars.filter(c=>c.kind==='police'&&!c.gone).length;
  S.polSpawn=(S.polSpawn||0)-dt;
  if(active<want&&S.polSpawn<=0){S.polSpawn=2.5;
    for(let t=0;t<20;t++){const lane=randomLane();const tmp={lane,s:rnd(-HALF,HALF)};placeOnLane(tmp);const d=Math.hypot(tmp.x-tx,tmp.z-tz);
      if(d>60&&d<120&&freeSpot(tmp.x,tmp.z,6)){const c=newCar('police');c.x=tmp.x;c.z=tmp.z;c.h=Math.atan2(tx-c.x,tz-c.z);c.vh=c.h;break;}}}
}
function collideCars(dt){
  for(let i=0;i<cars.length;i++)for(let j=i+1;j<cars.length;j++){
    const a=cars[i],b=cars[j];if(Math.abs(a.x-b.x)>6||Math.abs(a.z-b.z)>6)continue;
    const ca=carCircles(a),cb=carCircles(b);let nx=0,nz=0,ov=0;
    for(const p of ca)for(const q of cb){const dx=p[0]-q[0],dz=p[1]-q[1],d=Math.hypot(dx,dz);if(d<2.1&&d>1e-4){nx+=dx/d*(2.1-d);nz+=dz/d*(2.1-d);ov+=2.1-d;}}
    if(!ov)continue;
    const aFix=a.kind==='traffic',bFix=b.kind==='traffic';
    if(aFix&&bFix)continue;
    const rel=Math.abs(a.speed-b.speed*(Math.sin(a.h)*Math.sin(b.h)+Math.cos(a.h)*Math.cos(b.h)));
    if(aFix){b.x-=nx;b.z-=nz;}else if(bFix){a.x+=nx;a.z+=nz;}else{a.x+=nx/2;a.z+=nz/2;b.x-=nx/2;b.z-=nz/2;}
    for(const c of[a,b]){if(c.kind==='traffic'){if(rel>3)c.stop=2;}else c.speed*=rel>6?0.3:0.85;}
    const pc=player.car;
    if((a===pc||b===pc)&&rel>6){sfx.crash();S.shake=Math.min(1,rel/25);const other=a===pc?b:a;if(other.kind==='police'&&!other.gone)addWanted(1,'Таран полиции!');
      if(rel>10){carDamage(pc,(rel-8)*1.2,false);carDamage(other,(rel-6)*2,true);}}
  }
}
function updatePeds(dt){
  const movers=cars.filter(c=>Math.abs(c.speed)>4&&c.kind!=='traffic');
  for(const p of peds){
    if(p.down>0){p.down-=dt;if(p.down<=0)respawnPed(p,true);continue;}
    const sp=p.flee>0?p.spd*2.6:p.spd;if(p.flee>0)p.flee-=dt;
    p.u+=p.dir*sp*dt;const q=perim(p.u);p.x=p.b.x+q[0];p.z=p.b.z+q[1];
    p.m.g.position.set(p.x,0.3,p.z);p.m.g.rotation.y=q[2]+(p.dir<0?Math.PI:0);p.phase+=sp*dt*1.8;animPerson(p.m,p.phase,1);
    for(const c of movers){for(const cc of carCircles(c)){if(Math.hypot(p.x-cc[0],p.z-cc[1])<1.6){
      downPed(p,c.h,c===player.car,'Сбил прохожего!');if(c===player.car)sfx.thud();break;}}if(p.down>0)break;}
  }
}
function updatePickups(dt){
  const px=player.car?player.car.x:player.x,pz=player.car?player.car.z:player.z,r=player.car?3:1.6;
  for(const p of pickups){p.mesh.rotation.y+=dt*2.5;p.mesh.position.y=1.2+Math.sin(S.time*3+p.x)*0.18;
    if(Math.hypot(p.x-px,p.z-pz)<r){
      if(p.type==='cash'){const v=Math.round(rnd(25,80)/5)*5;S.money+=v;sfx.coin();toast('+'+fmtMoney(v),null,1);}
      else{if(player.hp>=100)continue;player.hp=Math.min(100,player.hp+50);sfx.heal();toast('Здоровье +50',null,1.2);}
      placePickup(p);save();}}
  for(let i=drops.length-1;i>=0;i--){const d=drops[i];d.t-=dt;d.mesh.rotation.y+=dt*3;
    if(Math.hypot(d.x-px,d.z-pz)<r){S.money+=d.val;sfx.coin();toast('+'+fmtMoney(d.val),null,1);}
    else if(d.t>0)continue;scene.remove(d.mesh);drops.splice(i,1);}
}
function updateMission(dt){
  const mEl=$('#mission');
  if(!mission.active){mission.wait-=dt;if(mission.wait<=0){newMission();toast('Новый заказ',`Доставка ${mission.place}`,2.4);}mEl.innerHTML='Ждём новый заказ…';return;}
  mission.t-=dt;ring.rotation.z+=dt;beam.material.opacity=0.24+Math.sin(S.time*4)*0.08;
  const px=player.car?player.car.x:player.x,pz=player.car?player.car.z:player.z;const d=Math.hypot(mission.x-px,mission.z-pz);
  if(d<4.2){const bonus=Math.max(0,Math.floor(mission.t))*5;S.money+=mission.reward+bonus;mission.count++;sfx.win();
    toast('Заказ выполнен!','+'+fmtMoney(mission.reward)+(bonus?' и бонус за скорость '+fmtMoney(bonus):''),2.8);mission.active=false;mission.wait=2.5;beam.visible=ring.visible=false;save();return;}
  if(mission.t<=0){sfx.fail();toast('Не успел!','Клиент ушёл к другому таксисту',2.4);mission.active=false;mission.wait=2.5;beam.visible=ring.visible=false;return;}
  const t=Math.ceil(mission.t);mEl.innerHTML=`Доставка ${mission.place}<br><b>${Math.floor(t/60)}:${String(t%60).padStart(2,'0')}</b> · <b>${Math.round(d)} м</b> · ${fmtMoney(mission.reward)}`;
}
function updateWanted(dt){
  S.wantedCd=Math.max(0,S.wantedCd-dt);
  const tx=player.car?player.car.x:player.x,tz=player.car?player.car.z:player.z;
  let near=1e9;for(const c of cars)if(c.kind==='police'&&!c.gone)near=Math.min(near,Math.hypot(c.x-tx,c.z-tz));
  let copNear=1e9;for(const c of cops)if(c.down<=0)copNear=Math.min(copNear,Math.hypot(c.x-tx,c.z-tz));
  if(S.wanted>0){
    const carNear=near;near=Math.min(near,copNear+20);
    if(near<55){S.evadeT=0;}else{S.evadeT+=dt;if(S.evadeT>9){S.wanted--;S.evadeT=0;setStars();if(S.wanted===0){toast('Оторвался от полиции','Розыск снят',2);}}}
    $('#stars').classList.toggle('blink',near>=55);
    const slow=player.car?Math.abs(player.car.speed)<3:true;const close=player.car?carNear<6.5:(carNear<4||(copNear<1.9&&S.wanted<=2));
    if(slow&&close){S.bustT+=dt;if(S.bustT>(player.car?2.4:1.4))gameOver('b');}else S.bustT=Math.max(0,S.bustT-dt*2);
  }else{$('#stars').classList.remove('blink');S.bustT=0;}
}
function keepTraffic(dt){
  S.trafT=(S.trafT||0)-dt;const n=cars.filter(c=>c.kind==='traffic').length;
  if(n<TRAFFIC&&S.trafT<=0){S.trafT=0.7;spawnTraffic(70);}
}
function syncMeshes(dt){
  for(const c of cars){
    c.vh=c.vh+wrapA(c.h-c.vh)*Math.min(1,dt*(c.kind==='traffic'?7:20));
    c.g.position.set(c.x,groundH(c.x,c.z)*0.9,c.z);c.g.rotation.y=c.vh;
    for(const w of c.wheels)w.rotation.x+=c.speed*dt/0.42;
    if(c.lights){const on=(c.kind==='police'&&!c.gone)||(c.kind==='player'&&S.wanted>0);const ph=Math.floor(S.time*7)%2;
      c.lights[0].material=on&&ph?redLight:darkLight;c.lights[1].material=on&&!ph?blueLight:darkLight;}
  }
  player.mesh.g.position.set(player.x,groundH(player.x,player.z),player.z);player.mesh.g.rotation.y=player.h;
}
const tgt=new THREE.Vector3(),camPos=new THREE.Vector3();
function updateCamera(dt){
  if(S.state==='menu'){const a=S.time*0.06;camera.position.set(Math.sin(a)*150,70,Math.cos(a)*150);camera.lookAt(0,10,0);camera.fov=55;camera.updateProjectionMatrix();sky.position.copy(camera.position);sun.position.copy(camera.position).addScaledVector(sunDir,700);sun.lookAt(camera.position);return;}
  const c=player.car;let dist,hgt;
  if(mouseDrag){}
  if(c){tgt.set(c.x,1.3,c.z);dist=9+Math.abs(c.speed)*0.07;
    cam.dragT-=dt;if(cam.dragT<=0&&Math.abs(c.speed)>1){const want=c.speed<-2?c.h+Math.PI:c.h;cam.yaw+=wrapA(want-cam.yaw)*Math.min(1,dt*3.2);
      cam.pitch=lerp(cam.pitch,0.26,Math.min(1,dt*2));}}
  else{tgt.set(player.x,groundH(player.x,player.z)+1.7,player.z);dist=6.2;cam.dragT-=dt;}
  cam.dist=lerp(cam.dist,dist,Math.min(1,dt*3));
  const cp=Math.cos(cam.pitch),sp=Math.sin(cam.pitch);
  camPos.set(tgt.x-Math.sin(cam.yaw)*cam.dist*cp,tgt.y+cam.dist*sp+0.6,tgt.z-Math.cos(cam.yaw)*cam.dist*cp);
  // occlusion
  for(let i=1;i<=8;i++){const t=i/8;const x=lerp(tgt.x,camPos.x,t),y=lerp(tgt.y,camPos.y,t),z=lerp(tgt.z,camPos.z,t);
    if(insideBuilding(x,y,z)){const tt=Math.max(0.15,(i-1)/8);camPos.set(lerp(tgt.x,camPos.x,tt),lerp(tgt.y,camPos.y,tt)+0.5,lerp(tgt.z,camPos.z,tt));break;}}
  if(S.shake>0){camPos.x+=(Math.random()-0.5)*S.shake;camPos.y+=(Math.random()-0.5)*S.shake;S.shake=Math.max(0,S.shake-dt*2.5);}
  camera.position.lerp(camPos,Math.min(1,dt*14));camera.lookAt(tgt);
  const fov=62+(c?Math.min(14,Math.abs(c.speed)*0.3)+(S.nitroOn?8:0):0);camera.fov=lerp(camera.fov,fov,Math.min(1,dt*3));camera.updateProjectionMatrix();
  sky.position.copy(camera.position);sun.position.copy(camera.position).addScaledVector(sunDir,700);sun.lookAt(camera.position);
}
canvas.addEventListener('mousemove',e=>{if(!mouseDrag||S.state!=='play')return;cam.yaw-=(e.clientX-mlx)*0.006;cam.pitch=clamp(cam.pitch+(e.clientY-mly)*0.004,0.06,0.95);mlx=e.clientX;mly=e.clientY;cam.dragT=1.6;});
touchEl.addEventListener('mousedown',e=>{if(S.state==='play'&&e.clientX>=innerWidth*0.5){mouseDrag=true;mlx=e.clientX;mly=e.clientY;}});
let hudT=0;
function updateHUD(dt){
  S.shown+=(S.money-S.shown)*Math.min(1,dt*6);if(Math.abs(S.money-S.shown)<1)S.shown=S.money;
  $('#money').textContent=fmtMoney(S.shown);
  $('#hpbar').style.width=player.hp+'%';
  $('#arbar').style.width=Math.max(0,inv.armor)+'%';
  if(player.car){$('#kmh').textContent=Math.round(Math.abs(player.car.speed)*3.6);$('#carhp').textContent='Корпус '+Math.max(0,Math.round(player.car.hp/(player.car.sport?1.5:player.car.isPolice?1.2:1)))+'%';}
  const w=WEAPONS[inv.cur];$('#weapName').textContent=w.name;$('#weapAmmo').textContent=w.melee?'':(inv.ammo[inv.cur]||0);
  $('#btnFire').textContent=w.melee?'Удар':'Огонь';
  $('#btnNitro').style.setProperty('--n',S.nitro.toFixed(2));
  const act=$('#btnAct');
  if(player.car){act.textContent='Выйти';act.classList.remove('idle');}
  else{const c=nearestCar(4.6);act.textContent=c?(c.kind==='traffic'&&c.driver?'Угнать':'Сесть'):'Сесть';act.classList.toggle('idle',!c);}
  if(toastT>0){toastT-=dt;if(toastT<=0)toastEl.classList.remove('show');}
  hudT-=dt;if(hudT<=0){hudT=1/30;drawMap();}
}

/* ---------- flow ---------- */
function resetPlayer(){
  if(player.car){const c=player.car;c.kind='parked';c.driver=false;player.car=null;}
  player.x=9;player.z=12;player.h=Math.PI;player.hp=100;player.mesh.g.visible=true;cam.yaw=Math.PI;cam.pitch=0.32;
  for(const c of cars.slice())if(c.kind==='police'||c.kind==='parkedPolice'||c.kind==='wreck')removeCar(c);
  for(const c of cops.slice())removeCop(c);S.lock=null;input.fire=false;
  S.wanted=0;S.evadeT=0;S.bustT=0;setStars();$('#speedo').hidden=true;
  if(!cars.some(c=>c.kind==='parked'&&Math.hypot(c.x-9,c.z-20)<6)){const c=newCar('parked',pick(CAR_COLORS));c.x=5.9;c.z=20;c.h=Math.PI;c.vh=c.h;c.driver=false;}
}
function gameOver(kind){
  if(S.state!=='play')return;S.state='over';
  const t=$('#overTitle');t.textContent=kind==='w'?'ПОТРАЧЕНО':'ПОПАЛСЯ';t.className=kind==='w'?'w':'b';
  const fine=kind==='w'?Math.min(S.money,100):Math.round(S.money*0.15);S.money-=fine;save();
  let lost='';if(kind==='b'&&WORDER.some(w=>w!=='fists'&&inv.owned[w])){resetInv();lost=' · оружие конфисковано';}
  $('#overSub').textContent=(kind==='w'?'Больница взяла ':'Штраф полиции ')+fmtMoney(fine)+lost;
  $('#over').hidden=false;$('#againBtn').hidden=true;canvas.classList.add('gray');sfx.fail();
  setTimeout(()=>{$('#againBtn').hidden=false;},1600);
}
$('#againBtn').addEventListener('click',()=>{$('#over').hidden=true;canvas.classList.remove('gray');resetPlayer();S.state='play';mission.active=false;mission.wait=1.5;beam.visible=ring.visible=false;});
$('#playBtn').addEventListener('click',()=>{initAudio();$('#start').hidden=true;$('#hud').hidden=false;S.state='play';setStars();mission.wait=1.2;
  camera.position.set(player.x,6,player.z+8);toast('Кострома-Сити','Жёлтая машина рядом, оружейная — зелёный круг впереди',3.4);
  try{navigator.wakeLock&&navigator.wakeLock.request('screen').catch(()=>{});}catch(e){}});
function pause(on){if(on&&S.state==='play'){S.state='pause';$('#pause').hidden=false;}else if(!on&&S.state==='pause'){S.state='play';$('#pause').hidden=true;}}
$('#pauseBtn').addEventListener('click',()=>pause(true));
$('#resumeBtn').addEventListener('click',()=>pause(false));
$('#resetBtn').addEventListener('click',()=>{S.money=0;S.shown=0;resetInv();inv.armor=0;save();resetPlayer();mission.active=false;mission.wait=1;beam.visible=ring.visible=false;pause(false);});
$('#muteBtn').addEventListener('click',()=>{A.muted=!A.muted;$('#muteBtn').style.opacity=A.muted?0.4:1;initAudio();});
document.addEventListener('visibilitychange',()=>{if(document.hidden)pause(true);});
document.addEventListener('gesturestart',e=>e.preventDefault());
document.addEventListener('touchmove',e=>{if(e.target.closest&&e.target.closest('#shopList'))return;e.preventDefault();},{passive:false});
if(S.record>0)$('#record').textContent='Лучший счёт: '+fmtMoney(S.record);
beam.visible=ring.visible=false;

let last=performance.now();
function frame(now){
  const dt=Math.min(0.05,(now-last)/1000);last=now;
  if(canvas.width!==Math.round(canvas.clientWidth*renderer.getPixelRatio()))resize();
  if(S.state!=='pause'&&S.state!=='shop'){
    S.time+=dt;hornCd-=dt;player.hitCd-=dt;
    const inp=S.state==='play'?readKeys():{x:0,y:0,nitro:false,brake:false};
    if(S.state==='play')updatePlayer(dt,inp);
    updateTraffic(dt);
    for(const c of cars)if(c.kind==='parked'||c.kind==='parkedPolice'||c.kind==='wreck'){if(Math.abs(c.speed)>0.05)physCar(c,0,0,false,dt,0);}
    if(S.state==='play'){updatePolice(dt);updateCops(dt);}
    collideCars(dt);updatePeds(dt);
    if(S.state==='play'){fireTick(dt);updatePickups(dt);updateMission(dt);updateWanted(dt);updateShops(dt);}
    else for(const p of pickups){p.mesh.rotation.y+=dt*2.5;}
    keepTraffic(dt);syncMeshes(dt);combatVisuals(dt);updateParts(dt);updateTracers(dt);updateCamera(dt);
    if(S.state!=='menu')updateHUD(dt);
    audioTick();
  }
  renderer.render(scene,camera);
  requestAnimationFrame(frame);
}
function start(data){
  if(data&&typeof data.money==='number'){S.money=data.money;S.shown=data.money;}
  try{window.claude&&window.claude.hot&&window.claude.hot.snapshot&&window.claude.hot.snapshot(()=>({money:S.money}));}catch(e){}
  requestAnimationFrame(t=>{last=t;frame(t);});
}
const hot=window.claude&&window.claude.hot;
if(hot&&hot.ready)hot.ready(start);else start((hot&&hot.data)||{});
})();
