// ============================================
// GCL FRONTEND APPLICATION - COMPLETE
// ============================================

const socket = io();
let matchState = null;
let teams = [];

console.log('🏏 GCL Frontend Loading...');

// ============================================
// SOCKET EVENTS
// ============================================

socket.on('connect', () => {
    console.log('✅ Connected to server!');
    updateConnectionStatus(true);
    socket.emit('getState');
    socket.emit('getTeams');
    socket.emit('getFixtures');
    socket.emit('getTopStats');
    socket.emit('getPointsTable');
    fetch('/api/top10/sheet')
        .then(res => res.json())
        .then(data => {
            if (data.batsmen && data.bowlers) {
                updateTop10Players(data);
            }
        })
        .catch(err => console.error('Error fetching sheet data:', err));
});

socket.on('disconnect', () => {
    console.log('❌ Disconnected from server');
    updateConnectionStatus(false);
});

socket.on('teamCreated', (team) => {
    showNotification(`✅ Team "${team.name}" created!`, 'success');
    socket.emit('getTeams');
});

socket.on('fixturesUpdate', (fixtures) => {
    console.log('📅 Fixtures Update:', fixtures);
     window.fixtures = fixtures;
    updateFixtures(fixtures);
    updateAdminFixturesList(); // 👈 ADD THIS
    updateAdminResultsList(); // 👈 ADD THIS
    updateCompleteFixtureSelect(fixtures);
});
// ✅ ADD THIS
socket.on('startFixture', (fixtureId) => {
    console.log('⚔️ Match started event received:', fixtureId);
    socket.emit('getFixtures');
    setTimeout(() => {
        console.log('🔄 Updating dropdown...');
        updateCompleteFixtureSelect(window.fixtures);
    }, 1000);
});

/*socket.on('startFixture', (fixtureId) => {
    console.log('⚔️ Match started:', fixtureId);
    socket.emit('getFixtures');
    setTimeout(() => {
        updateCompleteFixtureSelect(window.fixtures);
    }, 500);
});*/
socket.on('pointsTable', (data) => {
    console.log('🏆 Points Table received:', data);
    updatePointsTable(data);
});

socket.on('topStats', (data) => {
    console.log('🏅 Top Stats:', data);
    updateTop10Players(data);
});

socket.on('notification', (message) => {
    showNotification(message, 'warning');
});

socket.on('error', (data) => {
    console.error('❌ Error:', data);
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

    if (state.bowlingTeam) {
        const bowlingName = document.getElementById('bowlingTeamName');
        const bowler = document.getElementById('currentBowler');
        
        if (bowlingName) bowlingName.textContent = state.bowlingTeam.name || 'Team 2';
        if (bowler) bowler.textContent = state.bowlingTeam.currentBowler || '-';
    }

    const targetDisplay = document.getElementById('targetDisplay');
    if (targetDisplay) {
        targetDisplay.textContent = state.target ? `Target: ${state.target}` : '';
    }

    const lbwCount = document.getElementById('lbwCount');
    const lbwDisplay = document.getElementById('lbwDisplay');
    if (lbwCount) lbwCount.textContent = state.lbwCount || 0;
    if (lbwDisplay) {
        lbwDisplay.style.display = state.overType === 'lbw' ? 'block' : 'none';
    }

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
}

function updateTeamSelects(teams) {
    const options = teams.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
    
    const selects = [
        'team1Select', 'team2Select', 'fixtureTeam1', 'fixtureTeam2', 'winnerSelect',
        'adminTeam1', 'adminTeam2', 'adminFixtureTeam1', 'adminFixtureTeam2',
        'adminWinnerSelect', 'adminCompleteMatchSelect'
    ];
    
    selects.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            const currentValue = el.value;
            let label = 'Team';
            if (id === 'adminWinnerSelect' || id === 'winnerSelect') label = 'Winner';
            else if (id === 'adminCompleteMatchSelect' || id.includes('complete')) label = 'Ongoing Match';
            
            el.innerHTML = `<option value="">Select ${label}</option>${options}`;
            if (currentValue) el.value = currentValue;
        }
    });
}
function updatePointsTable(pointsTable) {
    console.log('📊 Updating Points Table:', pointsTable);
    
    if (!pointsTable || pointsTable.length === 0) {
        document.getElementById('groupA').innerHTML = '<tr><td colspan="7" class="empty-message">No data available</td></tr>';
        document.getElementById('groupB').innerHTML = '<tr><td colspan="7" class="empty-message">No data available</td></tr>';
        return;
    }

    // Group A teams
    // ✅ Sirf 'A' group wali teams dikhein, 'Unassigned' ko ignore karein
const groupATeams = pointsTable.filter(t => t.group === 'A');
const groupBTeams = pointsTable.filter(t => t.group === 'B');
    
    const groupAElement = document.getElementById('groupA');
    const groupBElement = document.getElementById('groupB');

    if (groupAElement) {
        if (groupATeams.length === 0) {
            groupAElement.innerHTML = '<tr><td colspan="7" class="empty-message">No data available</td></tr>';
        } else {
            groupAElement.innerHTML = groupATeams.map(team => {
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
    }

    if (groupBElement) {
        if (groupBTeams.length === 0) {
            groupBElement.innerHTML = '<tr><td colspan="7" class="empty-message">No data available</td></tr>';
        } else {
            groupBElement.innerHTML = groupBTeams.map(team => {
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
    }
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
    
    const team1Name = getTeamNameById(fixture.team1);
    const team2Name = getTeamNameById(fixture.team2);
    
    let dateDisplay = 'Date not set';
    let timeDisplay = '';
    try {
        const dateObj = new Date(fixture.date);
        if (!isNaN(dateObj.getTime())) {
            dateDisplay = dateObj.toLocaleDateString('en-IN', { 
                day: '2-digit', 
                month: 'short', 
                year: 'numeric' 
            });
            timeDisplay = dateObj.toLocaleTimeString('en-IN', { 
                hour: '2-digit', 
                minute: '2-digit',
                hour12: true 
            });
        }
    } catch (e) {
        dateDisplay = fixture.date || 'Date not set';
    }
    
    // Admin actions (Edit + Delete)
    const adminActions = fixtureAdminMode ? `
        <div class="fixture-admin-actions">
            <button class="edit-btn" onclick="editFixture('${fixture.id}')">✏️ Edit</button>
            <button class="delete-btn" onclick="deleteFixture('${fixture.id}')">🗑️</button>
        </div>
    ` : '';
    
    // Match actions (Start/Complete)
    let matchActions = '';
    if (fixture.status === 'scheduled') {
        matchActions = `
            <button class="start-btn" onclick="startFixture('${fixture.id}')">▶ Start Match</button>
        `;
    } else if (fixture.status === 'ongoing') {
        matchActions = `
            <button class="complete-btn" onclick="completeMatchFromFixture('${fixture.id}')">🏆 Complete Match</button>
        `;
    }
    
    return `
        <div class="fixture-card ${fixture.status === 'completed' ? 'completed-card' : ''}">
            <div class="fixture-header">
                <div class="teams">🏏 ${team1Name} vs ${team2Name}</div>
                ${adminActions}
            </div>
            <div class="fixture-details">
                <div class="fixture-detail-item date-time">
                    📅 ${dateDisplay} ${timeDisplay ? `| 🕐 ${timeDisplay}` : ''}
                </div>
                <div class="fixture-detail-item venue">
                    📍 ${fixture.venue || 'PalTalk Room'}
                </div>
                ${fixture.host ? `
                    <div class="fixture-detail-item host">
                        <span class="host-label">🎙️ Host:</span>
                        <span class="host-name">${fixture.host}</span>
                    </div>
                ` : ''}
                ${fixture.result ? `
                    <div class="fixture-detail-item result">
                        🏆 Winner: ${fixture.result}
                    </div>
                ` : ''}
                ${fixture.manOfMatch ? `
                    <div class="fixture-detail-item mom">
                        ⭐ MOM: ${fixture.manOfMatch}
                    </div>
                ` : ''}
            </div>
            <div class="fixture-bottom">
                <span class="status ${statusColors[fixture.status] || 'scheduled'}">${fixture.status.toUpperCase()}</span>
                <div class="fixture-actions">
                    ${matchActions}
                </div>
            </div>
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
    const select = document.getElementById('adminCompleteMatchSelect');
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
    
    document.getElementById('completeFixtureSelect').value = '';
    document.getElementById('winnerSelect').value = '';
    document.getElementById('manOfMatch').value = '';
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
        manager: manager,
        captain: captain,
        viceCaptain: viceCaptain,
        rtmPlayer: rtmPlayer,
        auctionPlayers: auctionPlayers
    });

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
        team1Id: team1Id,
        team2Id: team2Id,
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
// 10. NOTIFICATION FUNCTION
// ============================================

function showNotification(message, type = 'info') {
    const notification = document.getElementById('notification');
    if (!notification) return;
    
    notification.textContent = message;
    notification.className = 'notification';
    if (type) {
        notification.classList.add(type);
    }
    notification.style.display = 'flex';
    
    // Auto-hide after 5 seconds
    clearTimeout(notification._timeout);
    notification._timeout = setTimeout(() => {
        notification.style.display = 'none';
    }, 5000);
}
// ============================================
// TEAMS PAGE FUNCTIONS
// ============================================

let teamsAdminMode = false;
const TEAMS_PASSWORD = "gcl2026";

function checkTeamsPassword() {
    const password = document.getElementById('teamsPassword').value;
    const error = document.getElementById('teamsError');
    const login = document.getElementById('teamsAdminLogin');
    const controls = document.getElementById('teamsAdminControls');
    
    if (password === TEAMS_PASSWORD) {
        login.style.display = 'none';
        controls.style.display = 'block';
        error.style.display = 'none';
        teamsAdminMode = true;
        showNotification('✅ Teams admin access granted!', 'success');
        socket.emit('getTeams');
    } else {
        error.style.display = 'block';
        document.getElementById('teamsPassword').value = '';
        showNotification('❌ Incorrect password!', 'danger');
    }
}

function logoutTeams() {
    document.getElementById('teamsAdminLogin').style.display = 'block';
    document.getElementById('teamsAdminControls').style.display = 'none';
    document.getElementById('teamsPassword').value = '';
    teamsAdminMode = false;
    showNotification('🔒 Logged out from teams admin', 'warning');
    socket.emit('getTeams');
}

function showAddTeamForm() {
    document.getElementById('addTeamForm').style.display = 'block';
}

function hideAddTeamForm() {
    document.getElementById('addTeamForm').style.display = 'none';
    document.getElementById('newTeamName').value = '';
    document.getElementById('newCaptain').value = '';
    document.getElementById('newViceCaptain').value = '';
    document.getElementById('newSquad').value = '';
}

function createTeamFromTeams() {
    const name = document.getElementById('newTeamName').value.trim();
    const captain = document.getElementById('newCaptain').value.trim();
    const viceCaptain = document.getElementById('newViceCaptain').value.trim();
    const squadRaw = document.getElementById('newSquad').value.trim();
    
    console.log('🔍 1. Name:', name);
    console.log('🔍 2. Captain:', captain);
    console.log('🔍 3. Vice Captain:', viceCaptain);
    console.log('🔍 4. Squad Raw:', squadRaw);
    
    if (!name) {
        showNotification('⚠️ Please enter team name!', 'danger');
        return;
    }
    if (!captain) {
        showNotification('⚠️ Please enter captain name!', 'danger');
        return;
    }
    if (!viceCaptain) {
        showNotification('⚠️ Please enter vice captain name!', 'danger');
        return;
    }
    
    const squad = squadRaw ? squadRaw.split(',').map(p => p.trim()).filter(p => p) : [];
    
    console.log('🔍 5. Parsed Squad:', squad);
    
    if (!squad.includes(captain)) {
        showNotification(`⚠️ Captain "${captain}" must be in the squad list!`, 'danger');
        return;
    }
    if (!squad.includes(viceCaptain)) {
        showNotification(`⚠️ Vice Captain "${viceCaptain}" must be in the squad list!`, 'danger');
        return;
    }
    
    console.log('🔍 6. Emitting createTeam...');
    
    socket.emit('createTeam', {
        name: name,
        captain: captain,
        viceCaptain: viceCaptain,
        squad: squad
    });
    
    hideAddTeamForm();
    showNotification(`⏳ Creating team "${name}"...`, 'warning');
}
function updateTeamsList(teams) {
    const container = document.getElementById('teamsList');
    const countEl = document.getElementById('teamsCount');
    
    if (!container) return;
    
    if (countEl) {
        countEl.textContent = `${teams.length} teams`;
    }
    
    if (!teams || teams.length === 0) {
        container.innerHTML = '<p class="empty-message">No teams created yet.</p>';
        return;
    }

    const isAdmin = teamsAdminMode;
    
    let html = '';
    teams.forEach(team => {
        const actions = isAdmin ? `
            <div class="team-actions">
                <button class="edit-btn" onclick="editTeam('${team.id}')">✏️ Edit</button>
                <button class="delete-btn" onclick="deleteTeam('${team.id}')">🗑️</button>
            </div>
        ` : '';
        
        const squad = team.squad || [];
        const captainTag = team.captain ? `${team.captain} (C)` : '';
        const vcTag = team.viceCaptain ? `${team.viceCaptain} (VC)` : '';
        const otherPlayers = squad.filter(p => p !== team.captain && p !== team.viceCaptain);

        // Show all players with tags
        const allPlayers = [];
        if (captainTag) allPlayers.push({name: captainTag, cls: 'captain-tag'});
        if (vcTag) allPlayers.push({name: vcTag, cls: 'vc-tag'});
        otherPlayers.forEach(p => allPlayers.push({name: p, cls: ''}));
        
        html += `
            <div class="team-card ${!isAdmin ? 'read-only' : ''}">
                <div class="team-header">
                    <span class="team-name-card">🏏 ${team.name}</span>
                    ${actions}
                </div>
                <div class="team-details">
                    <span class="captain-label">🧢 Captain: </span>
                    <span class="captain-name">${team.captain || 'N/A'}</span>
                    <span class="detail-separator">|</span>
                    <span class="vc-label">🧢 Vice Captain: </span>
                    <span class="vc-name">${team.viceCaptain || 'N/A'}</span>
                </div>
                <div class="team-squad">
                    ${allPlayers.map(p => `
                        <span class="squad-tag ${p.cls}">${p.name}</span>
                    `).join('')}
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}
function editTeam(teamId) {
    const team = teams.find(t => t.id === teamId);
    if (!team) {
        showNotification('⚠️ Team not found!', 'danger');
        return;
    }
    
    const currentSquadText = team.squad ? team.squad.join(', ') : '';
    
    const message = `✏️ EDIT TEAM: ${team.name}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📝 Team Name: ${team.name}
🧢 Captain: ${team.captain}
🧢 Vice Captain: ${team.viceCaptain}
🏏 Squad (${team.squad ? team.squad.length : 0} players):
${currentSquadText}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📌 Enter details below (comma separated):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Format: Team Name, Captain, Vice Captain, Player1, Player2, Player3...

💡 To add/remove players, just add or remove names from the list.`;

    const input = prompt(message, `${team.name}, ${team.captain}, ${team.viceCaptain}, ${currentSquadText}`);
    
    if (input === null) return;
    
    const parts = input.split(',').map(p => p.trim()).filter(p => p);
    
    if (parts.length < 3) {
        showNotification('⚠️ Please enter at least: Team Name, Captain, Vice Captain', 'danger');
        return;
    }
    
    const newName = parts[0];
    const newCaptain = parts[1];
    const newVC = parts[2];
    let newSquad = parts.slice(3);
    
    // ✅ Captain and VC ko squad mein add karein (agar nahi hain toh)
    if (!newSquad.includes(newCaptain)) {
        newSquad.push(newCaptain);
    }
    if (!newSquad.includes(newVC)) {
        newSquad.push(newVC);
    }
    
    // ✅ Captain/VC validation
    if (!newSquad.includes(newCaptain)) {
        showNotification(`⚠️ Captain "${newCaptain}" must be in the squad!`, 'danger');
        return;
    }
    if (!newSquad.includes(newVC)) {
        showNotification(`⚠️ Vice Captain "${newVC}" must be in the squad!`, 'danger');
        return;
    }
    
    const updatedTeam = {
        ...team,
        name: newName.trim(),
        captain: newCaptain.trim(),
        viceCaptain: newVC.trim(),
        squad: newSquad
    };
    
    fetch('/api/teams/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedTeam)
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            showNotification(`✅ Team "${newName}" updated!`, 'success');
            socket.emit('getTeams');
        } else {
            showNotification(`❌ Update failed: ${data.error}`, 'danger');
        }
    })
    .catch(err => {
        showNotification('❌ Error updating team', 'danger');
        console.error(err);
    });
}
function deleteTeam(teamId) {
    const team = teams.find(t => t.id === teamId);
    if (!team) {
        showNotification('⚠️ Team not found!', 'danger');
        return;
    }
    
    if (!confirm(`Are you sure you want to delete "${team.name}"? This cannot be undone!`)) {
        return;
    }
    
    fetch('/api/teams/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: teamId })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            showNotification(`🗑️ Team "${team.name}" deleted!`, 'warning');
            socket.emit('getTeams');
        } else {
            showNotification(`❌ Delete failed: ${data.error}`, 'danger');
        }
    })
    .catch(err => {
        showNotification('❌ Error deleting team', 'danger');
        console.error(err);
    });
}
function toggleTeamsAdmin() {
    const login = document.getElementById('teamsAdminLogin');
    if (login.style.display === 'flex') {
        login.style.display = 'none';
    } else {
        login.style.display = 'flex';
        document.getElementById('teamsPassword').value = '';
        document.getElementById('teamsError').style.display = 'none';
    }
}
/*// ============================================
// AUCTION SYSTEM
// ============================================

let auctionPlayers = [];
let myTeamPicks = {};
let auctionWallet = 60000;
let selectedRandomPlayer = null;
let currentPage = 1;
const playersPerPage = 20;

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

const AUCTION_PASSWORD = "gcl2026";

function initAuction() {
    loadAuctionData();
    renderAll();
}

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
}*/

const AUCTION_PASSWORD = "gcl2026";

function checkAuctionPassword() {
    const password = document.getElementById('auctionPassword').value;
    const error = document.getElementById('auctionError');
    const login = document.getElementById('auctionLogin');
    const content = document.getElementById('auctionContent');
    
    if (password === AUCTION_PASSWORD) {
        login.style.display = 'none';
        content.style.display = 'block';
        error.style.display = 'none';
        showNotification('✅ Admin access granted!', 'success');
        updateTeamsGrouping(); // ✅ Teams Grouping data fetch
        socket.emit('getTeams');
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

/*function renderAll() {
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
    
    const pageInfo = document.getElementById('pageInfo');
    const prevBtn = document.getElementById('prevPageBtn');
    const nextBtn = document.getElementById('nextPageBtn');
    
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
    showNotification(`🎰 Player picked: ${player.name}`, 'warning');
}

function closePlayerReveal() {
    const overlay = document.getElementById('playerRevealOverlay');
    if (overlay) overlay.remove();
    document.getElementById('assignSection').style.display = 'none';
}

function showAssignForm() {
    if (!selectedRandomPlayer) {
        showNotification('⚠️ Please pick a player first!', 'danger');
        return;
    }
    
    const overlay = document.getElementById('playerRevealOverlay');
    if (overlay) overlay.remove();
    
    const assignSection = document.getElementById('assignSection');
    assignSection.style.display = 'block';
    document.getElementById('assignPlayerName').textContent = selectedRandomPlayer.name;
    document.getElementById('assignAmount').value = '';
    document.getElementById('assignAmount').placeholder = `Enter bid amount for ${selectedRandomPlayer.name}`;
    
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
    
    showNotification(`✅ ${team.name} picked player for ₹${amount.toLocaleString()}`, 'success');
}

function addPlayerToAuction() {
    const nameInput = document.getElementById('newPlayerName');
    const name = nameInput.value.trim();
    
    if (!name) {
        showNotification('⚠️ Please enter a player name!', 'danger');
        return;
    }
    
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

function filterAuctionPlayers() {
    currentPage = 1;
    renderPlayers();
}

function resetAuctionFilters() {
    document.getElementById('auctionSearch').value = '';
    currentPage = 1;
    renderPlayers();
}

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
    
    showNotification('🔄 Auction has been reset!', 'success');
}*/

// ============================================
// KEYBOARD SUPPORT
// ============================================

document.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && document.getElementById('auctionPassword') === document.activeElement) {
        checkAuctionPassword();
    }
    /*if (e.key === 'Enter' && document.getElementById('newPlayerName') === document.activeElement) {
        addPlayerToAuction();
    }*/
    if (e.key === 'Enter' && document.getElementById('teamsPassword') === document.activeElement) {
        checkTeamsPassword();
    }
});

console.log('🏏 GCL Frontend loaded successfully!');
console.log('📡 Waiting for socket connection...');
// ============================================
// POINTS TABLE FUNCTIONS
// ============================================

function showRound(round) {
    // Hide all round contents
    document.querySelectorAll('.round-content').forEach(el => {
        el.style.display = 'none';
    });
    
    // Show selected round
    const target = document.getElementById('round' + round);
    if (target) {
        target.style.display = 'block';
    }
    
    // Update active button
    document.querySelectorAll('.round-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`.round-btn[data-round="${round}"]`)?.classList.add('active');
}

// Function to update points table data
function updatePointsTableDisplay(data) {
    // This will be implemented when we have match data
    console.log('Points table data:', data);
}

// Function to update playoff teams
function updatePlayoffTeams(team1, team2, team3, team4) {
    if (team1) document.getElementById('q1t1').textContent = team1;
    if (team2) document.getElementById('q1t2').textContent = team2;
    if (team3) document.getElementById('e1t1').textContent = team3;
    if (team4) document.getElementById('e1t2').textContent = team4;
}

// Function to update final teams
function updateFinalTeams(team1, team2) {
    if (team1) document.getElementById('finalTeam1').textContent = team1;
    if (team2) document.getElementById('finalTeam2').textContent = team2;
}

// Function to update champion/runner-up
function updateFinalResult(champion, runnerUp) {
    if (champion) document.getElementById('champion').textContent = champion;
    if (runnerUp) document.getElementById('runnerUp').textContent = runnerUp;
}
// ============================================
// TAB EVENT LISTENERS - PERMANENT FIX
// ============================================

document.addEventListener('DOMContentLoaded', function() {
    console.log('🔄 DOM loaded, attaching tab listeners...');
    
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            const tabName = this.dataset.tab;
            
            // ✅ Tab switch karein
            switchTab(tabName);
            
            // ✅ Agar Teams Grouping tab hai toh data fetch karein
           if (tabName === 'auction') {
                updateTeamsGrouping();
            }
        });
    });
    
    console.log('✅ Tab listeners attached!');
});

// Fallback: Agar DOM already loaded hai toh direct attach karein
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    console.log('🔄 Fallback: Attaching tab listeners...');
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            switchTab(this.dataset.tab);
        });
    });
    console.log('✅ Tab listeners attached (fallback)!');
}
// ============================================
// ADMIN PAGE FUNCTIONS
// ============================================

const ADMIN_PASSWORD = "gcl2026";

function checkAdminPassword() {
    const password = document.getElementById('adminPassword').value;
    const error = document.getElementById('adminError');
    const login = document.getElementById('adminLogin');
    const content = document.getElementById('adminContent');
    
    if (password === ADMIN_PASSWORD) {
        login.style.display = 'none';
        content.style.display = 'block';
        error.style.display = 'none';
        showNotification('✅ Admin access granted!', 'success');
        // Refresh data
        socket.emit('getTeams');
        socket.emit('getFixtures');
        updateAdminTeamsList();
        updateAdminFixturesList();
        updateAdminResultsList();
    } else {
        error.style.display = 'block';
        document.getElementById('adminPassword').value = '';
        showNotification('❌ Incorrect password!', 'danger');
    }
}

function logoutAdmin() {
    document.getElementById('adminLogin').style.display = 'block';
    document.getElementById('adminContent').style.display = 'none';
    document.getElementById('adminPassword').value = '';
    showNotification('🔒 Logged out from admin panel', 'warning');
}

function createTeamFromAdmin() {
    const name = document.getElementById('adminTeamName').value.trim();
    const captain = document.getElementById('adminCaptain').value.trim();
    const viceCaptain = document.getElementById('adminViceCaptain').value.trim();
    const squadRaw = document.getElementById('adminSquad').value.trim();
    
    if (!name || !captain || !viceCaptain) {
        showNotification('⚠️ Please fill all required fields!', 'danger');
        return;
    }
    
    const squad = squadRaw ? squadRaw.split(',').map(p => p.trim()).filter(p => p) : [];
    
    if (!squad.includes(captain)) {
        showNotification(`⚠️ Captain "${captain}" must be in squad!`, 'danger');
        return;
    }
    if (!squad.includes(viceCaptain)) {
        showNotification(`⚠️ Vice Captain "${viceCaptain}" must be in squad!`, 'danger');
        return;
    }
    
    socket.emit('createTeam', {
        name: name,
        captain: captain,
        viceCaptain: viceCaptain,
        squad: squad
    });
    
    // Clear form
    ['adminTeamName', 'adminCaptain', 'adminViceCaptain', 'adminSquad']
        .forEach(id => document.getElementById(id).value = '');
    
    showNotification(`✅ Team "${name}" created!`, 'success');
}

function setupMatchFromAdmin() {
    const team1Id = document.getElementById('adminTeam1').value;
    const team2Id = document.getElementById('adminTeam2').value;
    const team1Order = document.getElementById('adminTeam1Order').value.trim();
    const team2Order = document.getElementById('adminTeam2Order').value.trim();
    
    if (!team1Id || !team2Id) {
        showNotification('⚠️ Please select both teams!', 'danger');
        return;
    }
    if (team1Id === team2Id) {
        showNotification('⚠️ Teams must be different!', 'danger');
        return;
    }
    
    socket.emit('setupMatch', {
        team1Id: team1Id,
        team2Id: team2Id,
        team1Order: team1Order ? team1Order.split(',').map(p => p.trim()) : undefined,
        team2Order: team2Order ? team2Order.split(',').map(p => p.trim()) : undefined
    });
    
    // Clear form
    document.getElementById('adminTeam1Order').value = '';
    document.getElementById('adminTeam2Order').value = '';
    
    showNotification('⚔️ Match setup initiated!', 'warning');
}

function resetMatchFromAdmin() {
    if (confirm('⚠️ Are you sure you want to reset the match? All data will be lost!')) {
        socket.emit('resetMatch');
    }
}

function createFixtureFromAdmin() {
    const team1 = document.getElementById('adminFixtureTeam1').value;
    const team2 = document.getElementById('adminFixtureTeam2').value;
    const date = document.getElementById('adminFixtureDate').value;
    const time = document.getElementById('adminFixtureTime').value;
    const venue = document.getElementById('adminFixtureVenue').value.trim() || 'PalTalk Room';
    const host = document.getElementById('adminFixtureHost').value.trim() || '';
    
    if (!team1 || !team2) {
        showNotification('⚠️ Please select both teams!', 'danger');
        return;
    }
    if (team1 === team2) {
        showNotification('⚠️ Teams must be different!', 'danger');
        return;
    }
    if (!date) {
        showNotification('⚠️ Please select a date!', 'danger');
        return;
    }
    
    // Team names ko IDs se convert karein
    const team1Name = getTeamNameById(team1);
    const team2Name = getTeamNameById(team2);
    
    const dateTime = date + (time ? 'T' + time : '');
    
    socket.emit('createFixture', {
        team1: team1Name,
        team2: team2Name,
        date: dateTime,
        venue: venue,
        host: host
    });
    
    // Clear form
    ['adminFixtureDate', 'adminFixtureTime', 'adminFixtureVenue', 'adminFixtureHost']
        .forEach(id => document.getElementById(id).value = '');
    
    showNotification(`📅 Fixture created: ${team1Name} vs ${team2Name}`, 'success');
}
// ============================================
// ADMIN - MATCH COMPLETE WITH SCORE
// ============================================
// ============================================
// ADMIN - COMPLETE MATCH - WINNER DROPDOWN
// ============================================

function updateWinnerSelect(fixtures, fixtureId) {
    const select = document.getElementById('adminWinnerSelect');
    if (!select) return;
    
    const fixture = fixtures.matches.find(m => m.id === fixtureId);
    if (!fixture) {
        select.innerHTML = '<option value="">Select Winner</option>';
        return;
    }
    
    const teams = [fixture.team1, fixture.team2];
    select.innerHTML = `
        <option value="">Select Winner</option>
        ${teams.map(t => `<option value="${t}">${t}</option>`).join('')}
    `;
}

function updateCompleteMatchForm() {
    const fixtureId = document.getElementById('adminCompleteMatchSelect').value;
    if (!fixtureId) {
        document.getElementById('adminWinnerSelect').innerHTML = '<option value="">Select Winner</option>';
        return;
    }
    updateWinnerSelect(window.fixtures, fixtureId);
}
// Complete Match from Admin
function completeMatchFromAdmin() {
    const fixtureId = document.getElementById('adminCompleteMatchSelect').value;
    const team1Runs = parseInt(document.getElementById('adminTeam1Runs').value);
    const team1Overs = parseFloat(document.getElementById('adminTeam1Overs').value);
    const team2Runs = parseInt(document.getElementById('adminTeam2Runs').value);
    const team2Overs = parseFloat(document.getElementById('adminTeam2Overs').value);
    const winner = document.getElementById('adminWinnerSelect').value;
    const round = parseInt(document.getElementById('adminRoundSelect')?.value || 1);

    // ✅ Validation
    if (!fixtureId) {
        showNotification('⚠️ Please select a match!', 'danger');
        return;
    }
    if (isNaN(team1Runs) || isNaN(team2Runs) || team1Runs < 0 || team2Runs < 0) {
        showNotification('⚠️ Please enter valid runs for both teams (>= 0)!', 'danger');
        return;
    }
    if (isNaN(team1Overs) || isNaN(team2Overs) || team1Overs <= 0 || team2Overs <= 0) {
        showNotification('⚠️ Please enter valid overs for both teams (> 0)!', 'danger');
        return;
    }
    if (!winner) {
        showNotification('⚠️ Please select the winner!', 'danger');
        return;
    }

    // ✅ Duplicate check
    const fixtures = window.fixtures || { matches: [] };
    const fixture = fixtures.matches.find(m => m.id === fixtureId);
    if (fixture && fixture.status === 'completed') {
        showNotification('⚠️ This match is already completed!', 'danger');
        return;
    }

    const manOfMatch = 'Not Applicable';

    socket.emit('completeFixtureWithScore', {
        fixtureId: fixtureId,
        team1Runs: team1Runs,
        team1Overs: team1Overs,
        team2Runs: team2Runs,
        team2Overs: team2Overs,
        winner: winner,
        manOfMatch: manOfMatch,
        round: round
    });

    // Form clear
    document.getElementById('adminCompleteMatchSelect').value = '';
    document.getElementById('adminTeam1Runs').value = '';
    document.getElementById('adminTeam1Overs').value = '4';
    document.getElementById('adminTeam2Runs').value = '';
    document.getElementById('adminTeam2Overs').value = '4';
    document.getElementById('adminWinnerSelect').innerHTML = '<option value="">Select Winner</option>';

    showNotification(`✅ Match completed! Winner: ${winner}`, 'success');
}
// ============================================
// ADMIN - MATCH RESULT EDIT/DELETE
// ============================================

// Edit Match Result
function editMatchResult(resultId) {
    fetch(`/api/matches/${resultId}`)
        .then(res => res.json())
        .then(match => {
            const team1Runs = prompt(`Team 1 (${match.team1}) Runs:`, match.team1Runs);
            if (team1Runs === null) return;
            const team1Overs = prompt(`Team 1 Overs:`, match.team1Overs);
            if (team1Overs === null) return;
            const team2Runs = prompt(`Team 2 (${match.team2}) Runs:`, match.team2Runs);
            if (team2Runs === null) return;
            const team2Overs = prompt(`Team 2 Overs:`, match.team2Overs);
            if (team2Overs === null) return;
            const winner = prompt(`Winner (${match.team1}/${match.team2}):`, match.winner);
            if (winner === null) return;

            fetch('/api/matches/update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: resultId,
                    team1Runs: parseInt(team1Runs),
                    team1Overs: parseFloat(team1Overs),
                    team2Runs: parseInt(team2Runs),
                    team2Overs: parseFloat(team2Overs),
                    winner: winner
                })
            })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    showNotification('✅ Match result updated!', 'success');
                    socket.emit('getFixtures');
                    socket.emit('getPointsTable');
                    updateAdminResultsList();
                } else {
                    showNotification(`❌ Update failed: ${data.error}`, 'danger');
                }
            })
            .catch(err => {
                showNotification('❌ Error updating match', 'danger');
                console.error(err);
            });
        })
        .catch(err => {
            showNotification('❌ Error fetching match data', 'danger');
            console.error(err);
        });
}

// Delete Match Result
function deleteMatchResult(resultId) {
    if (!confirm('Are you sure you want to delete this match result?')) return;

    fetch('/api/matches/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: resultId })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            showNotification('🗑️ Match result deleted!', 'warning');
            socket.emit('getFixtures');
            socket.emit('getPointsTable');
            updateAdminResultsList();
        } else {
            showNotification(`❌ Delete failed: ${data.error}`, 'danger');
        }
    })
    .catch(err => {
        showNotification('❌ Error deleting match', 'danger');
        console.error(err);
    });
}

// Update Admin Results List
function updateAdminResultsList() {
    const container = document.getElementById('adminResultsList');
    if (!container) return;

    const fixtures = window.fixtures || { matches: [] };
    const completed = fixtures.matches.filter(f => f.status === 'completed');

    if (completed.length === 0) {
        container.innerHTML = '<p class="empty-message">No match results yet.</p>';
        return;
    }

    container.innerHTML = completed.map(f => `
        <div class="fixture-card" style="border-left-color: var(--success);">
            <div class="fixture-header">
                <div class="teams">🏏 ${f.team1} vs ${f.team2}</div>
                <div class="fixture-actions">
                    <button class="edit-btn" onclick="editMatchResult('${f.id}')">✏️ Edit</button>
                    <button class="delete-btn" onclick="deleteMatchResult('${f.id}')">🗑️</button>
                </div>
            </div>
            <div class="meta">
                🏆 Winner: ${f.result || f.winner}
                ${f.team1Runs ? `| ${f.team1}: ${f.team1Runs}/${f.team1Wickets || 0} (${f.team1Overs || 4} ov)` : ''}
                ${f.team2Runs ? `| ${f.team2}: ${f.team2Runs}/${f.team2Wickets || 0} (${f.team2Overs || 4} ov)` : ''}
                | 📅 ${new Date(f.date).toLocaleDateString()}
            </div>
        </div>
    `).join('');
}

// Update admin teams list
function updateAdminTeamsList() {
    const container = document.getElementById('adminTeamsList');
    if (!container) return;
    
    if (!teams || teams.length === 0) {
        container.innerHTML = '<p class="empty-message">No teams created yet.</p>';
        return;
    }
    
    container.innerHTML = teams.map(team => `
        <div class="team-card">
            <div class="team-header">
                <span class="team-name-card">🏏 ${team.name}</span>
                <div class="team-actions">
                    <button class="edit-btn" onclick="editTeam('${team.id}')">✏️ Edit</button>
                    <button class="delete-btn" onclick="deleteTeam('${team.id}')">🗑️</button>
                </div>
            </div>
            <div class="team-details">
                <span class="captain">🧢 Captain: ${team.captain || 'N/A'}</span>
                <span class="vice-captain"> | 🧢 Vice Captain: ${team.viceCaptain || 'N/A'}</span>
            </div>
            <div class="team-squad">
                ${(team.squad || []).map(p => `
                    <span class="squad-tag">${p}</span>
                `).join('')}
            </div>
        </div>
    `).join('');
}

// Update admin fixtures list
function updateAdminFixturesList() {
    const container = document.getElementById('adminFixturesList');
    if (!container) return;
    
    const fixtures = window.fixtures || { matches: [] };
    if (!fixtures.matches || fixtures.matches.length === 0) {
        container.innerHTML = '<p class="empty-message">No fixtures created yet.</p>';
        return;
    }
    
    container.innerHTML = fixtures.matches.map(f => {
        const team1Name = getTeamNameById(f.team1);
        const team2Name = getTeamNameById(f.team2);
        
        return `
            <div class="fixture-card">
                <div class="fixture-header">
                    <div class="teams">🏏 ${team1Name} vs ${team2Name}</div>
                    <div class="fixture-actions">
                        <button class="edit-btn" onclick="editFixture('${f.id}')">✏️ Edit</button>
                        <button class="delete-btn" onclick="deleteFixture('${f.id}')">🗑️</button>
                    </div>
                </div>
                <div class="meta">
                    📅 ${new Date(f.date).toLocaleString()} | 📍 ${f.venue || 'PalTalk Room'}
                    ${f.host ? `| 🎙️ Host: ${f.host}` : ''}
                    | Status: ${f.status.toUpperCase()}
                    ${f.result ? `| Winner: 🏆 ${f.result}` : ''}
                </div>
            </div>
        `;
    }).join('');
}
// Update admin results list
function updateAdminResultsList() {
    const container = document.getElementById('adminResultsList');
    if (!container) return;
    
    const fixtures = window.fixtures || { matches: [] };
    const completed = fixtures.matches.filter(f => f.status === 'completed');
    
    if (completed.length === 0) {
        container.innerHTML = '<p class="empty-message">No match results yet.</p>';
        return;
    }
    
    container.innerHTML = completed.map(f => `
        <div class="fixture-card" style="border-left-color: var(--success);">
            <div class="teams">🏏 ${f.team1} vs ${f.team2}</div>
            <div class="meta">
                🏆 Winner: ${f.result}
                ${f.manOfMatch ? `| ⭐ MOM: ${f.manOfMatch}` : ''}
                | 📅 ${new Date(f.date).toLocaleDateString()}
            </div>
        </div>
    `).join('');
}
// ============================================
// DATA BACKUP - DOWNLOAD
// ============================================

function downloadData(type) {
    let url = '/api/export/points-table';
    if (type === 'top10') url = '/api/export/top10';
    else if (type === 'all') url = '/api/export/all';
    
    fetch(url)
        .then(res => res.json())
        .then(data => {
            let csv = '';
            if (type === 'points-table' || type === 'all') {
                csv += '=== POINTS TABLE ===\n';
                csv += 'Rank,Team,Group,Matches,Wins,Losses,Points,NRR\n';
                const table = type === 'all' ? data.pointsTable : data;
                table.forEach(t => {
                    csv += `${t.rank},${t.name},${t.group || '-'},${t.matches},${t.wins},${t.losses},${t.points},${t.netRunRate}\n`;
                });
            }
            
            if (type === 'top10' || type === 'all') {
                const batsmen = type === 'all' ? data.topBatsmen : data.batsmen;
                csv += '\n=== TOP BATSMEN ===\n';
                csv += 'Player,Runs,Balls,Fours,Sixes,Avg,SR\n';
                batsmen.forEach(p => {
                    csv += `${p.name},${p.runs},${p.balls},${p.fours},${p.sixes},${p.average},${p.strikeRate}\n`;
                });
                
                const bowlers = type === 'all' ? data.topBowlers : data.bowlers;
                csv += '\n=== TOP BOWLERS ===\n';
                csv += 'Player,Wickets,Balls,Runs,Economy,Best\n';
                bowlers.forEach(p => {
                    csv += `${p.name},${p.wickets},${p.balls},${p.runsConceded},${p.economy},${p.best}\n`;
                });
            }
            
            downloadCSV(csv);
        })
        .catch(err => {
            showNotification('❌ Error downloading data', 'danger');
            console.error(err);
        });
}

function downloadCSV(csv) {
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gcl-data-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showNotification('✅ Data downloaded!', 'success');
}

// Override socket events for admin updates
// Add this to existing socket.on('teamsList') and socket.on('fixturesUpdate')
// Already existing in code, just ensure admin lists update
/*function updateCompleteFixtureSelect(fixtures) {
    const select = document.getElementById('adminCompleteMatch');
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
}*/
// ============================================
// HELPER FUNCTION: Get Team Name by ID
// ============================================

function getTeamNameById(teamId) {
    // Agar teamId already string hai (name)
    if (typeof teamId === 'string' && isNaN(teamId)) {
        return teamId;
    }
    
    // Team ko ID se find karein
    const team = teams.find(t => t.id === teamId);
    if (team) {
        return team.name;
    }
    
    // Agar nahi mila toh ID return karein
    return teamId || 'Unknown Team';
}
// ============================================
// LIVE SCORE FUNCTIONS
// ============================================

let liveScoreData = {
    battingTeam: '',
    bowlingTeam: '',
    runs: 0,
    wickets: 0,
    balls: 0,
    extras: 0,
    currentOver: 0,
    currentBall: 0,
    striker: '',
    nonStriker: '',
    bowler: '',
    lastBall: '',
    batsmen: [],
    bowlers: [],
    ballByBall: []
};
/*function updateLiveScoreDisplay() {
    // Update scoreboard
    const state = liveScoreData;
    
    document.getElementById('runsDisplay').textContent = state.runs || 0;
    document.getElementById('wicketsDisplay').textContent = state.wickets || 0;
    document.getElementById('ballsDisplay').textContent = state.balls || 0;
    //document.getElementById('extrasDisplay').textContent = state.extras || 0;//
    
    if (state.striker) {
        document.getElementById('strikerName').textContent = state.striker;
    }
    if (state.nonStriker) {
        document.getElementById('nonStrikerName').textContent = state.nonStriker;
    }
    if (state.bowler) {
        document.getElementById('currentBowler').textContent = state.bowler;
    }
    
    const overDisplay = document.getElementById('currentOverDisplay');
    if (overDisplay) {
        overDisplay.textContent = `${state.currentOver || 0}.${state.currentBall || 0}`;
    }
    
    document.getElementById('strikeDisplay').textContent = state.striker || '-';
}*/

// Socket events for live score
socket.on('scoreUpdate', (data) => {
    if (data.state) {
        const state = data.state;
        liveScoreData = {
            ...liveScoreData,
            runs: state.battingTeam?.runs || 0,
            wickets: state.battingTeam?.wickets || 0,
            balls: state.battingTeam?.balls || 0,
            extras: state.battingTeam?.extras || 0,
            currentOver: state.currentOver || 0,
            currentBall: state.currentBall || 0,
            striker: state.striker || liveScoreData.striker,
            nonStriker: state.nonStriker || liveScoreData.nonStriker,
            bowler: state.currentBowlerName || liveScoreData.bowler
        };
        
        if (state.battingTeam?.name) {
            document.getElementById('battingTeamName').textContent = state.battingTeam.name;
        }
        if (state.bowlingTeam?.name) {
            document.getElementById('bowlingTeamName').textContent = state.bowlingTeam.name;
        }
        if (state.target) {
            document.getElementById('targetDisplay').textContent = `Target: ${state.target}`;
        }
        
        updateLiveScoreDisplay();
        
        // Update last ball
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
            document.getElementById('lastBallDisplay').textContent = `Last Ball: ${displayText}`;
            
            // Add to ball-by-ball
            addBallByBall(state.currentOver, state.currentBall, displayText);
        }
    }
    
    if (data.result && data.result.message) {
        showNotification(data.result.message, 
            data.result.isOut ? 'danger' : 
            data.result.isWide ? 'warning' : 'success'
        );
    }
});

function addBallByBall(over, ball, result) {
    const container = document.getElementById('ballByBall');
    if (!container) return;
    
    const entry = document.createElement('div');
    entry.className = 'ball-entry';
    entry.innerHTML = `
        <span class="ball-over">Over ${over}.${ball}</span>
        <span class="ball-result">${result}</span>
    `;
    
    container.prepend(entry);
    
    // Keep only last 20 balls
    while (container.children.length > 20) {
        container.removeChild(container.lastChild);
    }
}

// Reset live score display on match reset
socket.on('stateUpdate', (state) => {
    if (state && state.isActive === false) {
        // Reset display
        document.getElementById('runsDisplay').textContent = '0';
        document.getElementById('wicketsDisplay').textContent = '0';
        document.getElementById('ballsDisplay').textContent = '0';
        document.getElementById('extrasDisplay').textContent = '0';
        document.getElementById('lastBallDisplay').textContent = 'Last Ball: -';
        document.getElementById('strikerName').textContent = '-';
        document.getElementById('nonStrikerName').textContent = '-';
        document.getElementById('currentBowler').textContent = '-';
        document.getElementById('ballByBall').innerHTML = '<p class="empty-message">No balls bowled yet</p>';
    }
});
// ============================================
// ADMIN - FIXTURE EDIT/DELETE
// ============================================

/*window.editFixture = function(fixtureId) {
    const fixtures = window.fixtures || { matches: [] };
    const fixture = fixtures.matches.find(f => f.id === fixtureId);
    if (!fixture) {
        showNotification('⚠️ Fixture not found!', 'danger');
        return;
    }
    
    const team1Name = getTeamNameById(fixture.team1);
    const team2Name = getTeamNameById(fixture.team2);
    
    // Show edit prompt
    const message = `✏️ EDIT FIXTURE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Current Details:
Team 1: ${team1Name}
Team 2: ${team2Name}
Date: ${new Date(fixture.date).toLocaleString()}
Venue: ${fixture.venue || 'PalTalk Room'}
Host: ${fixture.host || 'Not set'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Enter new details (comma separated):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Format: Team 1, Team 2, Date (YYYY-MM-DD), Time (HH:MM), Venue, Host

Example: Delhi Capitals, SRH, 2026-08-25, 21:30, PalTalk Room, Gemstar`;

    const input = prompt(message, 
        `${team1Name}, ${team2Name}, ${new Date(fixture.date).toISOString().split('T')[0]}, 21:30, ${fixture.venue || 'PalTalk Room'}, ${fixture.host || ''}`
    );
    
    if (input === null) return;
    
    const parts = input.split(',').map(p => p.trim()).filter(p => p);
    if (parts.length < 4) {
        showNotification('⚠️ Please enter at least: Team1, Team2, Date, Time', 'danger');
        return;
    }
    
    const newTeam1 = parts[0];
    const newTeam2 = parts[1];
    const newDate = parts[2];
    const newTime = parts[3];
    const newVenue = parts[4] || 'PalTalk Room';
    const newHost = parts[5] || '';
    
    const dateTime = newDate + 'T' + newTime;
    
    const updatedFixture = {
        ...fixture,
        team1: newTeam1,
        team2: newTeam2,
        date: dateTime,
        venue: newVenue,
        host: newHost
    };
    
    // Send update to server
    fetch('/api/fixtures/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedFixture)
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            showNotification(`✅ Fixture updated: ${newTeam1} vs ${newTeam2}`, 'success');
            socket.emit('getFixtures');
        } else {
            showNotification(`❌ Update failed: ${data.error}`, 'danger');
        }
    })
    .catch(err => {
        showNotification('❌ Error updating fixture', 'danger');
        console.error(err);
    });
}*/

function deleteFixture(fixtureId) {
    if (!confirm('Are you sure you want to delete this fixture?')) return;
    
    fetch('/api/fixtures/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: fixtureId })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            showNotification(`🗑️ Fixture deleted!`, 'warning');
            socket.emit('getFixtures');
        } else {
            showNotification(`❌ Delete failed: ${data.error}`, 'danger');
        }
    })
    .catch(err => {
        showNotification('❌ Error deleting fixture', 'danger');
        console.error(err);
    });
}
// ============================================
// FIXTURES - ADMIN CORNER
// ============================================

const FIXTURE_ADMIN_PASSWORD = "gcl2026";
let fixtureAdminMode = false;

function toggleFixtureAdmin() {
    const login = document.getElementById('fixtureAdminLogin');
    if (login.style.display === 'flex') {
        login.style.display = 'none';
    } else {
        login.style.display = 'flex';
        document.getElementById('fixtureAdminPassword').value = '';
        document.getElementById('fixtureAdminError').style.display = 'none';
    }
}

function checkFixtureAdminPassword() {
    const password = document.getElementById('fixtureAdminPassword').value;
    const error = document.getElementById('fixtureAdminError');
    
    if (password === FIXTURE_ADMIN_PASSWORD) {
        fixtureAdminMode = true;
        document.getElementById('fixtureAdminLogin').style.display = 'none';
        document.getElementById('fixtureAdminBar').style.display = 'flex';
        showNotification('✅ Fixtures admin access granted!', 'success');
        socket.emit('getFixtures');
    } else {
        error.style.display = 'block';
        document.getElementById('fixtureAdminPassword').value = '';
        showNotification('❌ Incorrect password!', 'danger');
    }
}

function logoutFixtureAdmin() {
    fixtureAdminMode = false;
    document.getElementById('fixtureAdminBar').style.display = 'none';
    document.getElementById('fixtureAdminLogin').style.display = 'none';
    showNotification('🔒 Logged out from fixtures admin', 'warning');
    socket.emit('getFixtures');
}

// Enter key support
document.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && document.getElementById('fixtureAdminPassword') === document.activeElement) {
        checkFixtureAdminPassword();
    }
});
// ============================================
// FIXTURE EDIT/DELETE FUNCTIONS
// ============================================

function editFixture(fixtureId) {
    const fixtures = window.fixtures || { matches: [] };
    const fixture = fixtures.matches.find(f => f.id === fixtureId);
    if (!fixture) {
        showNotification('⚠️ Fixture not found!', 'danger');
        return;
    }
    
    const team1Name = getTeamNameById(fixture.team1);
    const team2Name = getTeamNameById(fixture.team2);
    
    const message = `✏️ EDIT FIXTURE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Current Details:
Team 1: ${team1Name}
Team 2: ${team2Name}
Date: ${new Date(fixture.date).toLocaleString()}
Venue: ${fixture.venue || 'PalTalk Room'}
Host: ${fixture.host || 'Not set'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Enter new details (comma separated):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Format: Team 1, Team 2, Date (YYYY-MM-DD), Time (HH:MM), Venue, Host

Example: Delhi Capitals, SRH, 2026-08-25, 21:30, PalTalk Room, Gemstar`;

    const input = prompt(message, 
        `${team1Name}, ${team2Name}, ${new Date(fixture.date).toISOString().split('T')[0]}, 21:30, ${fixture.venue || 'PalTalk Room'}, ${fixture.host || ''}`
    );
    
    if (input === null) return;
    
    const parts = input.split(',').map(p => p.trim()).filter(p => p);
    if (parts.length < 4) {
        showNotification('⚠️ Please enter at least: Team1, Team2, Date, Time', 'danger');
        return;
    }
    
    const newTeam1 = parts[0];
    const newTeam2 = parts[1];
    const newDate = parts[2];
    const newTime = parts[3];
    const newVenue = parts[4] || 'PalTalk Room';
    const newHost = parts[5] || '';
    
    const dateTime = newDate + 'T' + newTime;
    
    const updatedFixture = {
        ...fixture,
        team1: newTeam1,
        team2: newTeam2,
        date: dateTime,
        venue: newVenue,
        host: newHost
    };
    
    fetch('/api/fixtures/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedFixture)
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            showNotification(`✅ Fixture updated: ${newTeam1} vs ${newTeam2}`, 'success');
            socket.emit('getFixtures');
        } else {
            showNotification(`❌ Update failed: ${data.error}`, 'danger');
        }
    })
    .catch(err => {
        showNotification('❌ Error updating fixture', 'danger');
        console.error(err);
    });
}

function deleteFixture(fixtureId) {
    if (!confirm('Are you sure you want to delete this fixture?')) return;
    
    fetch('/api/fixtures/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: fixtureId })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            showNotification(`🗑️ Fixture deleted!`, 'warning');
            socket.emit('getFixtures');
        } else {
            showNotification(`❌ Delete failed: ${data.error}`, 'danger');
        }
    })
    .catch(err => {
        showNotification('❌ Error deleting fixture', 'danger');
        console.error(err);
    });
}
// ============================================
// TEAMS GROUPING / AUCTION
// ============================================

let teamsGroupingData = {
    available: [],
    groupA: [],
    groupB: []
};
let lastAssignedGroup = 'A';

function updateTeamsGrouping() {
    fetch('/api/teams')
        .then(res => res.json())
        .then(teams => {
            teamsGroupingData.available = teams.filter(t => !t.group || t.group === null);
            teamsGroupingData.groupA = teams.filter(t => t.group === 'A');
            teamsGroupingData.groupB = teams.filter(t => t.group === 'B');
            renderTeamsGrouping();
            socket.emit('getPointsTable');
        })
        .catch(err => console.error('Error fetching teams for grouping:', err));
}

function renderTeamsGrouping() {
    // Available Teams
    const availableContainer = document.getElementById('availableTeamsList');
    if (availableContainer) {
        if (teamsGroupingData.available.length === 0) {
            availableContainer.innerHTML = '<p class="empty-message">No teams available</p>';
        } else {
           availableContainer.innerHTML = teamsGroupingData.available.map((team, index) => `
    <div class="team-item">
        <span class="team-name">${index + 1}. ${team.name || 'Unnamed Team'}</span>
    </div>
`).join('');
        }
    }
    
    // Group A
    const groupAContainer = document.getElementById('groupAList');
    if (groupAContainer) {
        if (teamsGroupingData.groupA.length === 0) {
            groupAContainer.innerHTML = '<p class="empty-message">No teams</p>';
        } else {
            groupAContainer.innerHTML = teamsGroupingData.groupA.map(team => `
                <div class="team-item group-team">
                    <span class="team-name">🏏 ${team.name || 'Unnamed Team'}</span>
                    <div class="team-actions">
                        <button class="edit-btn" onclick="editGroupTeam('${team.id}')">✏️</button>
                        <button class="delete-btn" onclick="removeTeamFromGroup('${team.id}')">🗑️</button>
                    </div>
                </div>
            `).join('');
        }
    }
    
    // Group B
    const groupBContainer = document.getElementById('groupBList');
    if (groupBContainer) {
        if (teamsGroupingData.groupB.length === 0) {
            groupBContainer.innerHTML = '<p class="empty-message">No teams</p>';
        } else {
            groupBContainer.innerHTML = teamsGroupingData.groupB.map(team => `
                <div class="team-item group-team">
                    <span class="team-name">🏏 ${team.name || 'Unnamed Team'}</span>
                    <div class="team-actions">
                        <button class="edit-btn" onclick="editGroupTeam('${team.id}')">✏️</button>
                        <button class="delete-btn" onclick="removeTeamFromGroup('${team.id}')">🗑️</button>
                    </div>
                </div>
            `).join('');
        }
    }
}
function pickRandomTeam() {
    if (teamsGroupingData.available.length === 0) {
        showNotification('⚠️ No teams available to pick!', 'danger');
        return;
    }
    
    const randomIndex = Math.floor(Math.random() * teamsGroupingData.available.length);
    const team = teamsGroupingData.available[randomIndex];
    
    const group = lastAssignedGroup === 'B' ? 'A' : 'B';
    lastAssignedGroup = group;
    
    // ✅ Full screen flashy effect
    showTeamReveal(team, group);
}

function showTeamReveal(team, group) {
    // ✅ Null check
    if (!team || !team.name) {
        showNotification('⚠️ Team not found! Please refresh and try again.', 'danger');
        return;
    }
    
    const overlay = document.createElement('div');
    overlay.className = 'player-reveal-overlay';
    overlay.id = 'teamRevealOverlay';
    overlay.innerHTML = `
        <div class="player-reveal-content">
            <div class="player-reveal-close" onclick="closeTeamReveal()">✕</div>
            <div class="player-reveal-card">
                <div class="player-reveal-icon">🏏</div>
                <div class="player-reveal-name">${team.name.toUpperCase()}</div>
                <div class="player-reveal-sub" style="font-size:1.5rem;color:#ffd700;margin:10px 0;">→ Assigned to <strong>Group ${group}</strong> ✅</div>
                <div class="player-reveal-actions">
                    <button onclick="confirmTeamAssign('${team.id}', '${group}')" class="assign-btn">✅ Confirm</button>
                    <button onclick="closeTeamReveal()" class="again-btn">🔄 Re-pick</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    showNotification(`🏏 ${team.name} → Group ${group}`, 'warning');
}

function closeTeamReveal() {
    const overlay = document.getElementById('teamRevealOverlay');
    if (overlay) overlay.remove();
}

function confirmTeamAssign(teamId, group) {
    closeTeamReveal();
    assignTeamToGroup(teamId, group);
}
   
   /* const message = document.getElementById('groupingMessage');
    if (message) {
        message.innerHTML = `🏏 ${team.name} → Assigned to <strong>Group ${group}</strong> ✅`;
        message.className = 'grouping-message success';
        setTimeout(() => {
            message.className = 'grouping-message';
            message.innerHTML = '';
        }, 3000);
    }*/

function assignTeamToGroup(teamId, group) {
    // ✅ Immediate UI update
    const teamIndex = teamsGroupingData.available.findIndex(t => t.id === teamId);
    if (teamIndex !== -1) {
        const team = teamsGroupingData.available.splice(teamIndex, 1)[0];
        team.group = group;
        if (group === 'A') {
            teamsGroupingData.groupA.push(team);
        } else {
            teamsGroupingData.groupB.push(team);
        }
        renderTeamsGrouping();
        // ✅ Points table update
        socket.emit('getPointsTable');
    }
    
    // ✅ Naya endpoint use karein - Sirf group update
    fetch('/api/teams/update-group', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            id: teamId,
            group: group
        })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            showNotification(`✅ Team assigned to Group ${group}!`, 'success');
            // ✅ REMOVE - updateTeamsGrouping() data corrupt karta hai
        }
    })
    .catch(err => {
        showNotification('❌ Error assigning team', 'danger');
        console.error(err);
        // ✅ Rollback on failure
        updateTeamsGrouping();
    });
}

// ✅ Points Table Group Update Helper
function updatePointsTableGroup(element, data) {
    if (!data || data.length === 0) {
        element.innerHTML = '<tr><td colspan="7" class="empty-message">No data available</td></tr>';
        return;
    }
    
    element.innerHTML = data.map(team => {
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
function removeTeamFromGroup(teamId) {
    if (!confirm('Remove this team from group? It will become available again.')) return;
    
    fetch('/api/teams/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            id: teamId,
            group: null
        })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            showNotification('🗑️ Team removed from group', 'warning');
            updateTeamsGrouping();  // ✅ Group Status update
            
            // ✅ Points Table update — saari teams ka fresh data fetch karein
            socket.emit('getPointsTable');
            
            // ✅ Manual fetch bhi karein (surety ke liye)
            fetch('/api/points-table')
                .then(res => res.json())
                .then(tableData => {
                    updatePointsTable(tableData);
                })
                .catch(err => console.error('Error fetching points table:', err));
        } else {
            showNotification(`❌ Failed: ${data.error}`, 'danger');
        }
    })
    .catch(err => {
        showNotification('❌ Error removing team', 'danger');
        console.error(err);
    });
}
function editGroupTeam(teamId) {
    const allTeams = [...teamsGroupingData.available, ...teamsGroupingData.groupA, ...teamsGroupingData.groupB];
    const team = allTeams.find(t => t.id === teamId);
    if (!team) {
        showNotification('⚠️ Team not found!', 'danger');
        return;
    }
    
    const newName = prompt('Edit Team Name:', team.name);
    if (newName === null) return;
    
    const newGroup = prompt(`Edit Group (A/B) for ${newName}:`, team.group || '');
    if (newGroup === null) return;
    
    const updatedTeam = {
        ...team,
        name: newName.trim(),
        group: newGroup.toUpperCase() === 'A' ? 'A' : newGroup.toUpperCase() === 'B' ? 'B' : null
    };
    
    fetch('/api/teams/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedTeam)
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            showNotification(`✅ Team updated!`, 'success');
            updateTeamsGrouping();
            socket.emit('getPointsTable');
        } else {
            showNotification(`❌ Update failed: ${data.error}`, 'danger');
        }
    })
    .catch(err => {
        showNotification('❌ Error updating team', 'danger');
        console.error(err);
    });
}
// ============================================
// LIVE SCORE — NEW FUNCTIONS
// ============================================

// ============================================
// 1. ADMIN LOCK FUNCTIONS
// ============================================

let isAdminMode = false;

let allPlayers = [];
let batsmanScoreSet = false;
let currentMatchState = null;

function toggleAdminLock() {
    document.getElementById('adminLoginPopup').style.display = 'flex';
    document.getElementById('adminPasswordInput').value = '';
    document.getElementById('adminLoginError').style.display = 'none';
}

function closeAdminLogin() {
    document.getElementById('adminLoginPopup').style.display = 'none';
}

/*function checkLiveScorePassword() {
    const input = document.getElementById('adminPasswordInput').value;
    if (input === ADMIN_PASSWORD) {
        isAdminMode = true;
        const teamSelection = document.querySelector('.team-selection');
        if (teamSelection) teamSelection.style.display = 'block';
        document.getElementById('adminLoginPopup').style.display = 'none';
        document.getElementById('adminModeStatus').textContent = '👑 Admin Mode';
        document.getElementById('adminModeStatus').className = 'admin-status admin-mode';
        document.getElementById('adminLockBtn').style.display = 'none';
        document.getElementById('adminLogoutBtn').style.display = 'inline-block';
        document.querySelector('.game-controls').style.display = 'grid';
        document.querySelectorAll('.ball-edit-btn').forEach(b => b.style.display = 'inline-block');
        document.querySelectorAll('.ball-delete-btn').forEach(b => b.style.display = 'inline-block');
        const resetBtn = document.getElementById('resetMatchBtn');
        if (resetBtn) resetBtn.style.display = 'inline-block';
        showNotification('✅ Admin Mode Activated!', 'success');
    } else {
        document.getElementById('adminLoginError').style.display = 'block';
        document.getElementById('adminPasswordInput').value = '';
        document.getElementById('adminPasswordInput').focus();
    }
}

function logoutAdmin() {
    isAdminMode = false;
    document.getElementById('adminModeStatus').textContent = '👤 Read-Only Mode';
    document.getElementById('adminModeStatus').className = 'admin-status read-only';
    document.getElementById('adminLockBtn').style.display = 'inline-block';
    document.getElementById('adminLogoutBtn').style.display = 'none';
    document.querySelector('.game-controls').style.display = 'none';
    document.querySelectorAll('.ball-edit-btn').forEach(b => b.style.display = 'none');
    document.querySelectorAll('.ball-delete-btn').forEach(b => b.style.display = 'none');
    const resetBtn = document.getElementById('resetMatchBtn');
    if (resetBtn) resetBtn.style.display = 'none';
    showNotification('🔒 Logged out from Admin Mode', 'warning');
}*/

// ============================================
// 2. DROPDOWN POPULATE FUNCTIONS
// ============================================

/*function populateDropdowns(teams) {
    const players = [];
    teams.forEach(team => {
        if (team.captain) players.push(team.captain);
        if (team.viceCaptain) players.push(team.viceCaptain);
        if (team.squad) {
            team.squad.forEach(p => {
                if (p && !players.includes(p)) players.push(p);
            });
        }
    });
    allPlayers = players;
    
    // Populate Batsman Dropdown
    const batsmanSelect = document.getElementById('batsmanSelect');
    if (batsmanSelect) {
        batsmanSelect.innerHTML = '<option value="">Select Batsman...</option><option value="__manual__">✏️ Type manually...</option>';
        players.forEach(p => {
            const option = document.createElement('option');
            option.value = p;
            option.textContent = p;
            batsmanSelect.appendChild(option);
        });
    }
    
    // Populate Bowler Dropdown
    const bowlerSelect = document.getElementById('bowlerSelect');
    if (bowlerSelect) {
        bowlerSelect.innerHTML = '<option value="">Select Bowler...</option><option value="__manual__">✏️ Type manually...</option>';
        players.forEach(p => {
            const option = document.createElement('option');
            option.value = p;
            option.textContent = p;
            bowlerSelect.appendChild(option);
        });
    }
}

// Override socket connection to populate dropdowns
socket.on('teamsList', (teams) => {
    populateDropdowns(teams);
});

// Also request teams on connect
socket.emit('getTeams');*/

// ============================================
// 3. SUBMIT FUNCTIONS
// ============================================

/*function submitBatScore() {
    if (!isAdminMode) {
        showNotification('⚠️ Admin login required!', 'danger');
        return;
    }
    
    const select = document.getElementById('batsmanSelect');
    let name = select.value;
    if (name === '__manual__') {
        name = prompt('Enter batsman name:');
        if (!name || name.trim() === '') {
            showNotification('⚠️ Please enter batsman name!', 'danger');
            return;
        }
        name = name.trim();
    }
    if (!name || name === '') {
        showNotification('⚠️ Please select batsman!', 'danger');
        return;
    }
    
    const score = parseInt(document.getElementById('batsmanScoreInput').value);
    if (isNaN(score) || score < 3 || score > 6) {
        showNotification('⚠️ Score must be 3, 4, 5, or 6!', 'danger');
        return;
    }
    
    socket.emit('batsmanSetScore', { name, score });
}*?

/*function submitBowlGuess() {
    if (!isAdminMode) {
        showNotification('⚠️ Admin login required!', 'danger');
        return;
    }
    
    if (!batsmanScoreSet) {
        showNotification('⚠️ Batsman has not set score yet! Bowler cannot guess first.', 'danger');
        return;
    }
    
    const select = document.getElementById('bowlerSelect');
    let name = select.value;
    if (name === '__manual__') {
        name = prompt('Enter bowler name:');
        if (!name || name.trim() === '') {
            showNotification('⚠️ Please enter bowler name!', 'danger');
            return;
        }
        name = name.trim();
    }
    if (!name || name === '') {
        showNotification('⚠️ Please select bowler!', 'danger');
        return;
    }
    
    const guess = parseInt(document.getElementById('bowlerGuessInput').value);
    if (isNaN(guess) || guess < 3 || guess > 6) {
        showNotification('⚠️ Guess must be 3, 4, 5, or 6!', 'danger');
        return;
    }
    
    socket.emit('bowlerGuess', { name, guess });
}*/

// ============================================
// 4. MATCH STATE UPDATE
// ============================================

/*function updateMatchState(state) {
    // Update team selection dropdowns
if (state.battingTeam && state.bowlingTeam) {
    currentMatchTeams.team1 = state.battingTeam.name;
    currentMatchTeams.team2 = state.bowlingTeam.name;
    populateTeamDropdowns(state.battingTeam.name, state.bowlingTeam.name);
}
    if (!state) return;
    currentMatchState = state;
    
    // Update scoreboard
    if (state.battingTeam) {
        const battingName = document.getElementById('battingTeamName');
        if (battingName) battingName.textContent = state.battingTeam.name || 'Team 1';
        
        const runs = document.getElementById('runsDisplay');
        if (runs) runs.textContent = state.battingTeam.runs || 0;
        
        const wickets = document.getElementById('wicketsDisplay');
        if (wickets) wickets.textContent = state.battingTeam.wickets || 0;
        
        const balls = document.getElementById('ballsDisplay');
        if (balls) balls.textContent = state.battingTeam.balls || 0;
        
        const extras = document.getElementById('extrasDisplay');
        if (extras) extras.textContent = state.battingTeam.extras || 0;
    }
    
    if (state.bowlingTeam) {
        const bowlingName = document.getElementById('bowlingTeamName');
        if (bowlingName) bowlingName.textContent = state.bowlingTeam.name || 'Team 2';
    }
    
    if (state.target) {
        const targetDisplay = document.getElementById('targetDisplay');
        if (targetDisplay) targetDisplay.textContent = `Target: ${state.target}`;
    }
    
    // Update batsmen
    if (state.striker) {
        const strikerName = document.getElementById('strikerName');
        if (strikerName) strikerName.textContent = state.striker;
    }
    if (state.nonStriker) {
        const nonStrikerName = document.getElementById('nonStrikerName');
        if (nonStrikerName) nonStrikerName.textContent = state.nonStriker;
    }
    
    // Update bowler
    if (state.currentBowlerName) {
        const currentBowler = document.getElementById('currentBowler');
        if (currentBowler) {
            currentBowler.textContent = state.currentBowlerName;
        }
    }
    
    // Update over info
    if (state.currentOver !== undefined && state.currentBall !== undefined) {
        const overDisplay = document.getElementById('currentOverDisplay');
        if (overDisplay) {
            overDisplay.textContent = `${state.currentOver}.${state.currentBall}`;
        }
    }
    
    // Update strike display
    const strikeDisplay = document.getElementById('strikeDisplay');
    if (strikeDisplay) {
        strikeDisplay.textContent = state.striker || '-';
    }
    
    // Update last ball
    if (state.lastBallResult) {
        const lastBallDisplay = document.getElementById('lastBallDisplay');
        if (lastBallDisplay) {
            lastBallDisplay.textContent = `Last Ball: ${state.lastBallResult.message || '-'}`;
        }
    }
    
    // Update no-ball status
    if (state.noBallUsed !== undefined) {
        const statusEl = document.getElementById('noBallStatus');
        if (statusEl) {
            if (state.noBallUsed) {
                statusEl.textContent = '✅ YES (1/1)';
                statusEl.className = 'noball-status yes';
            } else {
                statusEl.textContent = '❌ No';
                statusEl.className = 'noball-status no';
            }
        }
    }
    
    // Update scorecard
    updateScorecard(state);
    
    // Update ball-by-ball
    updateBallByBall(state);
}

// ============================================
// 5. SCORECARD UPDATE
// ============================================

function updateScorecard(state) {
    if (!state) return;
    
    const batsmen = state.batsmen || [];
    const batsmenContainer = document.getElementById('batsmenScorecard');
    if (batsmenContainer) {
        if (batsmen.length === 0) {
            batsmenContainer.innerHTML = '<p class="empty-message">No batsmen yet</p>';
        } else {
            let html = '';
            batsmen.forEach(b => {
                const fours = b.fours || 0;
                const sixes = b.sixes || 0;
                html += `<div class="scorecard-player">
                    <span class="sc-name">${b.name}</span>
                    <span class="sc-stats">${b.runs}(${b.balls}) ${fours}x4 ${sixes}x6</span>
                </div>`;
            });
            batsmenContainer.innerHTML = html;
        }
    }
    
    const bowlers = state.bowlers || [];
    const bowlersContainer = document.getElementById('bowlersScorecard');
    if (bowlersContainer) {
        if (bowlers.length === 0) {
            bowlersContainer.innerHTML = '<p class="empty-message">No bowlers yet</p>';
        } else {
            let html = '';
            bowlers.forEach(b => {
                html += `<div class="scorecard-player">
                    <span class="sc-name">${b.name}</span>
                    <span class="sc-stats">${b.wickets}w ${b.runsConceded}r ${b.overs}ov</span>
                </div>`;
            });
            bowlersContainer.innerHTML = html;
        }
    }
}

// ============================================
// 6. BALL-BY-BALL UPDATE
// ============================================

function updateBallByBall(state) {
    if (!state) return;
    
    const balls = state.ballLog || [];
    const container = document.getElementById('ballByBall');
    if (!container) return;
    
    if (balls.length === 0) {
        container.innerHTML = '<p class="empty-message">No balls bowled yet</p>';
        return;
    }
    
    let html = '';
    balls.forEach((ball, index) => {
        const editBtn = isAdminMode ? `<button class="ball-edit-btn" onclick="editBall(${index})" style="display:inline-block;">✏️</button>` : '';
        const deleteBtn = isAdminMode ? `<button class="ball-delete-btn" onclick="deleteBall(${index})" style="display:inline-block;">🗑️</button>` : '';
        const corrected = ball.corrected ? ' [Corrected]' : '';
        const resultClass = ball.resultClass || '';
        html += `<div class="ball-entry">
            <span class="ball-over">${ball.over || '0.0'}</span>
            <span class="ball-result ${resultClass}">${ball.result || ''}${corrected}</span>
            <span class="ball-actions">${editBtn}${deleteBtn}</span>
        </div>`;
    });
    
    container.innerHTML = html;
}*/

// ============================================
// 7. ADMIN OVERRIDE — EDIT BALL
// ============================================

let editBallIndex = null;

function editBall(index) {
    if (!isAdminMode) {
        showNotification('⚠️ Admin login required!', 'danger');
        return;
    }
    
    editBallIndex = index;
    const state = currentMatchState;
    if (!state || !state.ballLog || !state.ballLog[index]) {
        showNotification('⚠️ Ball not found!', 'danger');
        return;
    }
    
    const ball = state.ballLog[index];
    document.getElementById('editBallOver').textContent = ball.over || '0.0';
    document.getElementById('editCurrentData').textContent = 
        `${ball.batsman || 'Unknown'} ${ball.batsmanScore || '?'} | ${ball.bowler || 'Unknown'} ${ball.bowlerGuess || '?'} → ${ball.result || '?'}`;
    
    // Populate batsman dropdown
    const batsmanSelect = document.getElementById('editBatsmanSelect');
    if (batsmanSelect) {
        batsmanSelect.innerHTML = '';
        allPlayers.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p;
            opt.textContent = p;
            if (p === ball.batsman) opt.selected = true;
            batsmanSelect.appendChild(opt);
        });
        // Add manual option
        const manualOpt = document.createElement('option');
        manualOpt.value = '__manual__';
        manualOpt.textContent = '✏️ Type manually...';
        batsmanSelect.appendChild(manualOpt);
    }
    
    // Populate bowler dropdown
    const bowlerSelect = document.getElementById('editBowlerSelect');
    if (bowlerSelect) {
        bowlerSelect.innerHTML = '';
        allPlayers.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p;
            opt.textContent = p;
            if (p === ball.bowler) opt.selected = true;
            bowlerSelect.appendChild(opt);
        });
        const manualOpt = document.createElement('option');
        manualOpt.value = '__manual__';
        manualOpt.textContent = '✏️ Type manually...';
        bowlerSelect.appendChild(manualOpt);
    }
    
    document.getElementById('editBatsmanScore').value = ball.batsmanScore || 3;
    document.getElementById('editBowlerGuess').value = ball.bowlerGuess || 3;
    
    document.getElementById('editBallPopup').style.display = 'flex';
}

function closeEditBall() {
    document.getElementById('editBallPopup').style.display = 'none';
    editBallIndex = null;
}

function updateBall() {
    if (editBallIndex === null) {
        showNotification('⚠️ No ball selected!', 'danger');
        return;
    }
    
    let newBatsman = document.getElementById('editBatsmanSelect').value;
    if (newBatsman === '__manual__') {
        newBatsman = prompt('Enter batsman name:');
        if (!newBatsman || newBatsman.trim() === '') {
            showNotification('⚠️ Please enter batsman name!', 'danger');
            return;
        }
        newBatsman = newBatsman.trim();
    }
    const newScore = parseInt(document.getElementById('editBatsmanScore').value);
    
    let newBowler = document.getElementById('editBowlerSelect').value;
    if (newBowler === '__manual__') {
        newBowler = prompt('Enter bowler name:');
        if (!newBowler || newBowler.trim() === '') {
            showNotification('⚠️ Please enter bowler name!', 'danger');
            return;
        }
        newBowler = newBowler.trim();
    }
    const newGuess = parseInt(document.getElementById('editBowlerGuess').value);
    
    if (!newBatsman || isNaN(newScore) || !newBowler || isNaN(newGuess)) {
        showNotification('⚠️ Please fill all fields!', 'danger');
        return;
    }
    
    if (newScore < 3 || newScore > 6 || newGuess < 3 || newGuess > 6) {
        showNotification('⚠️ Score and guess must be 3-6!', 'danger');
        return;
    }
    
    socket.emit('editBall', {
        index: editBallIndex,
        batsman: newBatsman,
        score: newScore,
        bowler: newBowler,
        guess: newGuess
    });
    
    closeEditBall();
    showNotification('⏳ Updating ball...', 'warning');
}
// ============================================
// 8. DELETE BALL FUNCTION
// ============================================

function deleteBall(index) {
    if (!isAdminMode) {
        showNotification('⚠️ Admin login required!', 'danger');
        return;
    }
    
    if (confirm(`Are you sure you want to delete ball ${index + 1}?`)) {
        socket.emit('deleteBall', { index });
        showNotification('⏳ Deleting ball...', 'warning');
    }
}
// ============================================
// 9. SOCKET EVENT LISTENERS
// ============================================

// Score update (batsman set / ball result)
socket.on('scoreUpdate', (data) => {
    if (data.type === 'batsmanSet') {
        batsmanScoreSet = true;
        document.getElementById('batsmanStatus').textContent = `✅ Score set: ${data.result.score}`;
        document.getElementById('batsmanStatus').className = 'status-msg success';
        document.getElementById('bowlerStatus').textContent = '⏳ Ready to guess...';
        document.getElementById('bowlerStatus').className = 'status-msg waiting';
        showNotification(`✅ ${data.result.message}`, 'success');
    } else if (data.type === 'bowlResult') {
        batsmanScoreSet = false;
        document.getElementById('batsmanStatus').textContent = '⏳ Waiting...';
        document.getElementById('batsmanStatus').className = 'status-msg waiting';
        document.getElementById('bowlerStatus').textContent = '⏳ Waiting...';
        document.getElementById('bowlerStatus').className = 'status-msg waiting';
        document.getElementById('batsmanScoreInput').value = '';
        document.getElementById('bowlerGuessInput').value = '';
        
        // Show result with appropriate styling
        if (data.result && data.result.isOut) {
            showNotification(`🎯 ${data.result.message}`, 'danger');
        } else if (data.result && data.result.isWide) {
            showNotification(`📏 ${data.result.message}`, 'warning');
        } else if (data.result && data.result.isNoBall) {
            showNotification(`❌ ${data.result.message}`, 'warning');
        } else if (data.result) {
            showNotification(`✅ ${data.result.message}`, 'success');
        }
    }
    
    if (data.state) {
        updateMatchState(data.state);
    }
});

// State update (full sync)
socket.on('stateUpdate', (state) => {
    if (state) {
        updateMatchState(state);
    }
});

// Ball updated (admin override)
socket.on('ballUpdated', (data) => {
    if (data.result) {
        showNotification(`✅ Ball updated! ${data.result}`, 'success');
    }
    if (data.state) {
        updateMatchState(data.state);
    }
});

// Ball deleted (admin override)
socket.on('ballDeleted', (data) => {
    showNotification(`🗑️ Ball deleted!`, 'warning');
    if (data.state) {
        updateMatchState(data.state);
    }
});

// Notification
socket.on('notification', (message) => {
    showNotification(message, 'info');
});

// Error
socket.on('error', (data) => {
    if (data && data.message) {
        showNotification(`⚠️ ${data.message}`, 'danger');
    }
});
// ============================================
// NON-STRIKER & PENALTY FUNCTIONS — ADD THIS
// ============================================

// ============================================
// 1. MANUAL ENTRY TOGGLE FUNCTIONS
// ============================================

function toggleBatsmanManualInput() {
    const select = document.getElementById('batsmanSelect');
    const manualDiv = document.getElementById('batsmanManualInput');
    if (select.value === '__manual__') {
        manualDiv.style.display = 'block';
        document.getElementById('batsmanManualName').focus();
    } else {
        manualDiv.style.display = 'none';
    }
}

function toggleBowlerManualInput() {
    const select = document.getElementById('bowlerSelect');
    const manualDiv = document.getElementById('bowlerManualInput');
    if (select.value === '__manual__') {
        manualDiv.style.display = 'block';
        document.getElementById('bowlerManualName').focus();
    } else {
        manualDiv.style.display = 'none';
    }
}

function toggleNonStrikerManualInput() {
    const select = document.getElementById('nonStrikerSelect');
    const manualDiv = document.getElementById('nonStrikerManualInput');
    if (select.value === '__manual__') {
        manualDiv.style.display = 'block';
        document.getElementById('nonStrikerManualName').focus();
    } else {
        manualDiv.style.display = 'none';
    }
}

// ============================================
// 2. SUBMIT FUNCTIONS (FIXED)
// ============================================

function submitBatScore() {
    if (!isAdminMode) {
        showNotification('⚠️ Admin login required!', 'danger');
        return;
    }
    
    const select = document.getElementById('batsmanSelect');
    let name = select.value;
    
    if (name === '__manual__') {
        name = document.getElementById('batsmanManualName').value.trim();
        if (!name) {
            showNotification('⚠️ Please enter batsman name!', 'danger');
            return;
        }
    }
    
    if (!name || name === '') {
        showNotification('⚠️ Please select batsman!', 'danger');
        return;
    }
    
    const score = parseInt(document.getElementById('batsmanScoreInput').value);
    if (isNaN(score) || score < 3 || score > 6) {
        showNotification('⚠️ Score must be 3, 4, 5, or 6!', 'danger');
        return;
    }
    document.getElementById('batsmanStatus').textContent = '⏳ Sending score...';
    document.getElementById('batsmanStatus').className = 'status-msg waiting';
    socket.emit('batsmanSetScore', { name, score });
    document.getElementById('batsmanScoreInput').value = '';
}

function submitBowlGuess() {
    if (!isAdminMode) {
        showNotification('⚠️ Admin login required!', 'danger');
        return;
    }
    
    if (!batsmanScoreSet) {
        showNotification('⚠️ Batsman has not set score yet! Bowler cannot guess first.', 'danger');
        return;
    }
    
    const select = document.getElementById('bowlerSelect');
    let name = select.value;
    
    if (name === '__manual__') {
        name = document.getElementById('bowlerManualName').value.trim();
        if (!name) {
            showNotification('⚠️ Please enter bowler name!', 'danger');
            return;
        }
    }
    
    if (!name || name === '') {
        showNotification('⚠️ Please select bowler!', 'danger');
        return;
    }
    
    const guess = parseInt(document.getElementById('bowlerGuessInput').value);
    if (isNaN(guess) || guess < 3 || guess > 6) {
        showNotification('⚠️ Guess must be 3, 4, 5, or 6!', 'danger');
        return;
    }
    document.getElementById('bowlerStatus').textContent = '⏳ Sending guess...';
    document.getElementById('bowlerStatus').className = 'status-msg waiting';
    socket.emit('bowlerGuess', { name, guess });
    document.getElementById('bowlerGuessInput').value = '';
}

// ============================================
// 3. NON-STRIKER FUNCTION
// ============================================

function setNonStriker() {
    if (!isAdminMode) {
        showNotification('⚠️ Admin login required!', 'danger');
        return;
    }
    
    const select = document.getElementById('nonStrikerSelect');
    let name = select.value;
    
    if (name === '__manual__') {
        name = document.getElementById('nonStrikerManualName').value.trim();
        if (!name) {
            showNotification('⚠️ Please enter non-striker name!', 'danger');
            return;
        }
    }
    
    if (!name || name === '') {
        showNotification('⚠️ Please select non-striker!', 'danger');
        return;
    }
    
    socket.emit('setNonStriker', { name });
    document.getElementById('nonStrikerStatus').textContent = `✅ ${name}`;
    document.getElementById('nonStrikerStatus').className = 'status-msg success';
    showNotification(`🔄 Non-Striker set: ${name}`, 'success');
}

// ============================================
// 4. PENALTY FUNCTIONS
// ============================================

function applyPenalty(type) {
    if (!isAdminMode) {
        showNotification('⚠️ Admin login required!', 'danger');
        return;
    }
    
    let playerName, offence, penaltyData;
    
    if (type === 'batsman') {
        playerName = document.getElementById('penaltyBatsmanSelect').value;
        offence = document.getElementById('penaltyBatsmanOffence').value;
        if (!playerName || !offence) {
            showNotification('⚠️ Please select batsman and offence!', 'danger');
            return;
        }
        penaltyData = { type: 'batsman', player: playerName, offence: offence };
    } else if (type === 'bowler') {
        playerName = document.getElementById('penaltyBowlerSelect').value;
        offence = document.getElementById('penaltyBowlerOffence').value;
        if (!playerName || !offence) {
            showNotification('⚠️ Please select bowler and offence!', 'danger');
            return;
        }
        penaltyData = { type: 'bowler', player: playerName, offence: offence };
    }
    
    socket.emit('applyPenalty', penaltyData);
    document.getElementById('penaltyStatus').textContent = '⏳ Applying penalty...';
    document.getElementById('penaltyStatus').className = 'status-msg waiting';
}

// ============================================
// 5. UPDATE MATCH STATE (FIXED - WITH TEAM NAMES)
// ============================================

function updateMatchState(state) {
    if (!state) return;
    currentMatchState = state;
    
    // Update scoreboard — WITH TEAM NAMES
    if (state.battingTeam) {
        const battingName = document.getElementById('battingTeamName');
        if (battingName) battingName.textContent = state.battingTeam.name || 'Team 1';
        
        const runs = document.getElementById('runsDisplay');
        if (runs) runs.textContent = state.battingTeam.runs || 0;
        
        const wickets = document.getElementById('wicketsDisplay');
        if (wickets) wickets.textContent = state.battingTeam.wickets || 0;
        
        const balls = document.getElementById('ballsDisplay');
        if (balls) balls.textContent = state.battingTeam.balls || 0;
        
        const extras = document.getElementById('extrasDisplay');
        if (extras) extras.textContent = state.battingTeam.extras || 0;
    }
    
    if (state.bowlingTeam) {
        const bowlingName = document.getElementById('bowlingTeamName');
        if (bowlingName) bowlingName.textContent = state.bowlingTeam.name || 'Team 2';
    }
    
    const targetDisplay = document.getElementById('targetDisplay');
    if (targetDisplay) {
        targetDisplay.textContent = state.target ? `Target: ${state.target}` : '';
    }
    
    // Update batsmen
    const strikerName = document.getElementById('strikerName');
    if (strikerName) strikerName.textContent = state.striker || '-';
    
    const nonStrikerName = document.getElementById('nonStrikerName');
    if (nonStrikerName) nonStrikerName.textContent = state.nonStriker || '-';
    
    // Update bowler
    const currentBowler = document.getElementById('currentBowler');
    if (currentBowler) currentBowler.textContent = state.currentBowlerName || '-';
    
    // Update over info
    const overDisplay = document.getElementById('currentOverDisplay');
    if (overDisplay && state.currentOver !== undefined && state.currentBall !== undefined) {
        overDisplay.textContent = `${state.currentOver}.${state.currentBall}`;
    }
    
    const strikeDisplay = document.getElementById('strikeDisplay');
    if (strikeDisplay) {
        strikeDisplay.textContent = state.striker || '-';
    }
    
    // Update last ball
    const lastBallDisplay = document.getElementById('lastBallDisplay');
    if (lastBallDisplay) {
        if (state.lastBallResult) {
            lastBallDisplay.textContent = `Last Ball: ${state.lastBallResult.message || '-'}`;
        } else {
            lastBallDisplay.textContent = 'Last Ball: -';
        }
    }
    
    // Update no-ball status
    if (state.noBallUsed !== undefined) {
        const statusEl = document.getElementById('noBallStatus');
        if (statusEl) {
            if (state.noBallUsed) {
                statusEl.textContent = '✅ YES (1/1)';
                statusEl.className = 'noball-status yes';
            } else {
                statusEl.textContent = '❌ No';
                statusEl.className = 'noball-status no';
            }
        }
    }
    
    // Update scorecard
    updateScorecard(state);
    
    // Update ball-by-ball
    updateBallByBall(state);
}

// ============================================
// 6. SCORECARD UPDATE (FIXED)
// ============================================

function updateScorecard(state) {
    if (!state) return;
    
    const batsmen = state.batsmen || [];
    const batsmenContainer = document.getElementById('batsmenScorecard');
    if (batsmenContainer) {
        if (batsmen.length === 0) {
            batsmenContainer.innerHTML = '<p class="empty-message">No batsmen yet</p>';
        } else {
            let html = '';
            batsmen.forEach(b => {
                const fours = b.fours || 0;
                const sixes = b.sixes || 0;
                html += `<div class="scorecard-player">
                    <span class="sc-name">${b.name}</span>
                    <span class="sc-stats">${b.runs}(${b.balls}) ${fours}x4 ${sixes}x6</span>
                </div>`;
            });
            batsmenContainer.innerHTML = html;
        }
    }
    
    const bowlers = state.bowlers || [];
    const bowlersContainer = document.getElementById('bowlersScorecard');
    if (bowlersContainer) {
        if (bowlers.length === 0) {
            bowlersContainer.innerHTML = '<p class="empty-message">No bowlers yet</p>';
        } else {
            let html = '';
            bowlers.forEach(b => {
                html += `<div class="scorecard-player">
                    <span class="sc-name">${b.name}</span>
                    <span class="sc-stats">${b.wickets}w ${b.runsConceded}r ${b.overs}ov</span>
                </div>`;
            });
            bowlersContainer.innerHTML = html;
        }
    }
}

// ============================================
// 7. BALL-BY-BALL UPDATE
// ============================================

function updateBallByBall(state) {
    if (!state) return;
    
    const balls = state.ballLog || [];
    const container = document.getElementById('ballByBall');
    if (!container) return;
    
    if (balls.length === 0) {
        container.innerHTML = '<p class="empty-message">No balls bowled yet</p>';
        return;
    }
    
    let html = '';
    balls.forEach((ball, index) => {
        const editBtn = isAdminMode ? `<button class="ball-edit-btn" onclick="editBall(${index})" style="display:inline-block;">✏️</button>` : '';
        const deleteBtn = isAdminMode ? `<button class="ball-delete-btn" onclick="deleteBall(${index})" style="display:inline-block;">🗑️</button>` : '';
        const corrected = ball.corrected ? ' [Corrected]' : '';
        const resultClass = ball.resultClass || '';
        html += `<div class="ball-entry">
            <span class="ball-over">${ball.over || '0.0'}</span>
            <span class="ball-result ${resultClass}">${ball.result || ''}${corrected}</span>
            <span class="ball-actions">${editBtn}${deleteBtn}</span>
        </div>`;
    });
    
    container.innerHTML = html;
}

// ============================================
// 8. DROPDOWN POPULATE (FILTER BY MATCH TEAMS)
// ============================================

let currentMatchTeams = { team1: null, team2: null };

function populateDropdowns(teams, matchTeam1, matchTeam2) {
    const players = [];
    
    // Filter only match teams
    const matchTeams = teams.filter(t => 
        t.name === matchTeam1 || t.name === matchTeam2
    );
    
    matchTeams.forEach(team => {
        if (team.captain) players.push(team.captain);
        if (team.viceCaptain) players.push(team.viceCaptain);
        if (team.squad) {
            team.squad.forEach(p => {
                if (p && !players.includes(p)) players.push(p);
            });
        }
    });
    
    allPlayers = players;
    
    // Populate Batsman Dropdown
    const batsmanSelect = document.getElementById('batsmanSelect');
    if (batsmanSelect) {
        batsmanSelect.innerHTML = '<option value="">Select Batsman...</option><option value="__manual__">✏️ Type manually...</option>';
        players.forEach(p => {
            const option = document.createElement('option');
            option.value = p;
            option.textContent = p;
            batsmanSelect.appendChild(option);
        });
    }
    
    // Populate Bowler Dropdown
    const bowlerSelect = document.getElementById('bowlerSelect');
    if (bowlerSelect) {
        bowlerSelect.innerHTML = '<option value="">Select Bowler...</option><option value="__manual__">✏️ Type manually...</option>';
        players.forEach(p => {
            const option = document.createElement('option');
            option.value = p;
            option.textContent = p;
            bowlerSelect.appendChild(option);
        });
    }
    
    // Populate Non-Striker Dropdown
    const nonStrikerSelect = document.getElementById('nonStrikerSelect');
    if (nonStrikerSelect) {
        nonStrikerSelect.innerHTML = '<option value="">Select Non-Striker...</option><option value="__manual__">✏️ Type manually...</option>';
        players.forEach(p => {
            const option = document.createElement('option');
            option.value = p;
            option.textContent = p;
            nonStrikerSelect.appendChild(option);
        });
    }
    
    // Populate Penalty Dropdowns
    const penaltyBatsmanSelect = document.getElementById('penaltyBatsmanSelect');
    if (penaltyBatsmanSelect) {
        penaltyBatsmanSelect.innerHTML = '<option value="">Select Batsman...</option>';
        players.forEach(p => {
            const option = document.createElement('option');
            option.value = p;
            option.textContent = p;
            penaltyBatsmanSelect.appendChild(option);
        });
    }
    
    const penaltyBowlerSelect = document.getElementById('penaltyBowlerSelect');
    if (penaltyBowlerSelect) {
        penaltyBowlerSelect.innerHTML = '<option value="">Select Bowler...</option>';
        players.forEach(p => {
            const option = document.createElement('option');
            option.value = p;
            option.textContent = p;
            penaltyBowlerSelect.appendChild(option);
        });
    }
}

// Override socket events
socket.on('teamsList', (data) => {
    teams = data;          // ✅ Global teams update ho raha hai
    window.teams = data;
    updateTeamsList(data);
    updateTeamSelects(data);
    updateAdminTeamsList();
    populateDropdowns(data, currentMatchTeams.team1, currentMatchTeams.team2);
});

/*socket.on('stateUpdate', (state) => {
    if (state && state.battingTeam && state.bowlingTeam) {
        currentMatchTeams.team1 = state.battingTeam.name;
        currentMatchTeams.team2 = state.bowlingTeam.name;
        // Re-populate dropdowns with match teams
        if (window.teams) {
            populateDropdowns(window.teams, currentMatchTeams.team1, currentMatchTeams.team2);
        }
    }
    updateMatchState(state);
});*/

// ============================================
// 9. ADMIN LOCK FUNCTIONS (FIXED)
// ============================================

function checkLiveScorePassword() {
    const input = document.getElementById('adminPasswordInput').value;
    if (input === ADMIN_PASSWORD) {
        isAdminMode = true;
        const teamSelection = document.querySelector('.team-selection');
if (teamSelection) teamSelection.style.display = 'block';
        document.getElementById('adminLoginPopup').style.display = 'none';
        document.getElementById('adminModeStatus').textContent = '👑 Admin Mode';
        document.getElementById('adminModeStatus').className = 'admin-status admin-mode';
        document.getElementById('adminLockBtn').style.display = 'none';
        document.getElementById('adminLogoutBtn').style.display = 'inline-block';
        document.querySelector('.game-controls').style.display = 'grid';
        document.querySelectorAll('.ball-edit-btn').forEach(b => b.style.display = 'inline-block');
        document.querySelectorAll('.ball-delete-btn').forEach(b => b.style.display = 'inline-block');
        const resetBtn = document.getElementById('resetMatchBtn');
        if (resetBtn) resetBtn.style.display = 'inline-block';
        populateTeamDropdowns();  // ✅ ADD THIS
        showNotification('✅ Admin Mode Activated!', 'success');
    } else {
        document.getElementById('adminLoginError').style.display = 'block';
        document.getElementById('adminPasswordInput').value = '';
        document.getElementById('adminPasswordInput').focus();
    }
}
function logoutAdmin() {
    isAdminMode = false;
    document.getElementById('adminModeStatus').textContent = '👤 Read-Only Mode';
    document.getElementById('adminModeStatus').className = 'admin-status read-only';
    document.getElementById('adminLockBtn').style.display = 'inline-block';
    document.getElementById('adminLogoutBtn').style.display = 'none';
    document.querySelector('.game-controls').style.display = 'none';
    document.querySelectorAll('.ball-edit-btn').forEach(b => b.style.display = 'none');
    document.querySelectorAll('.ball-delete-btn').forEach(b => b.style.display = 'none');
    const resetBtn = document.getElementById('resetMatchBtn');
    if (resetBtn) resetBtn.style.display = 'none';
    const teamSelection = document.querySelector('.team-selection');
    if (teamSelection) teamSelection.style.display = 'none';
    showNotification('🔒 Logged out from Admin Mode', 'warning');
}
// ============================================
// BATTING/BOWLING TEAM SELECTION
// ============================================

function populateTeamDropdowns(team1, team2) {
    const battingSelect = document.getElementById('battingTeamSelect');
    const bowlingSelect = document.getElementById('bowlingTeamSelect');
    
    if (battingSelect) {
        battingSelect.innerHTML = '<option value="">Select Team</option>';
        if (team1) {
            const opt1 = document.createElement('option');
            opt1.value = team1;
            opt1.textContent = team1;
            battingSelect.appendChild(opt1);
        }
        if (team2) {
            const opt2 = document.createElement('option');
            opt2.value = team2;
            opt2.textContent = team2;
            battingSelect.appendChild(opt2);
        }
    }
    
    if (bowlingSelect) {
        bowlingSelect.innerHTML = '<option value="">Select Team</option>';
        if (team1) {
            const opt1 = document.createElement('option');
            opt1.value = team1;
            opt1.textContent = team1;
            bowlingSelect.appendChild(opt1);
        }
        if (team2) {
            const opt2 = document.createElement('option');
            opt2.value = team2;
            opt2.textContent = team2;
            bowlingSelect.appendChild(opt2);
        }
    }
}

function setBattingBowlingTeams() {
    if (!isAdminMode) {
        showNotification('⚠️ Admin login required!', 'danger');
        return;
    }
    
    const battingTeam = document.getElementById('battingTeamSelect').value;
    const bowlingTeam = document.getElementById('bowlingTeamSelect').value;
    
    if (!battingTeam || !bowlingTeam) {
        showNotification('⚠️ Please select both teams!', 'danger');
        return;
    }
    
    if (battingTeam === bowlingTeam) {
        showNotification('⚠️ Batting and bowling teams must be different!', 'danger');
        return;
    }
    
    socket.emit('setBattingBowlingTeams', { battingTeam, bowlingTeam });
    document.getElementById('teamSelectionStatus').textContent = `⏳ Setting teams: ${battingTeam} (bat) vs ${bowlingTeam} (bowl)...`;
    document.getElementById('teamSelectionStatus').className = 'status-msg waiting';
}

// Socket listener for team selection confirmation
socket.on('teamsSet', (data) => {
    document.getElementById('teamSelectionStatus').textContent = `✅ ${data.battingTeam} batting, ${data.bowlingTeam} bowling`;
    document.getElementById('teamSelectionStatus').className = 'status-msg success';
    showNotification(`✅ Teams set: ${data.battingTeam} batting, ${data.bowlingTeam} bowling`, 'success');
    
    // Update dropdowns with filtered players
    if (window.teams) {
        populateDropdowns(window.teams, data.battingTeam, data.bowlingTeam);
    }
});
// ============================================
// 10. SOCKET EVENT LISTENERS (ADD PENALTY & NON-STRIKER)
// ============================================

socket.on('scoreUpdate', (data) => {
    if (data.type === 'batsmanSet') {
        batsmanScoreSet = true;
        document.getElementById('batsmanStatus').textContent = `✅ Score set: ${data.result.score}`;
        document.getElementById('batsmanStatus').className = 'status-msg success';
        document.getElementById('bowlerStatus').textContent = '⏳ Ready to guess...';
        document.getElementById('bowlerStatus').className = 'status-msg waiting';
        showNotification(`✅ ${data.result.message}`, 'success');
    } else if (data.type === 'bowlResult') {
        batsmanScoreSet = false;
        document.getElementById('batsmanStatus').textContent = '⏳ Waiting...';
        document.getElementById('batsmanStatus').className = 'status-msg waiting';
        document.getElementById('bowlerStatus').textContent = '⏳ Waiting...';
        document.getElementById('bowlerStatus').className = 'status-msg waiting';
        document.getElementById('batsmanScoreInput').value = '';
        document.getElementById('bowlerGuessInput').value = '';
        
        if (data.result && data.result.isOut) {
            showNotification(`🎯 ${data.result.message}`, 'danger');
        } else if (data.result && data.result.isWide) {
            showNotification(`📏 ${data.result.message}`, 'warning');
        } else if (data.result && data.result.isNoBall) {
            showNotification(`❌ ${data.result.message}`, 'warning');
        } else if (data.result) {
            showNotification(`✅ ${data.result.message}`, 'success');
        }
    }
    if (data.state) updateMatchState(data.state);
});

socket.on('stateUpdate', (state) => {
    if (state) {
        // ✅ Always update scoreboard first
        updateScoreboard(state);
        
        if (state.battingTeam && state.bowlingTeam) {
            currentMatchTeams.team1 = state.battingTeam.name;
            currentMatchTeams.team2 = state.bowlingTeam.name;
            if (window.teams) {
                populateDropdowns(window.teams, currentMatchTeams.team1, currentMatchTeams.team2);
            }
        }
        updateMatchState(state);
    }
});
socket.on('ballUpdated', (data) => {
    if (data.result) showNotification(`✅ Ball updated! ${data.result}`, 'success');
    if (data.state) updateMatchState(data.state);
});

socket.on('ballDeleted', (data) => {
    showNotification(`🗑️ Ball deleted!`, 'warning');
    if (data.state) updateMatchState(data.state);
});

socket.on('notification', (message) => {
    showNotification(message, 'info');
});

socket.on('error', (data) => {
    if (data && data.message) {
        showNotification(`⚠️ ${data.message}`, 'danger');
    }
});

// Non-Striker update
socket.on('nonStrikerSet', (data) => {
    document.getElementById('nonStrikerStatus').textContent = `✅ ${data.name}`;
    document.getElementById('nonStrikerStatus').className = 'status-msg success';
    if (data.state) updateMatchState(data.state);
});

// Penalty update
socket.on('penaltyApplied', (data) => {
    document.getElementById('penaltyStatus').textContent = data.message;
    document.getElementById('penaltyStatus').className = 'status-msg success';
    showNotification(`⚠️ ${data.message}`, 'warning');
    if (data.state) updateMatchState(data.state);
});

socket.on('penaltyError', (data) => {
    document.getElementById('penaltyStatus').textContent = `❌ ${data.message}`;
    document.getElementById('penaltyStatus').className = 'status-msg error';
    showNotification(`⚠️ ${data.message}`, 'danger');
});

// Show notification function (already exists, but ensure it's there)
function showNotification(message, type = 'info') {
    const notification = document.getElementById('notification');
    if (!notification) return;
    
    notification.textContent = message;
    notification.className = 'notification';
    if (type) {
        notification.classList.add(type);
    }
    notification.style.display = 'flex';
    
    clearTimeout(notification._timeout);
    notification._timeout = setTimeout(() => {
        notification.style.display = 'none';
    }, 5000);
}
