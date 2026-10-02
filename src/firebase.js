import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: "smart-dry-box-9333e.firebaseapp.com",
  databaseURL: "https://smart-dry-box-9333e-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "smart-dry-box-9333e",
  storageBucket: "smart-dry-box-9333e.firebasestorage.app",
  messagingSenderId: "904020595189",
  appId: "1:904020595189:web:fe417496abf6ccf5b690bc"
};

const app = initializeApp(firebaseConfig);
export const database = getDatabase(app);