// firebase.js (FINAL & CORRECTED CODE)
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.1.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.1.0/firebase-auth.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/9.1.0/firebase-analytics.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/9.1.0/firebase-database.js";


const firebaseConfig = {
  apiKey: "AIzaSyBlVuOv0Yha8JxYwFLLXsgjbJDybp4yw6c",
  authDomain: "balajigaming-318c7.firebaseapp.com",
  projectId: "balajigaming-318c7",
  storageBucket: "balajigaming-318c7.firebasestorage.app",
  messagingSenderId: "135523880750",
  appId: "1:135523880750:web:f9e57633a8f5dc3658b4bf",
  measurementId: "G-8M5ZDJXBDH",
  databaseURL: "https://balajigaming-318c7-default-rtdb.firebaseio.com" // 🔥 FIX: Added databaseURL
};


const app = initializeApp(firebaseConfig);
const auth = getAuth(app); 
const database = getDatabase(app); 

export { auth, database }; 
