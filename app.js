let map = new maplibregl.Map({
    container: 'map',
    style: 'https://demotiles.maplibre.org/style.json',
    center: [0, 0],
    zoom: 2
});

let isLocked = false;
const lockBtn = document.getElementById('lockBtn');
const lockIcon = document.getElementById('lockIcon');

lockBtn.addEventListener('click', () => {
    isLocked = !isLocked;
    lockIcon.src = isLocked ? "assets/unlock-icon.png" : "assets/lock-icon.png";
    map.dragPan[isLocked ? 'disable' : 'enable']();
});

// Mode Mobile = gambar sesuai gerakan jari
// Mode Desktop = tap 1 pixel per klik
if (/Mobi|Android/i.test(navigator.userAgent)) {
    map.on('touchstart', (e) => {
        console.log("Drawing pixel at:", e.lngLat);
        // TODO: Simpan ke Firebase
    });
} else {
    map.on('click', (e) => {
        console.log("Drawing 1 pixel at:", e.lngLat);
        // TODO: Simpan ke Firebase
    });
}
