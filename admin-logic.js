// admin-logic.js (Admin Panel Logic - UPDATED to remove centralized pending status)

import { auth, database } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.1.0/firebase-auth.js";
import { ref, get, set, remove, onValue, runTransaction } from "https://www.gstatic.com/firebasejs/9.1.0/firebase-database.js";


// 🔥🔥🔥 IMPORTANT: REPLACE THIS UID WITH YOUR FIREBASE USER UID 🔥🔥🔥
// केवल इस UID वाला यूज़र ही एडमिन पैनल को एक्सेस कर पाएगा।
const ADMIN_UID = "FdnDQBuV5udDNzFPKmq1kRBB4zB3"; // <-- इसे बदलें!

/* ELEMENTS */
const adminUserEmail = document.getElementById("adminUserEmail");
const adminLogoutBtn = document.getElementById("adminLogoutBtn");
const depositRequestsList = document.getElementById("depositRequestsList");
const withdrawalRequestsList = document.getElementById("withdrawalRequestsList");
const noRequestsDiv = document.getElementById("noRequests");

// 🔥 NEW: Modal Elements
const paymentModalOverlay = document.getElementById("paymentModalOverlay");
const modalAmount = document.getElementById("modalAmount");
const modalUpiId = document.getElementById("modalUpiId");
const modalRequestId = document.getElementById("modalRequestId");
const phonepeLink = document.getElementById("phonepeLink");
const googlepayLink = document.getElementById("googlepayLink");
const paytmLink = document.getElementById("paytmLink");
const otherUpiLink = document.getElementById("otherUpiLink"); 
const finalConfirmBtn = document.getElementById("finalConfirmBtn");
const cancelModalBtn = document.getElementById("cancelModalBtn");

/* VARIABLES */
let currentAdminUID = null;
let currentWithdrawalData = null; // To store data temporarily (requestId, uid, amount, userUpi)


// ==========================================================
// CORE LOGIC: UPI LINK GENERATION & MODAL CONTROL
// ==========================================================

// Function to generate UPI Deep Link URL for the Admin (Payer) (No Change)
const generateUpiUrlForWithdrawal = (amount, userUpi, requestId, app = 'other') => {
    // Admin is the payer, so 'pa' is the user's UPI ID (where the money is going)
    const transactionNote = `GameWithdrawal-${requestId.substring(0, 8)}`; 
    
    const finalAmount = amount; 
    
    // pa=userUpi (receiver), am=finalAmount (amount to send), cu=INR
    let url = `upi://pay?pa=${userUpi}&pn=${encodeURIComponent("User Cashout")}&am=${finalAmount}&cu=INR&tn=${encodeURIComponent(transactionNote)}`;

    // App-specific intents for better performance on mobile
    if (app === 'phonepe') {
        url = `intent://${url}#Intent;package=com.phonepe.app;scheme=upi;end`;
    } else if (app === 'googlepay') {
        url = `intent://${url}#Intent;package=com.google.android.apps.nbu.paisa.user;scheme=upi;end`;
    } else if (app === 'paytm') {
        url = `intent://${url}#Intent;package=net.one97.paytm;scheme=upi;end`;
    }
    
    return url; 
};

// Function to show the payment modal (No Change)
const showPaymentModal = (data) => {
    currentWithdrawalData = data; // Store data temporarily
    
    // Set text content
    modalAmount.innerText = data.amount;
    modalUpiId.innerText = data.userWithdrawalUpi;
    modalRequestId.innerText = data.requestId.substring(0, 12) + '...';
    
    // Generate UPI links and set hrefs
    const upiId = data.userWithdrawalUpi;
    const amount = data.amount;
    const requestId = data.requestId;
    
    phonepeLink.href = generateUpiUrlForWithdrawal(amount, upiId, requestId, 'phonepe');
    googlepayLink.href = generateUpiUrlForWithdrawal(amount, upiId, requestId, 'googlepay');
    paytmLink.href = generateUpiUrlForWithdrawal(amount, upiId, requestId, 'paytm');
    otherUpiLink.href = generateUpiUrlForWithdrawal(amount, upiId, requestId, 'other'); 
    
    // Show the modal
    paymentModalOverlay.style.display = 'flex';
};

// Function to close the payment modal (No Change)
const hidePaymentModal = () => {
    paymentModalOverlay.style.display = 'none';
    currentWithdrawalData = null; // Clear data
};

// ==========================================================
// CORE LOGIC: ADMIN ACTIONS
// ==========================================================

// Deposit Approval (🔥 MODIFIED: Added removal of centralized pending status)
const approveDeposit = async (requestId, uid, amount) => {
    const userCoinRef = ref(database, `users/${uid}/coins`);
    let success = false;
    
    try {
        await runTransaction(userCoinRef, (currentCoins) => {
            return (currentCoins || 0) + amount; 
        });
        success = true;
    } catch (error) {
        console.error("Deposit transaction failed:", error);
        alert(`Failed to approve deposit for user ${uid}.`);
        return;
    }

    if (success) {
        await remove(ref(database, `admin_requests/pending_deposits/${requestId}`));
        await remove(ref(database, `users/${uid}/pendingDeposit`));
        // 🔥 NEW: Remove centralized pending status
        await remove(ref(database, `users/${uid}/pendingRequestStatus`)); 
        
        alert(`Deposit of ${amount} coins approved for ${uid}.`);
        listenForRequests(); // Refresh list
    }
};

// Withdrawal Approval - STEP 1: Show Payment Modal (No Change)
const approveWithdrawalHandler = (key, data) => {
    const withdrawalData = {
        requestId: key,
        uid: data.uid,
        amount: data.amount,
        userWithdrawalUpi: data.userWithdrawalUpi
    };
    // Agar UPI ID missing hai to check karein
    if (!withdrawalData.userWithdrawalUpi) {
        alert("❌ Error: Withdrawal UPI ID is missing in the request data. Please reject or ask the user to resubmit.");
        return;
    }
    showPaymentModal(withdrawalData);
};


// Withdrawal Approval - STEP 2: Final Database Confirmation (🔥 MODIFIED: Added removal of centralized pending status)
const confirmWithdrawalTransaction = async (requestId, uid, amount) => {
    hidePaymentModal(); // Hide modal immediately
    
    // 1. User के coins को atomically घटाएँ
    const userCoinRef = ref(database, `users/${uid}/coins`);
    let success = false;
    
    try {
        await runTransaction(userCoinRef, (currentCoins) => {
            if ((currentCoins || 0) >= amount) {
                success = true; 
                return currentCoins - amount; 
            }
            return currentCoins; 
        });
        
    } catch (error) {
        console.error("Withdrawal transaction failed:", error);
        alert(`Failed to confirm withdrawal for user ${uid}.`);
        return;
    }

    if (success) {
        // 2. Admin queue से रिक्वेस्ट हटाएँ
        await remove(ref(database, `admin_requests/pending_withdrawals/${requestId}`));
        // 3. User की pending request flag को हटाएँ
        await remove(ref(database, `users/${uid}/pendingWithdrawal`));
        // 🔥 NEW: Remove centralized pending status
        await remove(ref(database, `users/${uid}/pendingRequestStatus`)); 
        
        alert(`Final confirmation done. Withdrawal of ${amount} coins approved and funds sent to ${currentWithdrawalData.userWithdrawalUpi}.`);
        listenForRequests(); // Refresh list
    } else {
        alert(`Final confirmation FAILED for ${uid}. Insufficient funds detected. Please REJECT the request.`);
    }
};

// Function to handle Rejection (works for both deposit and withdrawal - 🔥 MODIFIED: Added removal of centralized pending status)
const rejectRequest = async (requestId, uid, type) => {
    const adminPath = type === 'Deposit' ? 'pending_deposits' : 'pending_withdrawals';
    const userFlag = type === 'Deposit' ? 'pendingDeposit' : 'pendingWithdrawal';
    
    await remove(ref(database, `admin_requests/${adminPath}/${requestId}`));
    await remove(ref(database, `users/${uid}/${userFlag}`));
    // 🔥 NEW: Remove centralized pending status
    await remove(ref(database, `users/${uid}/pendingRequestStatus`)); 
    
    alert(`❌ Request ${requestId} rejected and removed.`);
    listenForRequests(); // Refresh list
};


// ==========================================================
// UI RENDERING (No Change)
// ==========================================================

const createRequestItem = (key, data, type) => {
    // ... (rest of the createRequestItem logic)
    const listItem = document.createElement('li');
    listItem.className = `request-item ${type.toLowerCase()}`;
    listItem.innerHTML = `
        <div class="request-info">
            <p><strong>User:</strong> ${data.email}</p>
            <p><strong>Amount:</strong> ${data.amount} Coins</p>
            ${type === 'Deposit' ? `<p class="deposit-utr">UTR: ${data.transactionId}</p>` : `<p><strong>UPI ID:</strong> ${data.userWithdrawalUpi}</p>`}
        </div>
        <div class="action-buttons">
            <button class="approve-btn" data-type="${type}" data-key="${key}" data-uid="${data.uid}" data-amount="${data.amount}">Approve</button>
            <button class="reject-btn" data-type="${type}" data-key="${key}" data-uid="${data.uid}">Reject</button>
        </div>
    `;

    // Event listeners
    listItem.querySelector('.approve-btn').onclick = (e) => {
        const key = e.target.getAttribute('data-key');
        const uid = e.target.getAttribute('data-uid');
        const amount = parseInt(e.target.getAttribute('data-amount'));
        const type = e.target.getAttribute('data-type');

        if (type === 'Deposit') {
            if (confirm(`Confirm deposit of ${amount} coins for ${data.email}?`)) {
                approveDeposit(key, uid, amount);
            }
        } else { // Withdrawal
            approveWithdrawalHandler(key, data); // Show modal first
        }
    };

    listItem.querySelector('.reject-btn').onclick = (e) => {
        const key = e.target.getAttribute('data-key');
        const uid = e.target.getAttribute('data-uid');
        const type = e.target.getAttribute('data-type');
        
        if (confirm(`Are you sure you want to REJECT this ${type} request from ${data.email}?`)) {
            rejectRequest(key, uid, type);
        }
    };
    
    return listItem;
};

// Function to listen for pending requests (No Change)
const listenForRequests = () => {
    // Clear lists first
    depositRequestsList.innerHTML = '';
    withdrawalRequestsList.innerHTML = '';
    noRequestsDiv.style.display = 'block';

    let depositCount = 0;
    let withdrawalCount = 0;

    // Listen for pending deposits
    onValue(ref(database, 'admin_requests/pending_deposits'), (snapshot) => {
        depositRequestsList.innerHTML = '';
        depositCount = 0;
        
        snapshot.forEach((childSnapshot) => {
            const key = childSnapshot.key;
            const data = childSnapshot.val();
            depositRequestsList.appendChild(createRequestItem(key, data, 'Deposit'));
            depositCount++;
        });

        // Update overall visibility
        updateNoRequestsDisplay(depositCount, withdrawalCount);
    });

    // Listen for pending withdrawals
    onValue(ref(database, 'admin_requests/pending_withdrawals'), (snapshot) => {
        withdrawalRequestsList.innerHTML = '';
        withdrawalCount = 0;

        snapshot.forEach((childSnapshot) => {
            const key = childSnapshot.key;
            const data = childSnapshot.val();
            withdrawalRequestsList.appendChild(createRequestItem(key, data, 'Withdrawal'));
            withdrawalCount++;
        });

        // Update overall visibility
        updateNoRequestsDisplay(depositCount, withdrawalCount);
    });
};

const updateNoRequestsDisplay = (depCount, witCount) => {
    if (depCount > 0 || witCount > 0) {
        noRequestsDiv.style.display = 'none';
    } else {
        noRequestsDiv.style.display = 'block';
    }
}

// Logout Handler (No Change)
adminLogoutBtn.onclick = () => {
    signOut(auth).then(() => {
        location.href = "index.html";
    }).catch((error) => {
        console.error("Logout Failed:", error);
    });
};

// Event listener for the modal cancel button (No Change)
cancelModalBtn.onclick = hidePaymentModal;

// Final confirmation button handler (No Change)
finalConfirmBtn.onclick = () => {
    if (currentWithdrawalData) {
        // Confirmation prompt
        if (confirm(`Are you absolutely sure you have SENT ${currentWithdrawalData.amount} coins (as money) to UPI ID: ${currentWithdrawalData.userWithdrawalUpi}? \n\nThis action will deduct coins from the user and clear the request. This action cannot be undone.`)) {
            confirmWithdrawalTransaction(currentWithdrawalData.requestId, currentWithdrawalData.uid, currentWithdrawalData.amount);
        }
    }
};


/* AUTH & INITIALIZATION */
onAuthStateChanged(auth, (u) => {
    if (!u) {
        location.href = "index.html"; 
        return;
    }
    
    currentAdminUID = u.uid;
    
    // SECURITY CHECK: Only allow the designated admin UID (No Change)
    if (currentAdminUID !== ADMIN_UID) {
        alert("Access Denied: You are not the administrator.");
        location.href = "welcome.html"; 
        return;
    }
    
    // Admin login successful (No Change)
    adminUserEmail.innerText = u.email;
    listenForRequests(); // Start listening for requests
});
