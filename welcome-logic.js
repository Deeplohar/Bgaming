// welcome-logic.js - COMPLETE REPLACEMENT WITH SEPARATE HISTORY
// ✅ HISTORY MOVED TO GameHistory NODE

import { auth, database } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.1.0/firebase-auth.js";
import { ref, get, set, onValue, runTransaction, serverTimestamp, push } from "https://www.gstatic.com/firebasejs/9.1.0/firebase-database.js";

/* ELEMENTS */
const userEmail = document.getElementById("userEmail");
const userCoinsSpan = document.getElementById("userCoins");
const gameTimer = document.getElementById("gameTimer");
const currentWinningNumP = document.getElementById("currentWinningNum"); 
const numberSelection = document.getElementById("numberSelection");
const playBtn = document.getElementById("playBtn");
const resultText = document.getElementById("result");
const betSummaryDiv = document.getElementById("betSummary"); 
const logoutBtn = document.getElementById("logoutBtn");

// Sidebar Elements
const sidebarMenu = document.getElementById("sidebarMenu"); 
const menuToggle = document.getElementById("menuToggle"); 
const sidebarUserEmail = document.getElementById("sidebarUserEmail");

/* VARIABLES */
let uid = null;
let coins = 0;
let selectedBets = {}; 
let nextTime = 0;
let timerInt = null;
let betAlreadyPlaced = false; 
let lastWinningNumber = '--';

/* TIME FORMAT */
const formatTime = (s) => {
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${String(m).padStart(2,"0")}:${String(r).padStart(2,"0")}`;
};

// ==========================================================
// ✅ NEW: SAVE ROUND TO SEPARATE GameHistory NODE
// ==========================================================
const saveRoundToHistory = async (winningNumber) => {
    try {
        console.log(`💾 Saving to GameHistory: ${winningNumber}`);
        
        // 1. Get current GameHistory to find max round number
        const historyRef = ref(database, 'GameHistory');
        const historySnap = await get(historyRef);
        
        let maxRoundNumber = 0;

        if (historySnap.exists()) {
            const historyData = historySnap.val();
            
            // Find highest round number
            Object.values(historyData).forEach(entry => {
                if (entry.roundNumber && entry.roundNumber > maxRoundNumber) {
                    maxRoundNumber = entry.roundNumber;
                }
            });
        }
        
        // 2. New round number
        const newRoundNumber = maxRoundNumber + 1;
        
        // 3. Create new entry in GameHistory
        const newEntryRef = push(historyRef);
        const roundId = newEntryRef.key;

        const newEntry = {
            winningNumber: winningNumber,
            timestamp: serverTimestamp(),
            roundEndTime: Date.now(),
            roundNumber: newRoundNumber
        };
        
        // 4. Save to GameHistory
        await set(newEntryRef, newEntry);
        
        // 5. Trim to last 100 entries
        await trimHistoryTo100();
        
        console.log(`✅ Round #${newRoundNumber} saved to GameHistory`);

    } catch (error) {
        console.error("❌ Error saving to GameHistory:", error);
    }
};

// Helper function to trim GameHistory to 100 entries
const trimHistoryTo100 = async () => {
    try {
        const historyRef = ref(database, 'GameHistory');
        const snapshot = await get(historyRef);
        
        if (!snapshot.exists()) return;
        
        let historyData = snapshot.val();
        const entries = Object.entries(historyData);
        
        if (entries.length <= 100) return;
        
        // Sort by roundNumber (oldest first)
        const sortedEntries = entries.sort((a, b) => {
            return (a[1].roundNumber || 0) - (b[1].roundNumber || 0);
        });
        
        // Keep only last 100 entries (newest)
        const entriesToKeep = sortedEntries.slice(-100);
        const trimmedHistory = Object.fromEntries(entriesToKeep);
        
        // Save back
        await set(historyRef, trimmedHistory);
        
        console.log(`🧹 Trimmed GameHistory to 100 entries`);
        
    } catch (error) {
        console.error("Error trimming history:", error);
    }
};

// ==========================================================
// CORE GAME LOGIC
// ==========================================================

const findLeastStakedNumber = async () => {
    const snapTally = await get(ref(database, 'GameInfo/currentTally'));
    const tallyData = snapTally.val();

    if (!tallyData) {
        return Math.floor(Math.random() * 10);
    }
    
    let minBetAmount = Infinity;
    let winningNumberCandidates = [];

    for (let i = 0; i <= 9; i++) {
        const numStr = String(i);
        const betAmount = tallyData[numStr] || 0; 
        
        if (betAmount < minBetAmount) {
            minBetAmount = betAmount;
            winningNumberCandidates = [i]; 
        } else if (betAmount === minBetAmount) {
            winningNumberCandidates.push(i);
        }
    }

    if (winningNumberCandidates.length > 0) {
        const randomIndex = Math.floor(Math.random() * winningNumberCandidates.length);
        return winningNumberCandidates[randomIndex];
    }

    return Math.floor(Math.random() * 10);
};

const ensureGameExists = async () => {
    const refGame = ref(database, "GameInfo");

    const newWinningNumber = await findLeastStakedNumber(); 

    await runTransaction(refGame, (data) => {
        const now = Date.now();
        const fiveMinutesInMs = 5 * 60 * 1000; 

        if (data === null || (data.NextUpdateTime && now >= data.NextUpdateTime)) {
            // Get the just-ended result
            const oldWinningNumber = data ? data.WinningNumber : '--'; 
            
            // Update the local variable
            lastWinningNumber = oldWinningNumber; 
            
            return {
                NextUpdateTime: now + fiveMinutesInMs,
                WinningNumber: newWinningNumber,
                LastWinningNumber: oldWinningNumber,
                LastUpdated: now
                // ❌ NO history here anymore - it's in separate GameHistory
            };
        }
        return data; 
    });
    
    await set(ref(database, 'GameInfo/currentTally'), null); 
};

const syncGameInfo = () => {
    const refGame = ref(database, "GameInfo");

    onValue(refGame, (snapshot) => {
        const data = snapshot.val();
        
        if (data && data.NextUpdateTime !== undefined) {
            nextTime = data.NextUpdateTime;
            lastWinningNumber = data.LastWinningNumber || lastWinningNumber; 
            
            currentWinningNumP.innerText = `Latest Winning Number: ${lastWinningNumber}`;

            if (timerInt) clearInterval(timerInt);
            startTimer();

            if (Date.now() >= nextTime && uid) {
                 ensureGameExists();
            }

        } else if (uid) {
            ensureGameExists();
        }
    });
};

const startTimer = () => {
    timerInt = setInterval(() => {
        const now = Date.now();
        const timeLeftSec = Math.floor((nextTime - now) / 1000);

        if (timeLeftSec <= 0) {
            gameTimer.innerText = "00:00";
            resultText.innerText = "Bets are closed. Calculating results..."; 
            playBtn.disabled = false;
            playBtn.innerText = "START NEXT ROUND";
            clearInterval(timerInt);
            
            if (uid) {
                calculateWinnings(); 
            }
            
            ensureGameExists(); 

        } else {
            gameTimer.innerText = formatTime(timeLeftSec);
            updatePlayButtonState(); 
        }
    }, 1000);
};

const calculateWinnings = async () => {
    betAlreadyPlaced = false; 

    // Fetch winning number
    const snapResult = await get(ref(database, 'GameInfo/WinningNumber'));
    const winningNum = snapResult.val();
    
    if (winningNum === null) {
        resultText.innerHTML = "Error: Could not retrieve winning number.";
        return;
    }
    
    // ✅ SAVE TO SEPARATE GameHistory NODE
    await saveRoundToHistory(winningNum);
    
    const snapBet = await get(ref(database, `users/${uid}/currentBet`));
    const currentBet = snapBet.val();
    
    lastWinningNumber = winningNum; 

    if (!currentBet) {
        resultText.innerHTML = "No bet placed in the last round.";
        return; 
    }

    let totalWinnings = 0;
    let totalWagered = 0;
    
    for (const numStr in currentBet) {
        const bet = currentBet[numStr];
        const num = parseInt(numStr);
        totalWagered += bet;

        if (num === winningNum) { 
            totalWinnings += bet * 10; 
        }
    }
    
    const netChange = totalWinnings - totalWagered; 
    
    coins += totalWinnings; 
    await set(ref(database, `users/${uid}/coins`), coins);
    userCoinsSpan.innerText = coins;

    // Clear bet from DB
    await set(ref(database, `users/${uid}/currentBet`), null);
    
    // Clear browser memory
    selectedBets = {};       
    renderBetSummary();      
    
    if (netChange > 0) {
        resultText.innerHTML = `🎉 **YOU WON!** Winning number was **${winningNum}**. Net gain: ${netChange} coins!`;
        resultText.style.color = 'green';
    } else {
        resultText.innerHTML = `❌ **YOU LOST!** Winning number was **${winningNum}**. Net loss: ${Math.abs(netChange)} coins.`;
        resultText.style.color = 'red';
    }

    document.querySelectorAll(".num-container button").forEach(b => {
        b.disabled = false;
        b.classList.remove("selected");
    });
    document.querySelectorAll(".bet-input").forEach(i => {
        i.disabled = true;
        i.value = "";
    });
    updatePlayButtonState(); 
};

const restorePlacedBetUI = (currentBetData) => {
    betAlreadyPlaced = true;
    selectedBets = currentBetData;

    document.querySelectorAll(".num-container button").forEach(b => {
        const num = b.dataset.number;
        const inp = document.querySelector(`.bet-input[data-number="${num}"]`);
        
        b.disabled = true; 
        
        if (selectedBets[num] !== undefined) {
            b.classList.add("selected");
            inp.value = selectedBets[num];
        }
        inp.disabled = true; 
    });
    
    const totalBet = Object.values(currentBetData).reduce((sum, bet) => sum + bet, 0);
    playBtn.disabled = true;
    playBtn.innerText = "BET PLACED. WAIT FOR RESULT.";
    
    resultText.innerHTML = `✅ **Bet Placed Successfully!** ${totalBet} coins deducted. Waiting for the timer to end...`;
    resultText.style.color = 'green';
    
    currentWinningNumP.innerText = `Latest Winning Number: ${lastWinningNumber}`; 
    
    renderBetSummary(); 
};

const renderBetSummary = () => {
    let summaryHTML = '';
    const betEntries = Object.entries(selectedBets).filter(([num, bet]) => bet > 0);
    
    if (betEntries.length === 0) {
        betSummaryDiv.innerHTML = '<p style="color: #6c757d; font-style: italic; margin-top: 10px;">No bets placed yet.</p>';
        return;
    }

    summaryHTML += '<h4 style="margin-bottom: 5px; color: #333;">Your Active Bets:</h4>';
    summaryHTML += '<div style="max-height: 100px; overflow-y: auto; border: 1px solid #eee; padding: 10px; border-radius: 4px; background: #fafafa;">';
    
    betEntries.forEach(([number, betAmount]) => {
        summaryHTML += `<p style="margin: 3px 0; font-size: 14px; text-align: left;">
            <span style="font-weight: bold; color: #007bff;">Number ${number}:</span> 
            <span style="color: #28a745; font-weight: bold;">${betAmount} Coins</span>
        </p>`;
    });

    summaryHTML += '</div>';
    betSummaryDiv.innerHTML = summaryHTML;
};

const updatePlayButtonState = () => {
    if (betAlreadyPlaced) return; 

    const totalBet = Object.values(selectedBets).reduce((sum, bet) => sum + bet, 0);
    const bettingOpen = gameTimer.innerText !== "00:00";
    
    if (bettingOpen && totalBet > 0 && totalBet <= coins) {
        playBtn.disabled = false;
        playBtn.innerText = `Place Bet & Play (Total Bet: ${totalBet})`;
        resultText.style.color = 'black';
        resultText.innerText = "Betting is Open. Click to Play!";
    } else if (!bettingOpen) {
        playBtn.disabled = true;
        playBtn.innerText = "BETTING CLOSED";
    }
    else {
        playBtn.disabled = true;
        playBtn.innerText = `Place Bet & Play`;
        if (totalBet > coins) {
            resultText.innerText = "Insufficient fund!";
            resultText.style.color = 'red';
        } else {
            resultText.innerText = "Select atleast one number and place a bet।";
            resultText.style.color = 'black';
        }
    }
    
    renderBetSummary(); 
};

const setupGameSelection = () => {
    numberSelection.innerHTML = '';
    
    for (let i = 0; i < 10; i++) {
        const d = document.createElement("div");
        d.className = 'num-container';
        d.innerHTML = `
            <button class="num-button" data-number="${i}">${i}</button>
            <input type="number" class="bet-input" data-number="${i}" min="0" placeholder="Bet Coin" disabled>
        `;
        numberSelection.appendChild(d);
    }
    
    document.querySelectorAll(".num-button").forEach(b => {
        b.onclick = () => {
            if (betAlreadyPlaced) return;
            
            const num = b.dataset.number;
            const inp = document.querySelector(`.bet-input[data-number="${num}"]`);
            b.classList.toggle("selected");
            inp.disabled = !b.classList.contains("selected");
            if (b.classList.contains("selected")) {
                inp.value = 10;
                selectedBets[num] = 10;
            } else {
                delete selectedBets[num];
                inp.value = "";
            }
            updatePlayButtonState();
        };
    });

    document.querySelectorAll('.bet-input').forEach(input => {
        input.addEventListener('input', (e) => {
            if(betAlreadyPlaced || (playBtn.disabled && gameTimer.innerText === "00:00")) return; 
            
            const num = e.target.dataset.number;
            let bet = parseInt(e.target.value) || 0;
            if (bet < 0) {
                bet = 0;
                e.target.value = 0;
            }
            if (bet > 0) {
                selectedBets[num] = bet;
            } else {
                delete selectedBets[num];
            }
            updatePlayButtonState();
        });
    });
    
    renderBetSummary(); 
};

/* PLAY BUTTON LOGIC */
playBtn.addEventListener("click", async () => {
    if (playBtn.innerText === "START NEXT ROUND") {
        window.location.reload();
        return; 
    }
    
    if (playBtn.disabled || gameTimer.innerText === "00:00" || betAlreadyPlaced) {
        resultText.innerHTML = "Betting is closed or a bet is already placed.";
        resultText.style.color = 'orange';
        return;
    }

    const totalBet = Object.values(selectedBets).reduce((sum, bet) => sum + bet, 0);
    
    betAlreadyPlaced = true;

    // 1. Save current bet
    await set(ref(database, `users/${uid}/currentBet`), selectedBets);

    // 2. Update public tally
    const transactionPromises = Object.entries(selectedBets).map(([number, amount]) => {
        const tallyRef = ref(database, `GameInfo/currentTally/${number}`);
        return runTransaction(tallyRef, (currentValue) => {
            return (currentValue || 0) + amount; 
        });
    });

    await Promise.all(transactionPromises);

    // 3. Deduct coins
    coins -= totalBet;
    await set(ref(database, `users/${uid}/coins`), coins);
    userCoinsSpan.innerText = coins;

    // 4. Update UI
    resultText.innerHTML = `✅ **Bet Placed Successfully!** ${totalBet} coins deducted. Waiting for the timer to end...`;
    resultText.style.color = 'green';

    document.querySelectorAll(".num-container button").forEach(b => {
        b.disabled = true;
    });
    document.querySelectorAll(".bet-input").forEach(i => {
        i.disabled = true;
    });
    playBtn.disabled = true;
    playBtn.innerText = "BET PLACED. WAIT FOR RESULT.";

    renderBetSummary(); 
});

/* AUTH & INITIALIZATION */
onAuthStateChanged(auth, async (u) => {
    if (!u) {
        location.href = "index.html"; 
        return;
    }
    uid = u.uid;
    userEmail.innerText = "Welcome " + (u.displayName || u.email);
    sidebarUserEmail.innerText = u.displayName || u.email;
    
    // Load user data
    const userRef = ref(database, `users/${uid}/coins`);
    const snap = await get(userRef);
    
    coins = snap.exists() ? snap.val() : 0;
    if (!snap.exists()) await set(userRef, coins);
    
    userCoinsSpan.innerText = coins;

    // Load last winning number
    const snapGameInfo = await get(ref(database, `GameInfo`));
    if (snapGameInfo.exists() && snapGameInfo.val().LastWinningNumber !== undefined) {
         lastWinningNumber = snapGameInfo.val().LastWinningNumber;
    }
    
    // Initialize UI
    setupGameSelection();

    // Check for existing bet
    const snapBet = await get(ref(database, `users/${uid}/currentBet`));
    if (snapBet.exists() && snapBet.val()) {
        restorePlacedBetUI(snapBet.val());
    } else {
         selectedBets = {}; 
    }

    // Start game sync
    syncGameInfo(); 
});

/* ======================================= */
/* SIDEBAR & LOGOUT HANDLERS */
/* ======================================= */

// SIDEBAR TOGGLE
if (menuToggle && sidebarMenu) {
    menuToggle.onclick = () => {
        sidebarMenu.classList.toggle("open");
    };
}

// LOGOUT
const handleLogout = async () => {
    await signOut(auth);
    location.href = "index.html";
};

logoutBtn.onclick = handleLogout;