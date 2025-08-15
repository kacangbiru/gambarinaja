// firebase-config.js
// --- GANTI nilai-nilai di bawah dengan config dari Firebase Console (Project settings → SDK setup) ---
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  databaseURL: "https://YOUR_PROJECT_ID-default-rtdb.firebaseio.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "SENDER_ID",
  appId: "APP_ID"
};

// Don't modify below (used by app.js)
window.__FIREBASE_CONFIG__ = firebaseConfig;
