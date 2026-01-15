// payment-logic.js (FINAL: Supports MULTIPLE Deposit/Withdrawal requests, Deposit CANCEL feature REMOVED)

import { auth, database } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.1.0/firebase-auth.js";
import { ref, get, set, push, serverTimestamp, remove, runTransaction } from "https://www.gstatic.com/firebasejs/9.1.0/firebase-database.js";

/* ELEMENTS */
const userEmail = document.getElementById("userEmail");
const userCoinsSpan = document.getElementById("userCoins");
const errorMsg = document.getElementById("errorMsg"); 
const depositInput = document.getElementById("depositInput");
const initDepositBtn = document.getElementById("initDepositBtn"); 
const withdrawInput = document.getElementById("withdrawInput");
const withdrawBtn = document.getElementById("withdrawBtn");

// NEW DEPOSIT PAYMENT ELEMENTS
const paymentOptionsBox = document.getElementById("paymentOptionsBox");
const paymentAmountDisplay = document.getElementById("paymentAmountDisplay");
const paymentAppButtons = document.querySelectorAll(".payment-app-btn"); 
const userUpiIdInput = document.getElementById("userUpiIdInput");     
const userUtrInput = document.getElementById("userUtrInput");         
const submitDepositFinalBtn = document.getElementById("submitDepositFinalBtn"); 
const cancelPaymentBtn = document.getElementById("cancelPaymentBtn"); 

// WITHDRAWAL ELEMENT
const withdrawalUpiIdInput = document.getElementById("withdrawalUpiIdInput"); 

// PENDING REQUEST LIST ELEMENTS
const pendingRequestsContainer = document.getElementById("pendingRequestsContainer");
const pendingRequestsList = document.getElementById("pendingRequestsList");
const requestSeparator = document.getElementById("requestSeparator"); // The HR element

// UI CONTAINERS (deposit/withdrawal forms)
const depositInputGroup = document.getElementById("depositInputGroup"); 
const withdrawalInputGroup = document.getElementById("withdrawalInputGroup");

/* VARIABLES */
let uid = null;
let userEmailValue = null; 
let currentCoins = 0;
let pendingDepositAmount = 0; 

// 🔥 YOUR UPI ID
const MERCHANT_UPI_ID = "paytmqr6qnhdp@ptys"; 
const MERCHANT_NAME = "Coin Game Deposit";


// ==========================================================
// UTILITY & UI FUNCTIONS
// ==========================================================

// Function to generate UPI Deep Link URL (No change)
const generateUpiUrl = (amount, app = 'other') => {
    const transactionNote = `GameDeposit-${uid.substring(0, 10)}`; 
    
    let url = `upi://pay?pa=${MERCHANT_UPI_ID}&pn=${encodeURIComponent(MERCHANT_NAME)}&am=${amount}&cu=INR&tn=${encodeURIComponent(transactionNote)}`;

    if (app === 'phonepe') {
        url = `intent://${url}#Intent;package=com.phonepe.app;scheme=upi;end`;
    } else if (app === 'googlepay') {
        url = `intent://${url}#Intent;package=com.google.android.apps.nbu.paisa.user;scheme=upi;end`;
    } else if (app === 'paytm') {
        url = `intent://${url}#Intent;package=net.one97.paytm;scheme=upi;end`;
    }
    
    return url;
};

// Function to handle App Click and initiate Payment (No change)
const initiatePayment = (amount, app) => {
    const upiUrl = generateUpiUrl(amount, app);
    window.location.href = upiUrl;
    alert("The Payment App opens. After making the payment, please return and press the 'Submit Deposit Request' button and enter your UPI/UTR details.ें!");
};


// 🔥 UPDATED: Function to create a list item for a request (Deposit Cancel button removed)
const createRequestItem = (requestId, data) => {
    const li = document.createElement('li');
    li.className = `request-item ${data.type.toLowerCase()}`;

    let contentHTML;
    let actionsHTML = '';
    
    // Check if timestamp is a server timestamp object, or a number (Date.now())
    // Use || 0 as a fallback for timestamp to avoid errors
    const timestampValue = data.timestamp?.seconds ? data.timestamp.seconds * 1000 : data.timestamp || 0;
    const formattedDate = new Date(timestampValue).toLocaleString();

    if (data.type === 'Deposit') {
        contentHTML = `
            <strong>Deposit: +${data.amount} Coins</strong>
            <p>Date: ${formattedDate}</p>
            <p>Your UPI: ${data.userUpiId}</p>
            <p>Your Ref/UTR: <span class="utr-value">${data.transactionId}</span></p>
            <p style="font-size: 0.8em; color: #ff9800; margin-top: 8px;">Waiting for Admin Approval.</p>
        `;
        // 🔥 Deposit Cancel button removed here as per user request
    } else if (data.type === 'Withdrawal') {
        contentHTML = `
            <strong>Withdrawal: -${data.amount} Coins (₹)</strong>
            <p>Date: ${formattedDate}</p>
            <p>Cashout To: <span class="upi-value">${data.userWithdrawalUpi}</span></p>
            <p style="font-size: 0.8em; color: #f44336; margin-top: 8px;">Waiting for Admin Payment.</p>
        `;
        // No cancel button for withdrawal
    }
    
    li.innerHTML = contentHTML + actionsHTML;
    return li;
};


// Function to fetch ALL pending requests and render them (No Change)
const fetchAndRenderPendingRequests = async () => {
    pendingRequestsList.innerHTML = ''; // Clear previous list
    errorMsg.innerHTML = '';
    
    let allRequests = [];

    try {
        // 1. Fetch all pending Deposits
        const depositSnap = await get(ref(database, 'admin_requests/pending_deposits'));
        if (depositSnap.exists()) {
            Object.entries(depositSnap.val()).forEach(([requestId, data]) => {
                // Filter only requests belonging to the current user
                if (data.uid === uid) {
                    allRequests.push({ ...data, requestId, type: 'Deposit', timestamp: data.timestamp || Date.now() });
                }
            });
        }

        // 2. Fetch all pending Withdrawals
        const withdrawalSnap = await get(ref(database, 'admin_requests/pending_withdrawals'));
        if (withdrawalSnap.exists()) {
            Object.entries(withdrawalSnap.val()).forEach(([requestId, data]) => {
                // Filter only requests belonging to the current user
                if (data.uid === uid) {
                    allRequests.push({ ...data, requestId, type: 'Withdrawal', timestamp: data.timestamp || Date.now() });
                }
            });
        }
    } catch (error) {
        console.error("Error fetching pending requests:", error);
        errorMsg.innerHTML = "❌ Could not load pending request status. Please refresh.";
        pendingRequestsContainer.classList.add("hidden");
        requestSeparator.classList.add("hidden");
        return;
    }


    if (allRequests.length > 0) {
        // Sort by timestamp (newest first)
        allRequests.sort((a, b) => {
            const timeA = a.timestamp?.seconds ? a.timestamp.seconds * 1000 : a.timestamp;
            const timeB = b.timestamp?.seconds ? b.timestamp.seconds * 1000 : b.timestamp;
            return timeB - timeA;
        });

        allRequests.forEach(request => {
            pendingRequestsList.appendChild(createRequestItem(request.requestId, request));
        });

        // Show the container and separator
        pendingRequestsContainer.classList.remove("hidden");
        requestSeparator.classList.remove("hidden");
        
    } else {
        // No pending requests, hide the container
        pendingRequestsContainer.classList.add("hidden");
        requestSeparator.classList.add("hidden");
    }
    
    // Always ensure input groups are visible unless payment options are showing
    if (paymentOptionsBox.classList.contains('hidden')) {
        depositInputGroup.classList.remove("hidden");
        withdrawalInputGroup.classList.remove("hidden");
    }
};


// ==========================================================
// CORE LOGIC: REQUEST HANDLING 
// ==========================================================

// Deposit Request Submission (No major change, just formatting)
const submitDepositRequest = async (amount, upiId, utr) => {
    errorMsg.innerHTML = "";
    
    if (amount <= 0 || isNaN(amount)) {
        errorMsg.innerHTML = "❌ please enter correct amount.";
        return;
    }
    
    if (!upiId || !upiId.includes('@') || upiId.length < 5) {
        errorMsg.innerHTML = "❌ please enter your correct upi id(example: user@bank).";
        return;
    }
    if (!utr || utr.length < 6) {
        errorMsg.innerHTML = "❌ please enter Transaction ID (UTR/Ref No.) .";
        return;
    }

    const newRequestRef = push(ref(database, 'admin_requests/pending_deposits'));
    const requestId = newRequestRef.key;
    
    const requestData = {
        uid: uid,
        email: userEmailValue,
        amount: amount,
        timestamp: serverTimestamp(),
        status: "Pending",
        type: "Deposit",
        userUpiId: upiId,    
        transactionId: utr,
        requestId: requestId 
    };
    
    try {
        await set(newRequestRef, requestData);
        
        // Update UI
        depositInput.value = '';
        userUpiIdInput.value = '';
        userUtrInput.value = '';
        paymentOptionsBox.classList.add('hidden');
        
        // Refresh the list of pending requests
        fetchAndRenderPendingRequests();
        
        alert(`✅ Deposit Request for ${amount} coins submitted!`);

    } catch (error) {
        console.error("Deposit request submission failed:", error);
        errorMsg.innerHTML = "❌ Deposit request submit failed.";
    }
};

// Withdrawal Request Submission (No Change)
const submitWithdrawRequest = async (amount) => {
    errorMsg.innerHTML = "";
    if (amount <= 0 || isNaN(amount)) {
        errorMsg.innerHTML = "❌ Please enter the correct amount.";
        return;
    }

    // Get UPI ID and validate
    const upiId = withdrawalUpiIdInput.value.trim();
    if (!upiId || !upiId.includes('@') || upiId.length < 5) {
        errorMsg.innerHTML = "❌ Please enter the correct UPI ID where payment is to be taken.";
        return;
    }

    const confirmWithdrawal = confirm(`Do you want to withdraw ${amount} fund on UPI ID: ${upiId}  \n\n fund will be deducted instantly, and the payment will be sent by the admin shortly.`);
    
    if (!confirmWithdrawal) return;

    // --- Core Coin Deduction & Request Submission ---
    try {
        const result = await runTransaction(ref(database, `users/${uid}/coins`), (currentCoinsVal) => {
            if (currentCoinsVal === null) return 0; 
            
            const newCoins = currentCoinsVal - amount;
            
            if (newCoins < 0) {
                // Abort the transaction
                return undefined;
            } else {
                // Proceed with deduction
                return newCoins;
            }
        });
        
        if (result.committed) {
            // Coins were successfully deducted
            
            // 1. Log the request in admin panel
            const newRequestRef = push(ref(database, 'admin_requests/pending_withdrawals'));
            const requestId = newRequestRef.key;

            const requestData = {
                uid: uid,
                email: userEmailValue,
                amount: amount,
                timestamp: serverTimestamp(),
                status: "Pending",
                type: "Withdrawal",
                userWithdrawalUpi: upiId,
                requestId: requestId
            };
            
            await set(newRequestRef, requestData);

            // 2. Update UI
            currentCoins = result.snapshot.val();
            userCoinsSpan.innerText = currentCoins;
            withdrawInput.value = '';
            withdrawalUpiIdInput.value = '';
            
            // Refresh the list of pending requests
            fetchAndRenderPendingRequests();

            alert(`✅ Withdrawal Request for ${amount} coins submitted!`);

        } else {
            // Transaction aborted (Insufficient coins)
            errorMsg.innerHTML = "❌ Withdrawal Failed: You don't have that many coins.";
        }

    } catch (error) {
        console.error("Withdrawal transaction failed:", error);
        errorMsg.innerHTML = "❌ There was an error submitting the withdrawal request.";
    }
};


// 🔥 Deposit Cancellation Function REMOVED as per user request.


// ==========================================================
// EVENT LISTENERS (No Change)
// ==========================================================

// Deposit Button Click (Step 1)
initDepositBtn.onclick = () => {
    errorMsg.innerHTML = "";
    const amount = parseInt(depositInput.value);
    if (amount <= 0 || isNaN(amount)) {
        errorMsg.innerHTML = "❌ Please enter the correct deposit amount.";
        return;
    }

    pendingDepositAmount = amount;
    
    // Update UI
    paymentAmountDisplay.innerText = amount;
    depositInputGroup.classList.add('hidden');
    withdrawalInputGroup.classList.add('hidden'); 
    paymentOptionsBox.classList.remove('hidden');
};

// Deposit App Link Click (Step 2)
paymentAppButtons.forEach(btn => {
    btn.onclick = (e) => {
        e.preventDefault(); 
        if(pendingDepositAmount > 0) {
            const app = Array.from(e.target.classList).find(cls => cls.endsWith('-btn')).replace('-btn', '');
            initiatePayment(pendingDepositAmount, app);
        } else {
            errorMsg.innerHTML = "❌ Please enter the first deposit amount and click 'Deposit'.";
        }
    };
});

// Final Deposit Submission (Step 3)
submitDepositFinalBtn.onclick = () => {
    errorMsg.innerHTML = "";
    if (pendingDepositAmount > 0) {
        submitDepositRequest(pendingDepositAmount, userUpiIdInput.value.trim(), userUtrInput.value.trim());
    } else {
        errorMsg.innerHTML = "❌ Please enter the amount and complete step 1 & 2.";
    }
};

// Cancel Deposit Process (before final submission)
cancelPaymentBtn.onclick = () => {
    pendingDepositAmount = 0;
    depositInputGroup.classList.remove('hidden');
    withdrawalInputGroup.classList.remove('hidden');
    paymentOptionsBox.classList.add('hidden');
    depositInput.value = '';
    errorMsg.innerHTML = "";
};


// Withdrawal Button Click
withdrawBtn.onclick = () => {
    const amount = parseInt(withdrawInput.value);
    submitWithdrawRequest(amount);
};


// ==========================================================
// AUTHENTICATION & INITIALIZATION 
// ==========================================================

onAuthStateChanged(auth, async (u) => {
    if (!u) {
        location.href = "index.html"; 
        return;
    }
    
    uid = u.uid;
    userEmailValue = u.email;
    userEmail.innerText = u.email;
    
    // 1. Load User Coins
    const userRef = ref(database, `users/${uid}/coins`);
    const snap = await get(userRef);
    
    // Initialize coins if not found (default to 1000)
    currentCoins = snap.exists() ? snap.val() : 1000;
    if (!snap.exists()) await set(userRef, currentCoins);
    
    userCoinsSpan.innerText = currentCoins;

    // 2. Fetch and Render ALL pending requests
    fetchAndRenderPendingRequests();
});
