// index.js (Login/Signup Page Logic)
import { auth } from "./firebase.js"; // firebase.js से auth ऑब्जेक्ट import करें
import { 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    sendPasswordResetEmail,
    onAuthStateChanged,
    GoogleAuthProvider, // 👈 Google Provider को Import करें
    signInWithPopup     // 👈 signInWithPopup को Import करें
} from "https://www.gstatic.com/firebasejs/9.1.0/firebase-auth.js";


// Google Provider को Initialize करें (नया)
const googleProvider = new GoogleAuthProvider(); 


// --- Authentication State Listener (ऑटो-रीडायरेक्ट) ---
// अगर यूज़र पहले से logged in है, तो welcome.html पर redirect करें
onAuthStateChanged(auth, (user) => {
    if (user) {
        // यूज़र logged in है
        window.location.replace("welcome.html");
    }
});


// --- Form Elements और Event Listeners ---
const loginForm = document.getElementById("loginForm");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const errorMsg = document.getElementById("errorMsg");

// 1. Log In (Form Submit)
loginForm.addEventListener("submit", async (e) => {
    e.preventDefault(); // Page reload को रोकना 
    errorMsg.innerHTML = ""; 

    const email = emailInput.value;
    const password = passwordInput.value;

    try {
        await signInWithEmailAndPassword(auth, email, password);
        // सफलता पर, onAuthStateChanged रीडायरेक्ट संभाल लेगा।
    } catch (error) {
        // Error दिखाना 
        errorMsg.innerHTML = error.message;
    }
});


// 2. Sign Up (Sign Up Button Click)
document.getElementById("signupBtn").addEventListener("click", async () => {
    errorMsg.innerHTML = "";
    const email = emailInput.value;
    const password = passwordInput.value;

    try {
        await createUserWithEmailAndPassword(auth, email, password);
        // सफलता पर, onAuthStateChanged रीडायरेक्ट संभाल लेगा।
    } catch (error) {
        errorMsg.innerHTML = error.message;
    }
});


// 3. Forgot Password
document.getElementById("forgotPasswordLink").addEventListener("click", async (e) => {
    e.preventDefault();
    errorMsg.innerHTML = "";
    const email = emailInput.value; 

    if (!email) {
        errorMsg.innerHTML = "कृपया पासवर्ड रीसेट करने के लिए अपना ईमेल पता दर्ज करें।";
        return;
    }

    try {
        await sendPasswordResetEmail(auth, email);
        alert(`Password reset link sent to: ${email}`); 
    } catch (error) {
        errorMsg.innerHTML = error.message;
    }
});


// 4. Google Login (नया लॉजिक)
document.getElementById("googleLoginBtn").addEventListener("click", async () => {
    errorMsg.innerHTML = ""; // Error मैसेज साफ़ करें

    try {
        // Google पॉपअप से लॉगिन शुरू करें
        await signInWithPopup(auth, googleProvider);
        
        // सफलता पर, onAuthStateChanged रीडायरेक्ट संभाल लेगा (welcome.html पर)
    } catch (error) {
        // त्रुटि दिखाना (जैसे यूज़र ने पॉपअप बंद कर दिया)
        // यदि error.code 'auth/popup-closed-by-user' है, तो कोई त्रुटि न दिखाएँ।
        if (error.code !== 'auth/popup-closed-by-user') {
            errorMsg.innerHTML = "Google लॉगिन में त्रुटि: " + error.message;
            console.error(error);
        }
    }
});
