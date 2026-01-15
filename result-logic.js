// result-logic.js - UPDATED FOR SEPARATE GameHistory NODE
// ✅ NOW LOADS FROM GameHistory INSTEAD OF GameInfo/history

import { auth, database } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.1.0/firebase-auth.js";
import { ref, get, onValue } from "https://www.gstatic.com/firebasejs/9.1.0/firebase-database.js";

/* ELEMENTS */
const userEmail = document.getElementById("userEmail");
const gameTimer = document.getElementById("gameTimer");
const currentWinningNumP = document.getElementById("currentWinningNum");
const gameStatusText = document.getElementById("gameStatusText");
const resultsList = document.getElementById("resultsList");
const statsGrid = document.getElementById("statsGrid");
const filterButtons = document.querySelectorAll(".filter-btn");

/* VARIABLES */
let uid = null;
let resultsHistory = [];
let timerInterval = null;
let nextTime = 0;

/* TIME FORMAT */
const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

/* DATE FORMAT */
const formatDateTime = (timestamp) => {
    if (!timestamp) return "Unknown";
    
    let date;
    if (timestamp && timestamp.seconds) {
        date = new Date(timestamp.seconds * 1000);
    } else if (typeof timestamp === 'number') {
        date = new Date(timestamp);
    } else {
        return "Invalid date";
    }
    
    return date.toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    });
};

/* 📊 LOAD HISTORY FROM GameHistory NODE */
const loadWinningHistory = async () => {
    console.log("📥 Loading from GameHistory node...");
    
    try {
        // ✅ CHANGED: Now reading from GameHistory instead of GameInfo/history
        const historyRef = ref(database, 'GameHistory');
        const snapshot = await get(historyRef);
        
        if (snapshot.exists()) {
            const historyData = snapshot.val();
            const totalEntries = Object.keys(historyData).length;
            
            console.log(`📊 Found ${totalEntries} entries in GameHistory`);
            
            // Convert to array
            resultsHistory = Object.entries(historyData)
                .map(([key, entry]) => {
                    // Extract timestamp
                    let timestamp;
                    if (entry.timestamp && entry.timestamp.seconds) {
                        timestamp = entry.timestamp.seconds * 1000;
                    } else if (entry.timestamp) {
                        timestamp = entry.timestamp;
                    } else if (entry.roundEndTime) {
                        timestamp = entry.roundEndTime;
                    } else {
                        timestamp = Date.now();
                    }
                    
                    // Extract winning number
                    const winningNumber = entry.winningNumber !== undefined ? 
                        parseInt(entry.winningNumber) : null;
                    
                    if (winningNumber === null) {
                        console.warn(`Invalid entry ${key}:`, entry);
                        return null;
                    }
                    
                    return {
                        id: key,
                        winningNumber: winningNumber,
                        timestamp: timestamp,
                        roundNumber: entry.roundNumber || 0,
                        rawData: entry
                    };
                })
                .filter(entry => entry !== null)
                .sort((a, b) => b.roundNumber - a.roundNumber); // Newest first (by roundNumber)
            
            console.log(`✅ Loaded ${resultsHistory.length} entries from GameHistory`);
            
            if (resultsHistory.length > 0) {
                renderResults('all');
                updateStats();
            } else {
                showNoResultsMessage();
            }
        } else {
            showNoHistoryMessage();
        }
    } catch (error) {
        showErrorMessage(error);
    }
};

/* 🎨 RENDER RESULTS */
const renderResults = (filterType) => {
    console.log(`🎨 Rendering with filter: ${filterType}`);
    
    let filteredResults = [...resultsHistory];
    
    // Apply filters
    switch(filterType) {
        case 'last-10':
            filteredResults = filteredResults.slice(0, 10);
            break;
        case 'last-50':
            filteredResults = filteredResults.slice(0, 50);
            break;
        case 'today':
            const today = new Date().setHours(0, 0, 0, 0);
            filteredResults = filteredResults.filter(result => {
                return result.timestamp >= today;
            });
            break;
        case 'all':
        default:
            // Show all (max 100)
            filteredResults = filteredResults.slice(0, 100);
    }
    
    if (filteredResults.length === 0) {
        resultsList.innerHTML = '<div class="no-results">No results found for selected filter.</div>';
        return;
    }
    
    // Render results
    resultsList.innerHTML = filteredResults.map((result) => {
        const displayNumber = result.roundNumber || '--';
        const winningNumber = result.winningNumber;
        const time = formatDateTime(result.timestamp);
        
        // Color codes for numbers
        const numberColors = {
            0: '#FF6B6B', 1: '#4ECDC4', 2: '#FFD166', 3: '#06D6A0',
            4: '#118AB2', 5: '#073B4C', 6: '#EF476F', 7: '#7209B7',
            8: '#3A86FF', 9: '#FB5607'
        };
        
        const bgColor = numberColors[winningNumber] || '#666';
        
        return `
            <div class="result-item">
                <div class="col-round">#${displayNumber}</div>
                <div class="col-time">${time}</div>
                <div class="col-number">
                    <span class="number-badge" style="background: ${bgColor}; color: white; width: 35px; height: 35px; line-height: 35px; border-radius: 50%; display: inline-block; font-weight: bold;">
                        ${winningNumber}
                    </span>
                </div>
                <div class="col-result">📊</div>
            </div>
        `;
    }).join('');
    
    // Add summary
    addResultsSummary(filteredResults.length, filterType);
};

/* 📊 UPDATE STATISTICS */
const updateStats = () => {
    if (resultsHistory.length === 0) {
        statsGrid.innerHTML = `
            <div style="grid-column: span 5; text-align: center; padding: 20px;">
                <p>📊 No statistics available</p>
                <p style="font-size: 12px; color: #999;">Play some rounds first!</p>
            </div>
        `;
        return;
    }
    
    // Count frequency
    const frequency = Array(10).fill(0);
    resultsHistory.forEach(result => {
        const num = result.winningNumber;
        if (num >= 0 && num <= 9) {
            frequency[num]++;
        }
    });
    
    const totalRounds = resultsHistory.length;
    const maxFreq = Math.max(...frequency);
    const minFreq = Math.min(...frequency.filter(f => f > 0));
    const mostFrequent = frequency.indexOf(maxFreq);
    const leastFrequent = frequency.indexOf(minFreq);
    
    // Recent frequency (last 20)
    const recentFrequency = Array(10).fill(0);
    resultsHistory.slice(0, 20).forEach(result => {
        const num = result.winningNumber;
        if (num >= 0 && num <= 9) {
            recentFrequency[num]++;
        }
    });
    const recentMostFrequent = recentFrequency.indexOf(Math.max(...recentFrequency));
    
    statsGrid.innerHTML = `
        <div class="stat-item">
            <span class="stat-number">${totalRounds}</span>
            <span class="stat-label">Total Rounds</span>
        </div>
        <div class="stat-item">
            <span class="stat-number" style="color: #FF6B6B;">${mostFrequent}</span>
            <span class="stat-label">Most Frequent</span>
        </div>
        <div class="stat-item">
            <span class="stat-number" style="color: #4ECDC4;">${leastFrequent}</span>
            <span class="stat-label">Least Frequent</span>
        </div>
        <div class="stat-item">
            <span class="stat-number" style="color: #FFD166;">${recentMostFrequent}</span>
            <span class="stat-label">Recent Most</span>
        </div>
        <div class="stat-item">
            <span class="stat-number">${totalRounds}/100</span>
            <span class="stat-label">History Saved</span>
        </div>
    `;
};

/* ⏰ GAME TIMER SYNC */
const syncGameTimer = () => {
    // ✅ Still reading live game state from GameInfo
    const gameRef = ref(database, "GameInfo");
    
    onValue(gameRef, (snapshot) => {
        const data = snapshot.val();
        
        if (data && data.NextUpdateTime !== undefined) {
            nextTime = data.NextUpdateTime;
            const lastWinningNumber = data.LastWinningNumber || '--';
            
            // Update UI
            currentWinningNumP.textContent = lastWinningNumber;
            
            // Start timer
            if (timerInterval) clearInterval(timerInterval);
            startTimer();
            
            // Update status
            updateGameStatus();
        }
    });
};

/* 🕐 START TIMER */
const startTimer = () => {
    timerInterval = setInterval(() => {
        const now = Date.now();
        const timeLeftSec = Math.floor((nextTime - now) / 1000);
        
        if (timeLeftSec <= 0) {
            gameTimer.textContent = "00:00";
            gameStatusText.textContent = "⏳ Calculating results...";
            gameStatusText.style.color = '#ff9800';
            clearInterval(timerInterval);
            
            // Auto-refresh after 3 seconds
            setTimeout(() => {
                loadWinningHistory();
                syncGameTimer();
            }, 3000);
            
        } else {
            gameTimer.textContent = formatTime(timeLeftSec);
            updateGameStatus();
        }
    }, 1000);
};

/* 🎮 UPDATE GAME STATUS */
const updateGameStatus = () => {
    const timeLeft = Math.floor((nextTime - Date.now()) / 1000);
    
    if (timeLeft > 0) {
        gameStatusText.textContent = `Next result in ${formatTime(timeLeft)}`;
        gameStatusText.style.color = '#00796b';
    } else {
        gameStatusText.textContent = "⏳ Round ended. Calculating...";
        gameStatusText.style.color = '#ff9800';
    }
};

/* 📝 ADD RESULTS SUMMARY */
const addResultsSummary = (filteredCount = null, filterType = 'all') => {
    const summary = document.createElement('div');
    summary.className = 'results-summary';
    
    const showingCount = filteredCount || resultsHistory.length;
    const totalCount = resultsHistory.length;
    
    summary.innerHTML = `
        <div style="padding: 10px; background: #f5f5f5; border-radius: 4px; margin-top: 10px; font-size: 14px;">
            <div style="display: flex; justify-content: space-between;">
                <span style="font-weight: bold; color: #00796b;">
                    Showing ${showingCount} results
                </span>
                <span style="color: #666;">
                    Total: ${totalCount} | Limit: 100
                </span>
            </div>
            ${filterType !== 'all' ? 
                `<div style="margin-top: 5px; color: #666; font-size: 12px;">
                    Filter: ${filterType} | 
                    <button onclick="applyFilter('all')" style="background: none; border: none; color: #00796b; cursor: pointer; text-decoration: underline;">
                        Show All
                    </button>
                </div>` 
                : ''
            }
        </div>
    `;
    
    // Remove old summary
    const oldSummary = resultsList.querySelector('.results-summary');
    if (oldSummary) oldSummary.remove();
    
    resultsList.appendChild(summary);
};

/* 🎯 FILTER HANDLERS */
filterButtons.forEach(button => {
    button.addEventListener('click', () => {
        filterButtons.forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');
        
        const filterType = button.dataset.filter;
        renderResults(filterType);
    });
});

/* 🔄 SETUP REAL-TIME UPDATES */
const setupRealtimeHistory = () => {
    // ✅ CHANGED: Listen to GameHistory for real-time updates
    const historyRef = ref(database, 'GameHistory');
    
    onValue(historyRef, (snapshot) => {
        if (snapshot.exists()) {
            console.log("🔄 Real-time update from GameHistory");
            loadWinningHistory();
        }
    });
};

/* ❌ ERROR HANDLING */
const showNoResultsMessage = () => {
    resultsList.innerHTML = `
        <div style="text-align: center; padding: 30px;">
            <p>📭 No valid results found in GameHistory</p>
            <p style="font-size: 12px; color: #666;">
                Make sure rounds are being saved to GameHistory
            </p>
        </div>
    `;
};

const showNoHistoryMessage = () => {
    resultsList.innerHTML = `
        <div style="text-align: center; padding: 30px;">
            <p>📝 No game history yet</p>
            <p style="font-size: 12px; color: #666;">
                History will appear in GameHistory after rounds complete
            </p>
            <button onclick="loadWinningHistory()" style="margin-top: 15px; padding: 8px 15px; background: #00796b; color: white; border: none; border-radius: 4px; cursor: pointer;">
                🔄 Refresh
            </button>
        </div>
    `;
};

const showErrorMessage = (error) => {
    console.error("Error:", error);
    resultsList.innerHTML = `
        <div style="text-align: center; padding: 20px; background: #ffebee; border-radius: 6px; color: #c62828;">
            <p>❌ Error Loading Results from GameHistory</p>
            <p style="font-size: 12px;">${error.message}</p>
            <button onclick="location.reload()" style="margin-top: 10px; padding: 8px 15px;">
                Reload Page
            </button>
        </div>
    `;
};

/* 🚀 INITIALIZE PAGE */
onAuthStateChanged(auth, async (user) => {
    if (user) {
        uid = user.uid;
        userEmail.textContent = `Welcome ${user.displayName || user.email}`;
    } else {
        userEmail.textContent = "Guest User";
    }
    
    console.log("🚀 Initializing Results Page with SEPARATE GameHistory...");
    
    // Load history from GameHistory
    await loadWinningHistory();
    
    // Setup real-time updates from GameHistory
    setupRealtimeHistory();
    
    // Setup timer from GameInfo
    syncGameTimer();
    
    // Auto-refresh every 30 seconds
    setInterval(() => {
        loadWinningHistory();
    }, 30000);
    
    console.log("✅ Results page ready with separate GameHistory");
});

/* 🌐 GLOBAL FUNCTIONS FOR BUTTONS */
window.applyFilter = (filterType) => {
    renderResults(filterType);
    
    // Update active button
    filterButtons.forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.filter === filterType) {
            btn.classList.add('active');
        }
    });
};

/* 🔧 DEBUG FUNCTION */
window.debugHistory = () => {
    console.log("=== 🔍 DEBUG GameHistory ===");
    console.log("Total entries:", resultsHistory.length);
    console.log("Sample:", resultsHistory.slice(0, 3));
    
    // Check GameHistory directly
    get(ref(database, 'GameHistory')).then(snap => {
        if (snap.exists()) {
            const data = snap.val();
            console.log("GameHistory keys:", Object.keys(data).length);
            console.log("First entry:", Object.values(data)[0]);
        }
    });
};