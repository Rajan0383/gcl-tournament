// ============================================
// GCL FRONTEND APPLICATION - COMPLETE
// ============================================

const socket = io();
let matchState = null;
let teams = [];

// ============================================
// SOCKET EVENTS
// ============================================

socket.on('connect', () => {
    updateConnectionStatus(true);
    socket.emit('getState');
    socket.emit('getTeams');
    socket.emit('getFixtures');
    socket.emit('getTopStats');
    socket.emit('getPointsTable');
});

socket.on('disconnect', () => {
    updateConnectionStatus(false);
});

socket.on('stateUpdate', (state) => {
    matchState = state;
    updateScoreboard(state);
});

socket.on('scoreUpdate', (data) => {
    if (data.result && data.result.message) {
        showNotification(data.result.message, 
            data.result.isOut ? 'danger' : 
            data.result.isWide ? 'warning' : 'success'
        );
    }
    if (data.state) {
        matchState = data.state;
        updateScoreboard(data.state);
    }
});

socket.on('teamsList', (data) => {
    teams = data;
    updateTeamsList(data);
    updateTeamSelects(data);
});

socket.on('teamCreated', (team) => {
    showNotification(`✅ Team "${team.name}" created!`, 'success');
    socket.emit('getTeams');
});

socket.on('fixturesUpdate', (fixtures) => {
    updateFixtures(fixtures);
});

socket.on('pointsTable', (data) => {
    updatePointsTable(data);
});

socket.on('topStats', (data) => {
    updateTop10Players(data);
});

socket.on('notification', (message) => {
    showNotification(message, 'warning');
});

socket.on('error', (data) => {
    showNotification(`❌ ${data.message}`, 'danger');
});

// ============================================
// UI UPDATE FUNCTIONS
// ============================================

function updateConnectionStatus(online) {
    const statusDot = document.getElementById('connectionStatus');
    const statusText = document.getElementById('statusText');
    if (statusDot) {
        statusDot.className = `status-dot ${online ? 'online' : 'offline'}`;
    }
    if (statusText) {
        statusText.textContent = online ? 'Connected' : 'Disconnected';
    }
}

function updateScoreboard(state) {
    if (!state) return;

    const inningEl = document.querySelector('.inning-badge');
    if (inningEl) {
        inningEl.textContent = state.inning ? `Inning ${state.inning}` : 'Inning 1';
    }
    
    const overEl = document.querySelector('.over-info');
    if (overEl) {
        const ball = state.currentBall || 0;
        const over = state.currentOver || 1;
        overEl.textContent = `Over: ${over}.${ball} / ${state.totalOvers || 4}`;
    }

    const overTypes = {
        'lbw': '🔥 LBW Over',
        'normal': '⚡ Normal Over',
        'powerplay': '💥 POWERPLAY Over'
    };
    const overTypeEl = document.getElementById('overTypeDisplay');
    if (overTypeEl) overTypeEl.textContent = overTypes[state.overType] || 'LBW Over';

    // Batting Team
    if (state.battingTeam) {
        const battingName = document.getElementById('battingTeamName');
        const runs = document.getElementById('runsDisplay');
        const wickets = document.getElementById('wicketsDisplay');
        const balls = document.getElementById('ballsDisplay');
        const extras = document.getElementById('extrasDisplay');
        const batsman = document.getElementById('currentBatsman');
        
        if (battingName) battingName.textContent = state.battingTeam.name || 'Team 1';
        if (runs) runs.textContent = state.battingTeam.runs || 0;
        if (wickets) wickets.textContent = state.battingTeam.wickets || 0;
        if (balls) balls.textContent = state.battingTeam.balls || 0;
        if (extras) extras.textContent = state.battingTeam.extras || 0;
        if (batsman) batsman.textContent = state.battingTeam.currentBatsman || '-';
    }

    // Bowling Team
    if (state.bowlingTeam) {
        const bowlingName = document.getElementById('bowlingTeamName');
        const bowler = document.getElementById('currentBowler');
        
        if (bowlingName) bowlingName.textContent = state.bowlingTeam.name || 'Team 2';
        if (bowler) bowler.textContent = state.bowlingTeam.currentBowler || '-';
    }

    // Target
    const targetDisplay = document.getElementById('targetDisplay');
    if (targetDisplay) {
        if (state.target) {
            targetDisplay.textContent = `Target: ${state.target}`;
        } else {
            targetDisplay.textContent = '';
        }
    }

    // LBW Count
    const lbwCount = document.getElementById('lbwCount');
    const lbwDisplay = document.getElementById('lbwDisplay');
    if (lbwCount) lbwCount.textContent = state.lbwCount || 0;
    if (lbwDisplay) {
        if (state.overType === 'lbw') {
            lbwDisplay.style.display = 'block';
        } else {
            lbwDisplay.style.display = 'none';
        }
    }

    // Batsman Status
    const batsmanStatus = document.getElementById('batsmanStatus');
    if (batsmanStatus) {
        if (state.batsmanSet) {
            batsmanStatus.textContent = '✅ Set';
            batsmanStatus.style.color = '#4ade80';
        } else {
            batsmanStatus.textContent = '⏳ Waiting...';
            batsmanStatus.style.color = '';
        }
    }

    // Bowler Status
    const bowlerStatus = document.getElementById('bowlerStatus');
    if (bowlerStatus) {
        if (state.bowlerGuessed) {
            bowlerStatus.textContent = '✅ Guessed';
            bowlerStatus.style.color = '#4ade80';
        } else {
            bowlerStatus.textContent = '⏳ Waiting...';
            bowlerStatus.style.color = '';
        }
    }

    // Last Ball
    const lastBallDisplay = document.getElementById('lastBallDisplay');
    if (lastBallDisplay) {
        if (state.lastBallResult) {
            const result = state.lastBallResult;
            let displayText = '';
            if (result.isOut) {
                displayText = `🎯 OUT! ${result.message}`;
            } else if (result.isWide) {
                displayText = `📏 WIDE! ${result.runsScored} runs`;
            } else if (result.isNoBall) {
                displayText = `❌ NO-BALL! ${result.runsScored} runs`;
            } else if (result.isPowerplay) {
                displayText = `⚡ ${result.message}`;
            } else {
                displayText = `${result.runsScored} runs`;
            }
            lastBallDisplay.textContent = `Last Ball: ${displayText}`;
        } else {
            lastBallDisplay.textContent = 'Last Ball: -';
        }
    }

    // Strike Info (NEW)
    const strikerName = document.getElementById('strikerName');
    const nonStrikerName = document.getElementById('nonStrikerName');
    if (strikerName && state.striker) {
        strikerName.textContent = state.striker;
    }
    if (nonStrikerName && state.nonStriker) {
        nonStrikerName.textContent = state.nonStriker;
    }

    // Update allowed scores
    updateAllowedScores(state);
}

function updateAllowedScores(state) {
    const overType = state?.overType || 'lbw';
    let scores = [];
    
    if (overType === 'lbw') {
        scores = [2, 3, 4, 5, 6];
    } else if (overType === 'powerplay') {
        scores = [1, 2, 3, 4, 5, 6];
    } else {
        scores = [3, 4, 5, 6];
    }

    const batHint = document.getElementById('allowedBatScores');
    const bowlHint = document.getElementById('allowedBowlScores');
    if (batHint) batHint.textContent = `Allowed: ${scores.join(', ')}`;
    if (bowlHint) bowlHint.textContent = `Allowed: ${scores.join(', ')}`;
    
    const batScore = document.getElementById('batsmanScore');
    const bowlGuess = document.getElementById('bowlerGuess');
    if (batScore) {
        batScore.min = Math.min(...scores);
        batScore.max = Math.max(...scores);
    }
    if (bowlGuess) {
        bowlGuess.min = Math.min(...scores);
        bowlGuess.max = Math.max(...scores);
    }
}

function updateTeamsList(teams) {
    const container = document.getElementById('teamsList');
    if (!container) return;
    
    if (!teams || teams.length === 0) {
        container.innerHTML = '<p class="empty-message">No teams created yet. Go to Admin tab to create teams.</p>';
        return;
    }

    container.innerHTML = teams.map(team => `
        <div class="team-card">
            <div>
                <div class="team-name-card">🏏 ${team.name}</div>
                <div class="team-meta">
                    👔 Manager: ${team.manager} | 🧢 Captain: ${team.captain} | ⭐ RTM: ${team.rtmPlayer}
                </div>
                <div class="team-squad">
                    Squad: ${team.squad ? team.squad.join(', ') : 'Not set'}
                </div>
            </div>
            <div class="team-stats">
                <span class="stat">🎯 ${team.wins || 0}W</span>
                <span class="stat">📉 ${team.losses || 0}L</span>
                <span class="stat">⭐ ${team.points || 0}Pts</span>
            </div>
        </div>
    `).join('');
}

function updateTeamSelects(teams) {
    const options = teams.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
    
    const selects = ['team1Select', 'team2Select', 'fixtureTeam1', 'fixtureTeam2', 'winnerSelect'];
    selects.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            const currentValue = el.value;
            el.innerHTML = `<option value="">Select ${el.id.includes('winner') ? 'Winner' : 'Team'}</option>${options}`;
            if (currentValue) el.value = currentValue;
        }
    });
}

function updatePointsTable(pointsTable) {
    const tbody = document.getElementById('pointsTableBody');
    if (!tbody) return;
    
    if (!pointsTable || pointsTable.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-message">No data available</td></tr>';
        return;
    }

    tbody.innerHTML = pointsTable.map(team => {
        const rankClass = team.rank === 1 ? 'gold' : team.rank === 2 ? 'silver' : team.rank === 3 ? 'bronze' : '';
        return `
            <tr>
                <td class="rank ${rankClass}">#${team.rank}</td>
                <td><strong>${team.name}</strong></td>
                <td>${team.matches || 0}</td>
                <td class="wins">${team.wins || 0}</td>
                <td class="losses">${team.losses || 0}</td>
                <td class="points">${team.points || 0}</td>
                <td>${(team.netRunRate || 0).toFixed(3)}</td>
            </tr>
        `;
    }).join('');
}

function updateTop10Players(data) {
    // Batsmen
    const batsmenBody = document.getElementById('topBatsmenBody');
    if (batsmenBody) {
        if (data.batsmen && data.batsmen.length > 0) {
            batsmenBody.innerHTML = data.batsmen.slice(0, 10).map((player, index) => {
                const rankClass = index === 0 ? 'gold' : index === 1 ? 'silver' : index === 2 ? 'bronze' : '';
                return `
                    <tr>
                        <td class="rank ${rankClass}">#${index + 1}</td>
                        <td><strong>${player.name}</strong></td>
                        <td>${player.runs || 0}</td>
                        <td>${player.balls || 0}</td>
                        <td>${player.fours || 0}</td>
                        <td>${player.sixes || 0}</td>
                        <td>${(player.average || 0).toFixed(2)}</td>
                        <td>${(player.strikeRate || 0).toFixed(2)}</td>
                    </tr>
                `;
            }).join('');
        } else {
            batsmenBody.innerHTML = '<tr><td colspan="8" class="empty-message">No data available</td></tr>';
        }
    }

    // Bowlers
    const bowlersBody = document.getElementById('topBowlersBody');
    if (bowlersBody) {
        if (data.bowlers && data.bowlers.length > 0) {
            bowlersBody.innerHTML = data.bowlers.slice(0, 10).map((player, index) => {
                const rankClass = index === 0 ? 'gold' : index === 1 ? 'silver' : index === 2 ? 'bronze' : '';
                return `
                    <tr>
                        <td class="rank ${rankClass}">#${index + 1}</td>
                        <td><strong>${player.name}</strong></td>
                        <td>${player.wickets || 0}</td>
                        <td>${player.balls || 0}</td>
                        <td>${player.runsConceded || 0}</td>
                        <td>${(player.economy || 0).toFixed(2)}</td>
                        <td>${player.best || 0}</td>
                    </tr>
                `;
            }).join('');
        } else {
            bowlersBody.innerHTML = '<tr><td colspan="7" class="empty-message">No data available</td></tr>';
        }
    }

    // Man of the Match
    const momList = document.getElementById('momList');
    if (momList) {
        if (data.manOfMatch && data.manOfMatch.length > 0) {
            momList.innerHTML = data.manOfMatch.slice(0, 5).map((player, index) => {
                const rankClass = index === 0 ? 'gold' : index === 1 ? 'silver' : index === 2 ? 'bronze' : '';
                return `
                    <div class="mom-item">
                        <span class="player-name">${rankClass ? '🏅' : ''} ${player.name}</span>
                        <span class="player-count">${player.count} times</span>
                    </div>
                `;
            }).join('');
        } else {
            momList.innerHTML = '<p class="empty-message">No data available</p>';
        }
    }
}

// ============================================
// FIXTURE FUNCTIONS
// ============================================

function createFixture() {
    const team1 = document.getElementById('fixtureTeam1').value;
    const team2 = document.getElementById('fixtureTeam2').value;
    const date = document.getElementById('fixtureDate').value;
    const venue = document.getElementById('fixtureVenue').value || 'PalTalk Room';

    if (!team1 || !team2) {
        showNotification('Please select both teams', 'danger');
        return;
    }

    if (team1 === team2) {
        showNotification('Teams must be different', 'danger');
        return;
    }

    socket.emit('createFixture', { team1, team2, date, venue });
    showNotification(`📅 Fixture created: ${team1} vs ${team2}`, 'success');
    
    // Clear fields
    document.getElementById('fixtureTeam1').value = '';
    document.getElementById('fixtureTeam2').value = '';
    document.getElementById('fixtureDate').value = '';
    document.getElementById('fixtureVenue').value = '';
}

function updateFixtures(fixtures) {
    const upcomingContainer = document.getElementById('upcomingFixtures');
    const completedContainer = document.getElementById('completedFixtures');

    if (upcomingContainer) {
        const upcoming = fixtures.matches.filter(m => fixtures.upcoming.includes(m.id));
        if (upcoming.length === 0) {
            upcomingContainer.innerHTML = '<p class="empty-message">No upcoming fixtures</p>';
        } else {
            upcomingContainer.innerHTML = upcoming.map(f => createFixtureCard(f)).join('');
        }
    }

    if (completedContainer) {
        const completed = fixtures.matches.filter(m => fixtures.completed.includes(m.id));
        if (completed.length === 0) {
            completedContainer.innerHTML = '<p class="empty-message">No completed matches</p>';
        } else {
            completedContainer.innerHTML = completed.map(f => createFixtureCard(f)).join('');
        }
    }

    updateCompleteFixtureSelect(fixtures);
}

function createFixtureCard(fixture) {
    const statusColors = {
        scheduled: 'scheduled',
        ongoing: 'ongoing',
        completed: 'completed'
    };
    
    const actions = fixture.status === 'scheduled' ? `
        <div class="fixture-actions">
            <button class="start-btn" onclick="startFixture('${fixture.id}')">▶ Start Match</button>
        </div>
    ` : fixture.status === 'ongoing' ? `
        <div class="fixture-actions">
            <button class="complete-btn" onclick="completeMatchFromFixture('${fixture.id}')">🏆 Complete Match</button>
        </div>
    ` : '';

    return `
        <div class="fixture-card">
            <div class="teams">🏏 ${fixture.team1} vs ${fixture.team2}</div>
            <div class="meta">
                📅 ${new Date(fixture.date).toLocaleString()} | 📍 ${fixture.venue}
                ${fixture.result ? ` | Winner: 🏆 ${fixture.result}` : ''}
                ${fixture.manOfMatch ? ` | ⭐ MOM: ${fixture.manOfMatch}` : ''}
            </div>
            <span class="status ${statusColors[fixture.status] || 'scheduled'}">${fixture.status.toUpperCase()}</span>
            ${actions}
        </div>
    `;
}

function startFixture(fixtureId) {
    if (confirm('Start this match? The scoreboard will be reset.')) {
        socket.emit('startFixture', fixtureId);
        switchTab('livescore');
    }
}

function completeMatchFromFixture(fixtureId) {
    switchTab('admin');
    document.getElementById('completeFixtureSelect').value = fixtureId;
    showNotification('Please select the winner and Man of the Match, then click Complete Match', 'warning');
}

function updateCompleteFixtureSelect(fixtures) {
    const select = document.getElementById('completeFixtureSelect');
    if (!select) return;
    
    const ongoing = fixtures.matches.filter(m => m.status === 'ongoing');
    
    if (ongoing.length === 0) {
        select.innerHTML = '<option value="">No ongoing matches</option>';
        return;
    }

    select.innerHTML = `
        <option value="">Select Ongoing Match</option>
        ${ongoing.map(f => `<option value="${f.id}">${f.team1} vs ${f.team2}</option>`).join('')}
    `;
}

function completeMatch() {
    const fixtureId = document.getElementById('completeFixtureSelect').value;
    const winner = document.getElementById('winnerSelect').value;
    const manOfMatch = document.getElementById('manOfMatch').value.trim();

    if (!fixtureId) {
        showNotification('Please select a match', 'danger');
        return;
    }
    if (!winner) {
        showNotification('Please select the winner', 'danger');
        return;
    }
    if (!manOfMatch) {
        showNotification('Please enter Man of the Match', 'danger');
        return;
    }

    socket.emit('completeFixture', {
        fixtureId,
        winner,
        manOfMatch,
        playerStats: {}
    });

    showNotification(`🏆 Match completed! Winner: ${winner}`, 'success');
    
    // Clear fields
    document.getElementById('completeFixtureSelect').value = '';
    document.getElementById('winnerSelect').value = '';
    document.getElementById('manOfMatch').value = '';
}

// ============================================
// GAME ACTIONS
// ============================================

function submitBatScore() {
    const name = document.getElementById('batsmanName').value.trim();
    const score = parseInt(document.getElementById('batsmanScore').value);
    
    if (!name) {
        showNotification('⚠️ Please enter batsman name!', 'danger');
        return;
    }
    
    if (!score || score < 1 || score > 6) {
        showNotification('⚠️ Please enter a valid score (1-6)', 'danger');
        return;
    }
    
    socket.emit('batsmanSetScore', { name, score });
    document.getElementById('batsmanScore').value = '';
    showNotification(`✅ ${name} set score: ${score}`, 'success');
}

function submitBowlGuess() {
    const name = document.getElementById('bowlerName').value.trim();
    const guess = parseInt(document.getElementById('bowlerGuess').value);
    
    if (!name) {
        showNotification('⚠️ Please enter bowler name!', 'danger');
        return;
    }
    
    if (!guess || guess < 1 || guess > 6) {
        showNotification('⚠️ Please enter a valid guess (1-6)', 'danger');
        return;
    }
    
    socket.emit('bowlerGuess', { name, guess });
    document.getElementById('bowlerGuess').value = '';
    showNotification(`⚾ ${name} guessed: ${guess}`, 'warning');
}

// ============================================
// ADMIN ACTIONS
// ============================================

function createTeam() {
    const teamName = document.getElementById('teamName').value.trim();
    const manager = document.getElementById('managerName').value.trim();
    const captain = document.getElementById('captainName').value.trim();
    const viceCaptain = document.getElementById('viceCaptainName').value.trim();
    const rtmPlayer = document.getElementById('rtmPlayer').value.trim();
    const auctionPlayersRaw = document.getElementById('auctionPlayers').value.trim();
    
    if (!teamName || !manager || !captain || !viceCaptain || !rtmPlayer) {
        showNotification('Please fill all required fields', 'danger');
        return;
    }

    const auctionPlayers = auctionPlayersRaw ? 
        auctionPlayersRaw.split(',').map(p => p.trim()).filter(p => p) : [];

    socket.emit('createTeam', {
        name: teamName,
        manager,
        captain,
        viceCaptain,
        rtmPlayer,
        auctionPlayers
    });

    // Clear fields
    ['teamName', 'managerName', 'captainName', 'viceCaptainName', 'rtmPlayer', 'auctionPlayers']
        .forEach(id => document.getElementById(id).value = '');
}

function setupMatch() {
    const team1Id = document.getElementById('team1Select').value;
    const team2Id = document.getElementById('team2Select').value;
    const team1Order = document.getElementById('team1Order').value.trim();
    const team2Order = document.getElementById('team2Order').value.trim();

    if (!team1Id || !team2Id) {
        showNotification('Please select both teams', 'danger');
        return;
    }

    if (team1Id === team2Id) {
        showNotification('Teams must be different', 'danger');
        return;
    }

    socket.emit('setupMatch', {
        team1Id,
        team2Id,
        team1Order: team1Order ? team1Order.split(',').map(p => p.trim()) : undefined,
        team2Order: team2Order ? team2Order.split(',').map(p => p.trim()) : undefined
    });
    
    switchTab('livescore');
}

function resetMatch() {
    if (confirm('Are you sure you want to reset the match? All data will be lost.')) {
        socket.emit('resetMatch');
    }
}

// ============================================
// TAB SWITCHING
// ============================================

function switchTab(tabName) {
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    
    const tabButton = document.querySelector(`.nav-tab[data-tab="${tabName}"]`);
    if (tabButton) tabButton.classList.add('active');
    
    const tabContent = document.getElementById(`tab-${tabName}`);
    if (tabContent) tabContent.classList.add('active');
}

// ============================================
// NOTIFICATION SYSTEM
// ============================================

let notificationTimeout = null;

function showNotification(message, type = 'warning') {
    const el = document.getElementById('notification');
    if (!el) return;
    
    el.textContent = message;
    el.className = `notification ${type}`;
    
    clearTimeout(notificationTimeout);
    notificationTimeout = setTimeout(() => {
        el.className = 'notification';
    }, 5000);
}

// ============================================
// KEYBOARD SHORTCUTS
// ============================================

document.addEventListener('keydown', (e) => {
    if (e.target.id === 'batsmanScore' && e.key === 'Enter') {
        submitBatScore();
    }
    if (e.target.id === 'bowlerGuess' && e.key === 'Enter') {
        submitBowlGuess();
    }
});

// ============================================
// EVENT LISTENERS
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    // Tab switching
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            switchTab(this.dataset.tab);
        });
    });
});

// ============================================
// INIT
// ============================================

console.log('🏏 GCL Frontend loaded successfully!');
console.log('📡 Waiting for socket connection...');
// ============================================
// AUCTION SYSTEM - COMPLETE
// ============================================

// Auction Data
let auctionPlayers = [];
let myTeamPicks = {};
let auctionWallet = 60000;
let selectedRandomPlayer = null;
let currentPage = 1;
const playersPerPage = 20;

// All Auction Players
let allAuctionPlayers = [
    { id: 1, name: "Virat Kohli" },
    { id: 2, name: "Rohit Sharma" },
    { id: 3, name: "Jasprit Bumrah" },
    { id: 4, name: "Ravindra Jadeja" },
    { id: 5, name: "KL Rahul" },
    { id: 6, name: "Mohammed Shami" },
    { id: 7, name: "Suryakumar Yadav" },
    { id: 8, name: "Rishabh Pant" },
    { id: 9, name: "MS Dhoni" },
    { id: 10, name: "David Warner" },
    { id: 11, name: "Kieron Pollard" },
    { id: 12, name: "Ravichandran Ashwin" },
    { id: 13, name: "Yuzvendra Chahal" },
    { id: 14, name: "Shubman Gill" },
    { id: 15, name: "Sanju Samson" },
    { id: 16, name: "Hardik Pandya" },
    { id: 17, name: "Rashid Khan" },
    { id: 18, name: "Ben Stokes" },
    { id: 19, name: "Jos Buttler" },
    { id: 20, name: "Andre Russell" },
    { id: 21, name: "Pat Cummins" },
    { id: 22, name: "Glenn Maxwell" },
    { id: 23, name: "Moeen Ali" },
    { id: 24, name: "Kagiso Rabada" },
    { id: 25, name: "Shreyas Iyer" },
    { id: 26, name: "Ishan Kishan" },
    { id: 27, name: "Axar Patel" },
    { id: 28, name: "Trent Boult" },
    { id: 29, name: "Faf du Plessis" },
    { id: 30, name: "Jofra Archer" },
];

// Admin password
const AUCTION_PASSWORD = "gscl2026";

// ============================================
// INITIALIZATION
// ============================================

function initAuction() {
    loadAuctionData();
    renderAll();
}

// ============================================
// LOAD & SAVE DATA
// ============================================

function loadAuctionData() {
    const saved = localStorage.getItem('gcl_auction_data');
    if (saved) {
        const data = JSON.parse(saved);
        auctionPlayers = data.players || allAuctionPlayers.map(p => ({ ...p, sold: false, team: null, amount: 0, pickType: null }));
        myTeamPicks = data.picks || {};
        auctionWallet = data.wallet || 60000;
    } else {
        auctionPlayers = allAuctionPlayers.map(p => ({ ...p, sold: false, team: null, amount: 0, pickType: null }));
        myTeamPicks = {};
        auctionWallet = 60000;
        saveAuctionData();
    }
}

function saveAuctionData() {
    localStorage.setItem('gcl_auction_data', JSON.stringify({
        players: auctionPlayers,
        picks: myTeamPicks,
        wallet: auctionWallet
    }));
}

// ============================================
// CHECK PASSWORD
// ============================================

function checkAuctionPassword() {
    const password = document.getElementById('auctionPassword').value;
    const error = document.getElementById('auctionError');
    const login = document.getElementById('auctionLogin');
    const content = document.getElementById('auctionContent');
    
    if (password === AUCTION_PASSWORD) {
        login.style.display = 'none';
        content.style.display = 'block';
        error.style.display = 'none';
        initAuction();
        showNotification('✅ Auction admin access granted!', 'success');
    } else {
        error.style.display = 'block';
        document.getElementById('auctionPassword').value = '';
        showNotification('❌ Incorrect password!', 'danger');
    }
}

function logoutAuction() {
    document.getElementById('auctionLogin').style.display = 'block';
    document.getElementById('auctionContent').style.display = 'none';
    document.getElementById('auctionPassword').value = '';
    showNotification('🔒 Logged out from auction', 'warning');
}

// ============================================
// RENDER FUNCTIONS
// ============================================

function renderAll() {
    renderPlayers();
    renderTeamStatus();
    renderSummary();
    updatePlayerCount();
}

function renderPlayers() {
    const tbody = document.getElementById('auctionPlayersBody');
    if (!tbody) return;
    
    const search = document.getElementById('auctionSearch')?.value?.toLowerCase() || '';
    let filtered = auctionPlayers.filter(p => !p.sold);
    
    if (search) {
        filtered = filtered.filter(p => p.name.toLowerCase().includes(search));
    }
    
    const totalPages = Math.ceil(filtered.length / playersPerPage) || 1;
    if (currentPage > totalPages) currentPage = totalPages;
    
    const start = (currentPage - 1) * playersPerPage;
    const end = start + playersPerPage;
    const pagePlayers = filtered.slice(start, end);
    
    if (pagePlayers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="empty-message">No players available</td></tr>';
    } else {
        tbody.innerHTML = pagePlayers.map((player, index) => `
            <tr>
                <td>${start + index + 1}</td>
                <td><strong>${player.name}</strong></td>
                <td>
                    <button class="delete-btn" onclick="deletePlayerFromAuction(${player.id})">🗑️</button>
                </td>
            </tr>
        `).join('');
    }
    
    // Update pagination
    const pageInfo = document.getElementById('pageInfo');
    const prevBtn = document.querySelector('.page-btn:first-child');
    const nextBtn = document.querySelector('.page-btn:last-child');
    
    if (pageInfo) pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
    if (prevBtn) prevBtn.disabled = currentPage <= 1;
    if (nextBtn) nextBtn.disabled = currentPage >= totalPages;
}

function renderTeamStatus() {
    const container = document.getElementById('auctionTeamStatus');
    if (!container) return;
    
    const teams = window.teams || [];
    if (teams.length === 0) {
        container.innerHTML = '<p class="empty-message">No teams created yet.</p>';
        return;
    }
    
    container.innerHTML = teams.map(team => {
        const picks = myTeamPicks[team.id] || [];
        const total = picks.length;
        const rtmCount = picks.filter(p => p.pickType === 'rtm').length;
        const totalSpent = picks.reduce((sum, p) => sum + p.amount, 0);
        const isComplete = total >= 4;
        const hasRtm = rtmCount >= 1;
        
        return `
            <div class="team-status-card">
                <div class="team-name-status">🏏 ${team.name}</div>
                <div class="team-progress">
                    ${isComplete ? '<span class="complete">✅ 4/4</span>' : `<span class="incomplete">⏳ ${total}/4</span>`}
                </div>
                <div class="team-rtm-status">
                    ${hasRtm ? '<span class="has-rtm">⭐ RTM ✅</span>' : '<span class="no-rtm">❌ No RTM</span>'}
                </div>
                <div class="team-wallet-status">💰 ₹${totalSpent.toLocaleString()}</div>
                <div class="team-players-list">
                    ${picks.map(p => `${p.name}${p.pickType === 'rtm' ? ' ⭐' : ''}`).join(', ') || 'No players yet'}
                </div>
            </div>
        `;
    }).join('');
}

function renderSummary() {
    const container = document.getElementById('auctionSummary');
    if (!container) return;
    
    const teams = window.teams || [];
    const totalTeams = teams.length;
    let totalPicks = 0;
    let totalRtm = 0;
    let completedTeams = 0;
    
    Object.values(myTeamPicks).forEach(picks => {
        totalPicks += picks.length;
        totalRtm += picks.filter(p => p.pickType === 'rtm').length;
    });
    
    teams.forEach(team => {
        const picks = myTeamPicks[team.id] || [];
        if (picks.length >= 4) completedTeams++;
    });
    
    container.innerHTML = `
        📊 <strong>${completedTeams}/${totalTeams}</strong> Teams Complete &nbsp;|&nbsp;
        Total Players: <strong>${totalPicks}/${totalTeams * 4}</strong> &nbsp;|&nbsp;
        Total RTM: <strong>${totalRtm}/${totalTeams}</strong>
    `;
}

function updatePlayerCount() {
    const countEl = document.getElementById('playerCount');
    if (!countEl) return;
    const available = auctionPlayers.filter(p => !p.sold).length;
    countEl.textContent = `${available} players available`;
}

// ============================================
// PAGINATION
// ============================================

function prevPage() {
    if (currentPage > 1) {
        currentPage--;
        renderPlayers();
    }
}

function nextPage() {
    const search = document.getElementById('auctionSearch')?.value?.toLowerCase() || '';
    let filtered = auctionPlayers.filter(p => !p.sold);
    if (search) filtered = filtered.filter(p => p.name.toLowerCase().includes(search));
    const totalPages = Math.ceil(filtered.length / playersPerPage) || 1;
    
    if (currentPage < totalPages) {
        currentPage++;
        renderPlayers();
    }
}

// ============================================
// RANDOM PICK
// ============================================

function pickRandom() {
    const available = auctionPlayers.filter(p => !p.sold);
    if (available.length === 0) {
        document.getElementById('noPlayersMessage').style.display = 'block';
        return;
    }
    document.getElementById('noPlayersMessage').style.display = 'none';
    
    const randomIndex = Math.floor(Math.random() * available.length);
    selectedRandomPlayer = available[randomIndex];
    
    showPlayerReveal(selectedRandomPlayer);
}
function showPlayerReveal(player) {
    // Create overlay
    const overlay = document.createElement('div');
    overlay.className = 'player-reveal-overlay';
    overlay.id = 'playerRevealOverlay';
    overlay.innerHTML = `
        <div class="player-reveal-content">
            <div class="player-reveal-close" onclick="closePlayerReveal()">✕</div>
            <div class="player-reveal-card">
                <div class="player-reveal-icon">🏏</div>
                <div class="player-reveal-name">${player.name.toUpperCase()}</div>
                <div class="player-reveal-actions">
                    <button onclick="showAssignForm()" class="assign-btn">✅ Assign to Team</button>
                    <button onclick="closePlayerReveal()" class="again-btn">🔄 Pick Again</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    
    // Show notification
    showNotification(`🎰 Player picked: ${player.name}`, 'warning');
}

function closePlayerReveal() {
    const overlay = document.getElementById('playerRevealOverlay');
    if (overlay) overlay.remove();
    document.getElementById('assignSection').style.display = 'none';
}

// ============================================
// ASSIGN PLAYER TO TEAM
// ============================================

function showAssignForm() {
    if (!selectedRandomPlayer) {
        showNotification('⚠️ Please pick a player first!', 'danger');
        return;
    }
    
    // Close reveal overlay
    const overlay = document.getElementById('playerRevealOverlay');
    if (overlay) overlay.remove();
    
    // Show assign section
    const assignSection = document.getElementById('assignSection');
    assignSection.style.display = 'block';
    document.getElementById('assignPlayerName').textContent = selectedRandomPlayer.name;
    document.getElementById('assignAmount').value = '';
    document.getElementById('assignAmount').placeholder = `Enter bid amount for ${selectedRandomPlayer.name}`;
    
    // Update team dropdown
    updateTeamDropdowns();
}

function updateTeamDropdowns() {
    const select = document.getElementById('assignTeam');
    if (!select) return;
    
    const teams = window.teams || [];
    select.innerHTML = '<option value="">Select Team</option>';
    teams.forEach(team => {
        select.innerHTML += `<option value="${team.id}">${team.name}</option>`;
    });
}

function closeAssignSection() {
    document.getElementById('assignSection').style.display = 'none';
    selectedRandomPlayer = null;
}

function confirmAssign() {
    const teamId = document.getElementById('assignTeam').value;
    const amount = parseInt(document.getElementById('assignAmount').value);
    const pickType = document.querySelector('input[name="pickType"]:checked').value;
    
    if (!teamId) {
        showNotification('⚠️ Please select a team!', 'danger');
        return;
    }
    if (!amount || amount < 0) {
        showNotification('⚠️ Please enter a valid amount!', 'danger');
        return;
    }
    
    // Check wallet
    let totalSpent = 0;
    Object.values(myTeamPicks).forEach(picks => {
        totalSpent += picks.reduce((sum, p) => sum + p.amount, 0);
    });
    
    if (amount > (60000 - totalSpent)) {
        showNotification('⚠️ Insufficient balance! Remaining: ₹' + (60000 - totalSpent).toLocaleString(), 'danger');
        return;
    }
    
    const team = window.teams.find(t => t.id === teamId);
    if (!team) {
        showNotification('⚠️ Team not found!', 'danger');
        return;
    }
    
    // Assign player
    selectedRandomPlayer.sold = true;
    selectedRandomPlayer.team = team.name;
    selectedRandomPlayer.amount = amount;
    selectedRandomPlayer.pickType = pickType;
    
    if (!myTeamPicks[teamId]) {
        myTeamPicks[teamId] = [];
    }
    myTeamPicks[teamId].push({
        playerId: selectedRandomPlayer.id,
        name: selectedRandomPlayer.name,
        amount: amount,
        pickType: pickType
    });
    
    saveAuctionData();
    renderAll();
    
    document.getElementById('assignSection').style.display = 'none';
    selectedRandomPlayer = null;
    
    showNotification(`✅ ${team.name} picked ${selectedRandomPlayer ? '' : ''} for ₹${amount.toLocaleString()}`, 'success');
}

// ============================================
// ADD / DELETE PLAYERS
// ============================================

function addPlayerToAuction() {
    const nameInput = document.getElementById('newPlayerName');
    const name = nameInput.value.trim();
    
    if (!name) {
        showNotification('⚠️ Please enter a player name!', 'danger');
        return;
    }
    
    // Check if player already exists
    if (auctionPlayers.some(p => p.name.toLowerCase() === name.toLowerCase())) {
        showNotification('⚠️ Player already exists in auction!', 'danger');
        return;
    }
    
    const newId = Math.max(...auctionPlayers.map(p => p.id), 0) + 1;
    auctionPlayers.push({
        id: newId,
        name: name,
        sold: false,
        team: null,
        amount: 0,
        pickType: null
    });
    
    saveAuctionData();
    renderAll();
    nameInput.value = '';
    showNotification(`✅ ${name} added to auction!`, 'success');
}

function deletePlayerFromAuction(playerId) {
    if (!confirm('Are you sure you want to delete this player from the auction?')) return;
    
    const player = auctionPlayers.find(p => p.id === playerId);
    if (!player) return;
    
    if (player.sold) {
        showNotification('⚠️ Player is already sold! Remove from team first.', 'danger');
        return;
    }
    
    auctionPlayers = auctionPlayers.filter(p => p.id !== playerId);
    saveAuctionData();
    renderAll();
    showNotification(`🗑️ ${player.name} removed from auction`, 'warning');
}

// ============================================
// FILTERS
// ============================================

function filterAuctionPlayers() {
    currentPage = 1;
    renderPlayers();
}

function resetAuctionFilters() {
    document.getElementById('auctionSearch').value = '';
    currentPage = 1;
    renderPlayers();
}

// ============================================
// RESET AUCTION
// ============================================

function resetAuction() {
    if (!confirm('⚠️ Are you sure you want to reset the entire auction? All data will be lost!')) return;
    
    auctionPlayers = allAuctionPlayers.map(p => ({ ...p, sold: false, team: null, amount: 0, pickType: null }));
    myTeamPicks = {};
    auctionWallet = 60000;
    selectedRandomPlayer = null;
    currentPage = 1;
    
    localStorage.removeItem('gcl_auction_data');
    saveAuctionData();
    renderAll();
    document.getElementById('assignSection').style.display = 'none';
    document.getElementById('selectedPlayer').style.display = 'none';
    
    showNotification('🔄 Auction has been reset!', 'success');
}

// ============================================
// KEYBOARD SUPPORT
// ============================================

document.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && document.getElementById('auctionPassword') === document.activeElement) {
        checkAuctionPassword();
    }
    if (e.key === 'Enter' && document.getElementById('newPlayerName') === document.activeElement) {
        addPlayerToAuction();
    }
});

// ============================================
// END OF AUCTION SYSTEM
// ============================================
