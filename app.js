// ====== Firebase Init ======
if (!window.__FIREBASE_CONFIG__) {
  alert('Isi firebase-config.js dulu.');
}
firebase.initializeApp(window.__FIREBASE_CONFIG__);
const FB_AUTH = firebase.auth();
const FB_DB = firebase.database();

// ====== DOM ======
const mapEl = document.getElementById('map');
const overlay = document.getElementById('overlay');
const ctx = overlay.getContext('2d');

const googleBtn = document.getElementById('googleBtn');
const userInfo = document.getElementById('userInfo');

const lockBtn = document.getElementById('lockBtn');
const lockIcon = document.getElementById('lockIcon');
const lockText = document.getElementById('lockText');
const paletteBar = document.getElementById('paletteBar');

const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

// ====== Lock button (mobile only) SVGs ======
const SVG_LOCK = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" fill="currentColor"><path d="M240-80q-33 0-56.5-23.5T160-160v-400q0-33 23.5-56.5T240-640h40v-80q0-83 58.5-141.5T480-920q83 0 141.5 58.5T680-720v80h40q33 0 56.5 23.5T800-560v400q0 33-23.5 56.5T720-80H240Zm0-80h480v-400H240v400Zm240-120q33 0 56.5-23.5T560-360q0-33-23.5-56.5T480-440q-33 0-56.5 23.5T400-360q0 33 23.5 56.5T480-280ZM360-640h240v-80q0-50-35-85t-85-35q-50 0-85 35t-35 85v80Z"/></svg>`;
const SVG_UNLOCK = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" fill="currentColor"><path d="M240-640h360v-80q0-50-35-85t-85-35q-50 0-85 35t-35 85h-80q0-83 58.5-141.5T480-920q83 0 141.5 58.5T680-720v80h40q33 0 56.5 23.5T800-560v400q0 33-23.5 56.5T720-80H240q-33 0-56.5-23.5T160-160v-400q0-33 23.5-56.5T240-640Zm0 480h480v-400H240v400Zm240-120q33 0 56.5-23.5T560-360q0-33-23.5-56.5T480-440q-33 0-56.5 23.5T400-360q0 33 23.5 56.5T480-280Z"/></svg>`;

// ====== MapLibre (blank style, hanya pan/zoom) ======
const blankStyle = {
  "version": 8,
  "name": "blank",
  "sources": {},
  "layers": [
    {"id":"bg","type":"background","paint":{"background-color":"#0b0b0c"}}
  ],
  "glyphs": "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf"
};

const map = new maplibregl.Map({
  container: 'map',
  style: blankStyle,
  center: [0, 0],
  zoom: 2,
  pitch: 0,
  bearing: 0,
  attributionControl: false
});
map.addControl(new maplibregl.NavigationControl({showCompass:false}), 'top-right');

// ====== Canvas sizing (HiDPI) ======
let dpr = Math.min(3, window.devicePixelRatio || 1);
function resizeCanvas(){
  const rect = mapEl.getBoundingClientRect();
  overlay.style.left = rect.left+'px';
  overlay.style.top = rect.top+'px';
  overlay.style.width = rect.width+'px';
  overlay.style.height = rect.height+'px';
  overlay.width = Math.floor(rect.width * dpr);
  overlay.height = Math.floor(rect.height * dpr);
  ctx.setTransform(dpr,0,0,dpr,0,0);
  redrawAll();
}
window.addEventListener('resize', resizeCanvas);
map.on('load', resizeCanvas);
map.on('resize', resizeCanvas);

// ====== Grid model (mirip “kanvas” r/place) ======
const GRID_W = 512; // ubah sesuka hati
const GRID_H = 512;

// Mapping grid (x,y) <-> lngLat (pakai peta Mercator default)
// kita bentangkan grid ke rentang dunia, supaya pan/zoom stabil
function gridToLngLat(x,y){
  const lng = (x / GRID_W) * 360 - 180;         // -180 .. 180
  const lat = 85 - (y / GRID_H) * 170;          // 85 .. -85 (hindari kutub ekstrem)
  return {lng, lat};
}
function lngLatToGrid(lng,lat){
  const x = Math.floor(((lng + 180)/360) * GRID_W);
  const y = Math.floor(((85 - lat)/170) * GRID_H);
  return {x, y};
}

// ====== State ======
let currentColor = PALETTE[0];
let isLocked = false; // mobile drawing lock
const pixels = new Map(); // id -> {x,y,color,uid,ts}

// ====== Palette UI ======
function buildPalette(){
  PALETTE.forEach((hex, idx) => {
    const sw = document.createElement('button');
    sw.className = 'palette-swatch';
    sw.style.background = hex;
    sw.title = hex;
    if (idx===0) sw.classList.add('active');
    sw.addEventListener('click', () => {
      currentColor = hex;
      document.querySelectorAll('.palette-swatch').forEach(e => e.classList.remove('active'));
      sw.classList.add('active');
    });
    paletteBar.appendChild(sw);
  });
}
buildPalette();

// ====== Firebase Auth (Google only) ======
googleBtn.addEventListener('click', async () => {
  const provider = new firebase.auth.GoogleAuthProvider();
  try{
    await FB_AUTH.signInWithPopup(provider);
  }catch(e){
    console.error(e);
    alert('Login Google gagal.');
  }
});
FB_AUTH.onAuthStateChanged(u => {
  if (u){
    userInfo.textContent = u.displayName || u.email || u.uid;
    googleBtn.textContent = 'Sudah Login';
  } else {
    userInfo.textContent = 'Belum login';
    googleBtn.textContent = 'Login Google';
  }
});

// ====== Realtime DB: stream & write ======
function startPixelListener(){
  const ref = FB_DB.ref('pixels');
  ref.off();
  ref.limitToLast(10000).on('child_added', snap => {
    const p = snap.val();
    if (!p) return;
    pixels.set(snap.key, p);
    // quick redraw
    drawPixel(p);
  });
}
startPixelListener();

const COOLDOWN_MS = 10_000; // 10 detik (client-side, dev only)
function canPlace(uid){
  const k = 'cool_'+uid;
  const last = Number(localStorage.getItem(k) || 0);
  return Date.now() - last >= COOLDOWN_MS;
}
function stamp(uid){
  localStorage.setItem('cool_'+uid, Date.now());
}
async function placePixel(x,y,color){
  const user = FB_AUTH.currentUser;
  if (!user){ alert('Harus login Google dulu.'); return; }
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  if (x<0 || y<0 || x>=GRID_W || y>=GRID_H) return;

  if (!canPlace(user.uid)){
    const last = Number(localStorage.getItem('cool_'+user.uid) || 0);
    const remain = Math.ceil((COOLDOWN_MS - (Date.now()-last))/1000);
    alert(`Cooldown ${remain}s`);
    return;
  }

  const payload = {
    x, y, color, uid: user.uid,
    ts: firebase.database.ServerValue.TIMESTAMP
  };
  try{
    const ref = FB_DB.ref('pixels').push();
    await ref.set(payload);
    stamp(user.uid);
    // optimis: gambar langsung
    drawPixel(payload);
  }catch(e){
    console.error(e);
    alert('Gagal pasang pixel.');
  }
}

// ====== Rendering ======
function clearCanvas(){
  ctx.clearRect(0,0, overlay.width, overlay.height);
}

// hitung rect layar untuk sel grid (x,y) → (x+1,y+1)
function cellScreenRect(x,y){
  const p1 = gridToLngLat(x, y);
  const p2 = gridToLngLat(x+1, y+1);
  const s1 = map.project([p1.lng, p1.lat]); // CSS px
  const s2 = map.project([p2.lng, p2.lat]);
  // normalisasi
  const left = Math.min(s1.x, s2.x);
  const top  = Math.min(s1.y, s2.y);
  const w = Math.abs(s2.x - s1.x);
  const h = Math.abs(s2.y - s1.y);
  return {x:left, y:top, w, h};
}

function drawPixel(p){
  const r = cellScreenRect(p.x, p.y);
  // skip jika offscreen
  const W = overlay.clientWidth, H = overlay.clientHeight;
  if (r.x > W || r.y > H || (r.x + r.w) < 0 || (r.y + r.h) < 0) return;

  ctx.fillStyle = p.color;
  // agar tegas, bulatkan ke piksel layar
  ctx.fillRect(Math.round(r.x), Math.round(r.y), Math.ceil(r.w), Math.ceil(r.h));
}

function redrawAll(){
  clearCanvas();
  // gambar semua pixel
  for (const [,p] of pixels) drawPixel(p);
  // gambar grid halus saat zoom tinggi
  drawGridLines();
  // gambar preview jika ada
  if (previewCell) drawPreview(previewCell.x, previewCell.y);
}

function drawGridLines(){
  // aktifkan garis saat ukuran sel >= 8px
  const r = cellScreenRect(0,0);
  if (r.w < 8 || r.h < 8) return;
  const W = overlay.clientWidth, H = overlay.clientHeight;

  ctx.save();
  ctx.globalAlpha = 0.2;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1;

  // vertikal
  // step layar sama dengan lebar 1 sel
  // hitung x pertama pada layar ~ sejajarkan dengan grid
  const startTopLeft = map.unproject([0,0]);
  // scanning rough — alternatif: gunakan kolom layar per sel pertama yang terlihat
  // lebih sederhana: loop grid dalam viewport
  const boundsNW = map.getBounds().getNorthWest();
  const boundsSE = map.getBounds().getSouthEast();
  const gMin = lngLatToGrid(boundsNW.lng, boundsNW.lat);
  const gMax = lngLatToGrid(boundsSE.lng, boundsSE.lat);

  const minX = Math.max(0, Math.min(gMin.x, gMax.x));
  const maxX = Math.min(GRID_W-1, Math.max(gMin.x, gMax.x));
  const minY = Math.max(0, Math.min(gMin.y, gMax.y));
  const maxY = Math.min(GRID_H-1, Math.max(gMin.y, gMax.y));

  // vertikal lines
  for (let gx = minX; gx <= maxX+1; gx++){
    const a = cellScreenRect(gx, minY);
    const b = cellScreenRect(gx, maxY+1);
    ctx.beginPath();
    ctx.moveTo(Math.round(a.x), Math.round(a.y));
    ctx.lineTo(Math.round(b.x), Math.round(b.y + b.h));
    ctx.stroke();
  }
  // horizontal lines
  for (let gy = minY; gy <= maxY+1; gy++){
    const a = cellScreenRect(minX, gy);
    const b = cellScreenRect(maxX+1, gy);
    ctx.beginPath();
    ctx.moveTo(Math.round(a.x), Math.round(a.y));
    ctx.lineTo(Math.round(b.x + b.w), Math.round(b.y));
    ctx.stroke();
  }

  ctx.restore();
}

// ====== Preview (hover/tap) ======
let previewCell = null;
function drawPreview(x,y){
  const r = cellScreenRect(x,y);
  ctx.save();
  ctx.globalAlpha = 0.9;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = Math.max(1, Math.floor((r.w+r.h)/50));
  ctx.strokeRect(Math.round(r.x)+0.5, Math.round(r.y)+0.5, Math.ceil(r.w)-1, Math.ceil(r.h)-1);

  ctx.globalAlpha = 0.25;
  ctx.fillStyle = currentColor;
  ctx.fillRect(Math.round(r.x), Math.round(r.y), Math.ceil(r.w), Math.ceil(r.h));
  ctx.restore();
}

// update preview on move (desktop)
if (!isTouch){
  overlay.style.pointerEvents = 'auto'; // biar bisa tangkap mousemove
  overlay.addEventListener('mousemove', (ev)=>{
    const rect = overlay.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const y = ev.clientY - rect.top;
    const ll = map.unproject([x,y]);
    const g = lngLatToGrid(ll.lng, ll.lat);
    if (g.x>=0 && g.y>=0 && g.x<GRID_W && g.y<GRID_H){
      previewCell = g;
      redrawAll();
    } else {
      previewCell = null;
      redrawAll();
    }
  });
  overlay.addEventListener('mouseleave', ()=>{
    previewCell = null; redrawAll();
  });
}

// ====== Interaction ======
// Desktop: click once = place
if (!isTouch){
  overlay.addEventListener('click', (ev)=>{
    const rect = overlay.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const y = ev.clientY - rect.top;
    const ll = map.unproject([x,y]);
    const g = lngLatToGrid(ll.lng, ll.lat);
    placePixel(g.x, g.y, currentColor);
  });
}

// Mobile: lock/unlock behavior
function updateLockUI(){
  if (!isTouch) return;
  if (isLocked){
    lockIcon.innerHTML = SVG_LOCK;
    lockText.textContent = 'Lock';
    map.dragPan.disable();
    map.scrollZoom.disable();
    overlay.style.pointerEvents = 'auto';
  } else {
    lockIcon.innerHTML = SVG_UNLOCK;
    lockText.textContent = 'Unlock';
    map.dragPan.enable();
    map.scrollZoom.enable();
    overlay.style.pointerEvents = 'none';
  }
}
if (isTouch){
  // tampilkan ikon default
  lockIcon.innerHTML = SVG_UNLOCK;
  lockText.textContent = 'Unlock';
  overlay.style.pointerEvents = 'none';
  lockBtn.addEventListener('click', ()=>{
    isLocked = !isLocked;
    updateLockUI();
  });
}

// Mobile: saat locked → tap/drag = melukis
let drawing = false;
function touchXY(t){
  const rect = overlay.getBoundingClientRect();
  return [t.clientX - rect.left, t.clientY - rect.top];
}
overlay.addEventListener('touchstart', (ev)=>{
  if (!isTouch || !isLocked) return;
  drawing = true;
  const [x,y] = touchXY(ev.touches[0]);
  const ll = map.unproject([x,y]);
  const g = lngLatToGrid(ll.lng, ll.lat);
  placePixel(g.x, g.y, currentColor);
  ev.preventDefault();
}, {passive:false});
overlay.addEventListener('touchmove', (ev)=>{
  if (!isTouch || !isLocked || !drawing) return;
  const [x,y] = touchXY(ev.touches[0]);
  const ll = map.unproject([x,y]);
  const g = lngLatToGrid(ll.lng, ll.lat);
  placePixel(g.x, g.y, currentColor);
  ev.preventDefault();
}, {passive:false});
overlay.addEventListener('touchend', ()=>{ drawing = false; });

// ====== Redraw on map movement ======
map.on('move', redrawAll);
map.on('zoom', redrawAll);

// center map to canvas area
map.once('load', ()=>{
  // fit roughly to the grid center
  map.setCenter([0,0]);
  map.setZoom(2.5);
  resizeCanvas();
  redrawAll();
});
