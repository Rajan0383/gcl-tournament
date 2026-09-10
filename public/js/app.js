// ============================================
// GCL FRONTEND APPLICATION - CLEAN VERSION
// ============================================

const socket = io();
let teams = [];
let matchState = null;

// Live Score state
let isAdminMode = false;
let allPlayers = [];
let batsmanScoreSet = false;
let currentMatchState = null;
let currentMatchTeams = { team1: null, team2: null };
let editBallIndex = null;

// Teams Grouping state
let teamsGroupingData = { available: [], groupA: [], groupB: [] };
let lastAssignedGroup = 'A';

// Passwords
const TEAMS_PASSWORD = "gcl2026";
const ADMIN_PASSWORD = "gcl2026";
const FIXTURE_ADMIN_PASSWORD = "gcl2026";
const AUCTION_PASSWORD = "gcl2026";

// Admin mode flags
let teamsAdminMode = false;
let fixtureAdminMode = false;

console.log('🏏 GCL Frontend Loading...');

// ============================================
// SOCKET CONNECTION
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
    window.fixtures = fixtures;
    updateFixtures(fixtures);
    updateAdminFixturesList();
    updateAdminResultsList();
    updateCompleteFixtureSelect(fixtures);
});

socket.on('startFixture', (fixtureId) => {
    console.log('⚔️ Match started event received:', fixtureId);
    socket.emit('getFixtures');
    setTimeout(() => {
        updateCompleteFixtureSelect(window.fixtures);
    }, 1000);
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
    console.error('❌ Error:', data);
    if (data && data.message) {
        showNotification(`❌ ${data.message}`, 'danger');
    }
});

socket.on('teamsList', (data) => {
    teams = data;
    window.teams = data;
    updateTeamsList(data);
    updateTeamSelects(data);
    updateAdminTeamsList();
    populateDropdowns(data, currentMatchTeams.team1, currentMatchTeams.team2);
});

socket.on('stateUpdate', (state) => {
    if (!state) return;

    // Handle match reset
    if (state.isActive === false) {
        const runsEl = document.getElementById('runsDisplay');
        if (runsEl) runsEl.textContent = '0';
        const wktsEl = document.getElementById('wicketsDisplay');
        if (wktsEl) wktsEl.textContent = '0';
        const ballsEl = document.getElementById('ballsDisplay');
        if (ballsEl) ballsEl.textContent = '0';
        const extrasEl = document.getElementById('extrasDisplay');
        if (extrasEl) extrasEl.textContent = '0';
        const lastBallEl = document.getElementById('lastBallDisplay');
        if (lastBallEl) lastBallEl.textContent = 'Last Ball: -';
        const strikerEl = document.getElementById('strikerName');
        if (strikerEl) strikerEl.textContent = '-';
        const nonStrikerEl = document.getElementById('nonStrikerName');
        if (nonStrikerEl) nonStrikerEl.textContent = '-';
        const bowlerEl = document.getElementById('currentBowler');
        if (bowlerEl) bowlerEl.textContent = '-';
        const ballByBallEl = document.getElementById('ballByBall');
        if (ballByBallEl) ballByBallEl.innerHTML = '<p class="empty-message">No balls bowled yet</p>';
    }

    // Track current match teams
    if (state.battingTeam && state.bowlingTeam) {
        currentMatchTeams.team1 = state.battingTeam.name;
        currentMatchTeams.team2 = state.bowlingTeam.name;
    }

    // Update scoreboard and match state
    updateScoreboard(state);
    updateMatchState(state);

    // Refresh dropdowns with match team players
    if (window.teams) {
        populateDropdowns(window.teams, currentMatchTeams.team1, currentMatchTeams.team2);
    }
});

socket.on('scoreUpdate', (data) => {
    if (data.type === 'batsmanSet') {
        batsmanScoreSet = true;
        const batsmanStatus = document.getElementById('batsmanStatus');
        if (batsmanStatus) {
            batsmanStatus.textContent = `✅ Score set: ${data.result.score}`;
            batsmanStatus.className = 'status-msg success';
        }
        const bowlerStatus = document.getElementById('bowlerStatus');
        if (bowlerStatus) {
            bowlerStatus.textContent = '⏳ Ready to guess...';
            bowlerStatus.className = 'status-msg waiting';
        }
        showNotification(`✅ ${data.result.message}`, 'success');
    } else if (data.type === 'bowlResult') {
        batsmanScoreSet = false;
        const batsmanStatus = document.getElementById('batsmanStatus');
        if (batsmanStatus) {
            batsmanStatus.textContent = '⏳ Waiting...';
            batsmanStatus.className = 'status-msg waiting';
        }
        const bowlerStatus = document.getElementById('bowlerStatus');
        if (bowlerStatus) {
            bowlerStatus.textContent = '⏳ Waiting...';
            bowlerStatus.className = 'status-msg waiting';
        }
        const scoreInput = document.getElementById('batsmanScoreInput');
        if (scoreInput) scoreInput.value = '';
        const guessInput = document.getElementById('bowlerGuessInput');
        if (guessInput) guessInput.value = '';

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

socket.on('ballUpdated', (data) => {
    if (data.result) showNotification(`✅ Ball updated! ${data.result}`, 'success');
    if (data.state) updateMatchState(data.state);
});

socket.on('ballDeleted', (data) => {
    showNotification(`🗑️ Ball deleted!`, 'warning');
    if (data.state) updateMatchState(data.state);
});

socket.on('nonStrikerSet', (data) => {
    const nonStrikerStatus = document.getElementById('nonStrikerStatus');
    if (nonStrikerStatus) {
        nonStrikerStatus.textContent = `✅ ${data.name}`;
        nonStrikerStatus.className = 'status-msg success';
    }
    if (data.state) updateMatchState(data.state);
});

socket.on('penaltyApplied', (data) => {
    const penaltyStatus = document.getElementById('penaltyStatus');
    if (penaltyStatus) {
        penaltyStatus.textContent = data.message;
        penaltyStatus.className = 'status-msg success';
    }
    showNotification(`⚠️ ${data.message}`, 'warning');
    if (data.state) updateMatchState(data.state);
});

socket.on('penaltyError', (data) => {
    const penaltyStatus = document.getElementById('penaltyStatus');
    if (penaltyStatus) {
        penaltyStatus.textContent = `❌ ${data.message}`;
        penaltyStatus.className = 'status-msg error';
    }
    showNotification(`⚠️ ${data.message}`, 'danger');
});
socket.on('matchFinished', (data) => {
    if (data && data.message) {
        showNotification(`🏆 ${data.message}`, 'success');
    }
    // Explicitly re-request the updated data
    socket.emit('getPointsTable');
    socket.emit('getTopStats');
    socket.emit('getFixtures');
});
socket.on('teamsSet', (data) => {
    const teamSelectionStatus = document.getElementById('teamSelectionStatus');
    if (teamSelectionStatus) {
        teamSelectionStatus.textContent = `✅ ${data.battingTeam} batting, ${data.bowlingTeam} bowling`;
        teamSelectionStatus.className = 'status-msg success';
    }
    showNotification(`✅ Teams set: ${data.battingTeam} batting, ${data.bowlingTeam} bowling`, 'success');

    if (window.teams) {
        populateDropdowns(window.teams, data.battingTeam, data.bowlingTeam);
    }
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

function showNotification(message, type = 'info') {
    const notification = document.getElementById('notification');
    if (!notification) return;

    notification.textContent = message;
    notification.className = 'notification';
    if (type) notification.classList.add(type);
    notification.style.display = 'flex';

    clearTimeout(notification._timeout);
    notification._timeout = setTimeout(() => {
        notification.style.display = 'none';
    }, 5000);
}

function updateScoreboard(state) {
    if (!state) return;

    const overEl = document.querySelector('.over-info');
    if (overEl) {
        const ball = state.currentBall || 0;
        const over = state.currentOver !== undefined ? state.currentOver : 0;
        overEl.textContent = `Over: ${over}.${ball} / ${state.totalOvers || 4}`;
    }

    if (state.battingTeam) {
        const battingName = document.getElementById('battingTeamName');
        const runs = document.getElementById('runsDisplay');
        const wickets = document.getElementById('wicketsDisplay');
        const balls = document.getElementById('ballsDisplay');
        const extras = document.getElementById('extrasDisplay');

        if (battingName) battingName.textContent = state.battingTeam.name || 'Team 1';
        if (runs) runs.textContent = state.battingTeam.runs || 0;
        if (wickets) wickets.textContent = state.battingTeam.wickets || 0;
        if (balls) balls.textContent = state.battingTeam.balls || 0;
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
            } else {
                displayText = `${result.runsScored} runs`;
            }
            lastBallDisplay.textContent = `Last Ball: ${displayText}`;
        } else {
            lastBallDisplay.textContent = 'Last Ball: -';
        }
    }
}

function updateAllowedScores(state) {
    const overType = state?.overType || 'normal';
    let scores = [3, 4, 5, 6];
    if (overType === 'lbw') scores = [2, 3, 4, 5, 6];
    else if (overType === 'powerplay') scores = [1, 2, 3, 4, 5, 6];

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
    if (!pointsTable || pointsTable.length === 0) {
        const groupAEl = document.getElementById('groupA');
        const groupBEl = document.getElementById('groupB');
        if (groupAEl) groupAEl.innerHTML = '<tr><td colspan="7" class="empty-message">No data available</td></tr>';
        if (groupBEl) groupBEl.innerHTML = '<tr><td colspan="7" class="empty-message">No data available</td></tr>';
        return;
    }

    const groupATeams = pointsTable.filter(t => t.group === 'A');
    const groupBTeams = pointsTable.filter(t => t.group === 'B');

    const groupAElement = document.getElementById('groupA');
    const groupBElement = document.getElementById('groupB');

    const renderTable = (teams) => teams.map(team => {
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

    if (groupAElement) {
        groupAElement.innerHTML = groupATeams.length === 0
            ? '<tr><td colspan="7" class="empty-message">No data available</td></tr>'
            : renderTable(groupATeams);
    }
    if (groupBElement) {
        groupBElement.innerHTML = groupBTeams.length === 0
            ? '<tr><td colspan="7" class="empty-message">No data available</td></tr>'
            : renderTable(groupBTeams);
    }
}

function updateTop10Players(data) {
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

document.addEventListener('DOMContentLoaded', function() {
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            const tabName = this.dataset.tab;
            switchTab(tabName);
            if (tabName === 'auction') {
                updateTeamsGrouping();
            }
        });
    });
});

if (document.readyState === 'complete' || document.readyState === 'interactive') {
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            switchTab(this.dataset.tab);
        });
    });
}

// ============================================
// TEAMS PAGE
// ============================================

function toggleTeamsAdmin() {
    const login = document.getElementById('teamsAdminLogin');
    if (!login) return;
    if (login.style.display === 'flex') {
        login.style.display = 'none';
    } else {
        login.style.display = 'flex';
        const pw = document.getElementById('teamsPassword');
        if (pw) pw.value = '';
        const err = document.getElementById('teamsError');
        if (err) err.style.display = 'none';
    }
}

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
    const form = document.getElementById('addTeamForm');
    if (form) form.style.display = 'block';
}

function hideAddTeamForm() {
    const form = document.getElementById('addTeamForm');
    if (form) form.style.display = 'none';
    ['newTeamName', 'newCaptain', 'newViceCaptain', 'newSquad'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
}

function createTeamFromTeams() {
    const name = document.getElementById('newTeamName').value.trim();
    const captain = document.getElementById('newCaptain').value.trim();
    const viceCaptain = document.getElementById('newViceCaptain').value.trim();
    const squadRaw = document.getElementById('newSquad').value.trim();

    if (!name) return showNotification('⚠️ Please enter team name!', 'danger');
    if (!captain) return showNotification('⚠️ Please enter captain name!', 'danger');
    if (!viceCaptain) return showNotification('⚠️ Please enter vice captain name!', 'danger');

    const squad = squadRaw ? squadRaw.split(',').map(p => p.trim()).filter(p => p) : [];

    if (!squad.includes(captain)) {
        return showNotification(`⚠️ Captain "${captain}" must be in the squad list!`, 'danger');
    }
    if (!squad.includes(viceCaptain)) {
        return showNotification(`⚠️ Vice Captain "${viceCaptain}" must be in the squad list!`, 'danger');
    }

    socket.emit('createTeam', { name, captain, viceCaptain, squad });
    hideAddTeamForm();
    showNotification(`⏳ Creating team "${name}"...`, 'warning');
}

function updateTeamsList(teams) {
    const container = document.getElementById('teamsList');
    const countEl = document.getElementById('teamsCount');
    if (!container) return;

    if (countEl) countEl.textContent = `${teams.length} teams`;

    if (!teams || teams.length === 0) {
        container.innerHTML = '<p class="empty-message">No teams created yet.</p>';
        return;
    }

    const isAdmin = teamsAdminMode;

    container.innerHTML = teams.map(team => {
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

        const allPlayers = [];
        if (captainTag) allPlayers.push({ name: captainTag, cls: 'captain-tag' });
        if (vcTag) allPlayers.push({ name: vcTag, cls: 'vc-tag' });
        otherPlayers.forEach(p => allPlayers.push({ name: p, cls: '' }));

        return `
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
                    ${allPlayers.map(p => `<span class="squad-tag ${p.cls}">${p.name}</span>`).join('')}
                </div>
            </div>
        `;
    }).join('');
}

function editTeam(teamId) {
    const team = teams.find(t => t.id === teamId);
    if (!team) return showNotification('⚠️ Team not found!', 'danger');

    const currentSquadText = team.squad ? team.squad.join(', ') : '';
    const message = `✏️ EDIT TEAM: ${team.name}\n\n` +
        `Format: Team Name, Captain, Vice Captain, Player1, Player2, Player3...\n\n` +
        `To add/remove players, just add or remove names from the list.`;

    const input = prompt(message, `${team.name}, ${team.captain}, ${team.viceCaptain}, ${currentSquadText}`);
    if (input === null) return;

    const parts = input.split(',').map(p => p.trim()).filter(p => p);
    if (parts.length < 3) {
        return showNotification('⚠️ Please enter at least: Team Name, Captain, Vice Captain', 'danger');
    }

    const newName = parts[0];
    const newCaptain = parts[1];
    const newVC = parts[2];
    let newSquad = parts.slice(3);

    if (!newSquad.includes(newCaptain)) newSquad.push(newCaptain);
    if (!newSquad.includes(newVC)) newSquad.push(newVC);

    fetch('/api/teams/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            ...team,
            name: newName.trim(),
            captain: newCaptain.trim(),
            viceCaptain: newVC.trim(),
            squad: newSquad
        })
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
    if (!team) return showNotification('⚠️ Team not found!', 'danger');
    if (!confirm(`Are you sure you want to delete "${team.name}"? This cannot be undone!`)) return;

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

// ============================================
// FIXTURES PAGE
// ============================================

function updateFixtures(fixtures) {
    const upcomingContainer = document.getElementById('upcomingFixtures');
    const completedContainer = document.getElementById('completedFixtures');

    if (upcomingContainer) {
        let upcoming = fixtures.matches.filter(m => fixtures.upcoming.includes(m.id));
        upcoming = upcoming.sort((a, b) => new Date(a.date) - new Date(b.date));
        upcomingContainer.innerHTML = upcoming.map(f => createFixtureCard(f)).join('');
    }

    if (completedContainer) {
        let completed = fixtures.matches.filter(m => fixtures.completed.includes(m.id));
        completed = completed.sort((a, b) => new Date(a.date) - new Date(b.date));
        completedContainer.innerHTML = completed.map(f => createFixtureCard(f)).join('');
    }

    updateCompleteFixtureSelect(fixtures);
}

function createFixtureCard(fixture) {
    const statusColors = { scheduled: 'scheduled', ongoing: 'ongoing', completed: 'completed' };
    const team1Name = getTeamNameById(fixture.team1);
    const team2Name = getTeamNameById(fixture.team2);

    let dateDisplay = 'Date not set';
    let timeDisplay = '';
    try {
        const dateObj = new Date(fixture.date);
        if (!isNaN(dateObj.getTime())) {
            const dayName = dateObj.toLocaleDateString('en-IN', { weekday: 'long' });
            dateDisplay = dateObj.toLocaleDateString('en-IN', {
                day: '2-digit', month: 'short', year: 'numeric'
            }) + ` (${dayName})`;
            timeDisplay = dateObj.toLocaleTimeString('en-IN', {
                hour: '2-digit', minute: '2-digit', hour12: true
            });
        }
    } catch (e) {
        dateDisplay = fixture.date || 'Date not set';
    }

    const adminActions = fixtureAdminMode ? `
        <div class="fixture-admin-actions">
            <button class="edit-btn" onclick="editFixture('${fixture.id}')">✏️ Edit</button>
            <button class="delete-btn" onclick="deleteFixture('${fixture.id}')">🗑️</button>
        </div>
    ` : '';

    let matchActions = '';
    if (fixtureAdminMode) {
        if (fixture.status === 'scheduled') {
            matchActions = `<button class="start-btn" onclick="startFixture('${fixture.id}')">▶ Start Match</button>`;
        } else if (fixture.status === 'ongoing') {
            matchActions = `<button class="complete-btn" onclick="completeMatchFromFixture('${fixture.id}')">🏆 Complete Match</button>`;
        }
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
                <div class="fixture-detail-item venue">📍 ${fixture.venue || 'PalTalk Room'}</div>
                ${fixture.host ? `<div class="fixture-detail-item host"><span class="host-label">🎙️ Host:</span> <span class="host-name">${fixture.host}</span></div>` : ''}
                ${fixture.result ? `<div class="fixture-detail-item result">🏆 Winner: ${fixture.result}</div>` : ''}
                ${fixture.manOfMatch ? `<div class="fixture-detail-item mom">⭐ MOM: ${fixture.manOfMatch}</div>` : ''}
            </div>
            <div class="fixture-bottom">
                <span class="status ${statusColors[fixture.status] || 'scheduled'}">${fixture.status.toUpperCase()}</span>
                <div class="fixture-actions">${matchActions}</div>
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
    const select = document.getElementById('completeFixtureSelect');
    if (select) select.value = fixtureId;
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

// Fixtures admin
function toggleFixtureAdmin() {
    const login = document.getElementById('fixtureAdminLogin');
    if (!login) return;
    if (login.style.display === 'flex') {
        login.style.display = 'none';
    } else {
        login.style.display = 'flex';
        const pw = document.getElementById('fixtureAdminPassword');
        if (pw) pw.value = '';
        const err = document.getElementById('fixtureAdminError');
        if (err) err.style.display = 'none';
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
        if (window.fixtures) updateFixtures(window.fixtures);
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
    if (window.fixtures) updateFixtures(window.fixtures);
}

function editFixture(fixtureId) {
    const fixtures = window.fixtures || { matches: [] };
    const fixture = fixtures.matches.find(f => f.id === fixtureId);
    if (!fixture) return showNotification('⚠️ Fixture not found!', 'danger');

    const team1Name = getTeamNameById(fixture.team1);
    const team2Name = getTeamNameById(fixture.team2);

    const message = `✏️ EDIT FIXTURE\n\n` +
        `Format: Team 1, Team 2, Date (YYYY-MM-DD), Time (HH:MM), Venue, Host\n\n` +
        `Example: Delhi Capitals, SRH, 2026-08-25, 21:30, PalTalk Room, Gemstar`;

    const input = prompt(message,
        `${team1Name}, ${team2Name}, ${new Date(fixture.date).toISOString().split('T')[0]}, 21:30, ${fixture.venue || 'PalTalk Room'}, ${fixture.host || ''}`
    );

    if (input === null) return;

    const parts = input.split(',').map(p => p.trim()).filter(p => p);
    if (parts.length < 4) {
        return showNotification('⚠️ Please enter at least: Team1, Team2, Date, Time', 'danger');
    }

    const [newTeam1, newTeam2, newDate, newTime, newVenue = 'PalTalk Room', newHost = ''] = parts;
    const dateTime = newDate + 'T' + newTime;

    fetch('/api/fixtures/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            ...fixture,
            team1: newTeam1,
            team2: newTeam2,
            date: dateTime,
            venue: newVenue,
            host: newHost
        })
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
// ADMIN PAGE
// ============================================

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

function createTeamFromAdmin() {
    const name = document.getElementById('adminTeamName').value.trim();
    const captain = document.getElementById('adminCaptain').value.trim();
    const viceCaptain = document.getElementById('adminViceCaptain').value.trim();
    const squadRaw = document.getElementById('adminSquad').value.trim();

    if (!name || !captain || !viceCaptain) {
        return showNotification('⚠️ Please fill all required fields!', 'danger');
    }

    const squad = squadRaw ? squadRaw.split(',').map(p => p.trim()).filter(p => p) : [];

    if (!squad.includes(captain)) {
        return showNotification(`⚠️ Captain "${captain}" must be in squad!`, 'danger');
    }
    if (!squad.includes(viceCaptain)) {
        return showNotification(`⚠️ Vice Captain "${viceCaptain}" must be in squad!`, 'danger');
    }

    socket.emit('createTeam', { name, captain, viceCaptain, squad });

    ['adminTeamName', 'adminCaptain', 'adminViceCaptain', 'adminSquad'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });

    showNotification(`✅ Team "${name}" created!`, 'success');
}

function setupMatchFromAdmin() {
    const team1Id = document.getElementById('adminTeam1').value;
    const team2Id = document.getElementById('adminTeam2').value;
    const team1Order = document.getElementById('adminTeam1Order').value.trim();
    const team2Order = document.getElementById('adminTeam2Order').value.trim();

    if (!team1Id || !team2Id) return showNotification('⚠️ Please select both teams!', 'danger');
    if (team1Id === team2Id) return showNotification('⚠️ Teams must be different!', 'danger');

    socket.emit('setupMatch', {
        team1Id, team2Id,
        team1Order: team1Order ? team1Order.split(',').map(p => p.trim()) : undefined,
        team2Order: team2Order ? team2Order.split(',').map(p => p.trim()) : undefined
    });

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

    if (!team1 || !team2) return showNotification('⚠️ Please select both teams!', 'danger');
    if (team1 === team2) return showNotification('⚠️ Teams must be different!', 'danger');
    if (!date) return showNotification('⚠️ Please select a date!', 'danger');

    const team1Name = getTeamNameById(team1);
    const team2Name = getTeamNameById(team2);
    const dateTime = date + (time ? 'T' + time : '');

    socket.emit('createFixture', { team1: team1Name, team2: team2Name, date: dateTime, venue, host });

    ['adminFixtureDate', 'adminFixtureTime', 'adminFixtureVenue', 'adminFixtureHost'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });

    showNotification(`📅 Fixture created: ${team1Name} vs ${team2Name}`, 'success');
}

function updateWinnerSelect(fixtures, fixtureId) {
    const select = document.getElementById('adminWinnerSelect');
    if (!select) return;

    const fixture = fixtures.matches.find(m => m.id === fixtureId);
    if (!fixture) {
        select.innerHTML = '<option value="">Select Winner</option>';
        return;
    }

    select.innerHTML = `
        <option value="">Select Winner</option>
        <option value="${fixture.team1}">${fixture.team1}</option>
        <option value="${fixture.team2}">${fixture.team2}</option>
    `;
}

function updateCompleteMatchForm() {
    const fixtureId = document.getElementById('adminCompleteMatchSelect').value;
    if (!fixtureId) {
        document.getElementById('adminWinnerSelect').innerHTML = '<option value="">Select Winner</option>';
        return;
    }
    updateWinnerSelect(window.fixtures || { matches: [] }, fixtureId);
}

function completeMatchFromAdmin() {
    const fixtureId = document.getElementById('adminCompleteMatchSelect').value;
    const team1Runs = parseInt(document.getElementById('adminTeam1Runs').value);
    const team1Overs = parseFloat(document.getElementById('adminTeam1Overs').value);
    const team2Runs = parseInt(document.getElementById('adminTeam2Runs').value);
    const team2Overs = parseFloat(document.getElementById('adminTeam2Overs').value);
    const winner = document.getElementById('adminWinnerSelect').value;
    const round = parseInt(document.getElementById('adminRoundSelect')?.value || 1);

    if (!fixtureId) return showNotification('⚠️ Please select a match!', 'danger');
    if (isNaN(team1Runs) || isNaN(team2Runs) || team1Runs < 0 || team2Runs < 0) {
        return showNotification('⚠️ Please enter valid runs for both teams!', 'danger');
    }
    if (isNaN(team1Overs) || isNaN(team2Overs) || team1Overs <= 0 || team2Overs <= 0) {
        return showNotification('⚠️ Please enter valid overs!', 'danger');
    }
    if (!winner) return showNotification('⚠️ Please select the winner!', 'danger');

    const fixtures = window.fixtures || { matches: [] };
    const fixture = fixtures.matches.find(m => m.id === fixtureId);
    if (fixture && fixture.status === 'completed') {
        return showNotification('⚠️ This match is already completed!', 'danger');
    }

    socket.emit('completeFixtureWithScore', {
        fixtureId, team1Runs, team1Overs, team2Runs, team2Overs,
        winner, manOfMatch: 'Not Applicable', round
    });

    document.getElementById('adminCompleteMatchSelect').value = '';
    document.getElementById('adminTeam1Runs').value = '';
    document.getElementById('adminTeam1Overs').value = '4';
    document.getElementById('adminTeam2Runs').value = '';
    document.getElementById('adminTeam2Overs').value = '4';
    document.getElementById('adminWinnerSelect').innerHTML = '<option value="">Select Winner</option>';

    showNotification(`✅ Match completed! Winner: ${winner}`, 'success');
}

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
                    winner
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
                ${(team.squad || []).map(p => `<span class="squad-tag">${p}</span>`).join('')}
            </div>
        </div>
    `).join('');
}

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
                🏆 Winner: ${f.result || f.winner || '-'}
                ${f.manOfMatch ? `| ⭐ MOM: ${f.manOfMatch}` : ''}
                | 📅 ${new Date(f.date).toLocaleDateString()}
            </div>
        </div>
    `).join('');
}

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
                csv += '\n=== TOP BATSMEN ===\nPlayer,Runs,Balls,Fours,Sixes,Avg,SR\n';
                batsmen.forEach(p => {
                    csv += `${p.name},${p.runs},${p.balls},${p.fours},${p.sixes},${p.average},${p.strikeRate}\n`;
                });
                const bowlers = type === 'all' ? data.topBowlers : data.bowlers;
                csv += '\n=== TOP BOWLERS ===\nPlayer,Wickets,Balls,Runs,Economy,Best\n';
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

// ============================================
// POINTS TABLE PAGE - ROUNDS
// ============================================

function showRound(round) {
    document.querySelectorAll('.round-content').forEach(el => {
        el.style.display = 'none';
    });

    const target = document.getElementById('round' + round);
    if (target) target.style.display = 'block';

    document.querySelectorAll('.round-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`.round-btn[data-round="${round}"]`)?.classList.add('active');
}

function updatePlayoffTeams(team1, team2, team3, team4) {
    if (team1) document.getElementById('q1t1').textContent = team1;
    if (team2) document.getElementById('q1t2').textContent = team2;
    if (team3) document.getElementById('e1t1').textContent = team3;
    if (team4) document.getElementById('e1t2').textContent = team4;
}

function updateFinalTeams(team1, team2) {
    if (team1) document.getElementById('finalTeam1').textContent = team1;
    if (team2) document.getElementById('finalTeam2').textContent = team2;
}

function updateFinalResult(champion, runnerUp) {
    if (champion) document.getElementById('champion').textContent = champion;
    if (runnerUp) document.getElementById('runnerUp').textContent = runnerUp;
}

// ============================================
// TEAMS GROUPING / AUCTION
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
        showNotification('✅ Admin access granted!', 'success');
        updateTeamsGrouping();
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

    const renderGroup = (data) => data.map(team => `
        <div class="team-item group-team">
            <span class="team-name">🏏 ${team.name || 'Unnamed Team'}</span>
            <div class="team-actions">
                <button class="edit-btn" onclick="editGroupTeam('${team.id}')">✏️</button>
                <button class="delete-btn" onclick="removeTeamFromGroup('${team.id}')">🗑️</button>
            </div>
        </div>
    `).join('');

    const groupAContainer = document.getElementById('groupAList');
    if (groupAContainer) {
        groupAContainer.innerHTML = teamsGroupingData.groupA.length === 0
            ? '<p class="empty-message">No teams</p>'
            : renderGroup(teamsGroupingData.groupA);
    }

    const groupBContainer = document.getElementById('groupBList');
    if (groupBContainer) {
        groupBContainer.innerHTML = teamsGroupingData.groupB.length === 0
            ? '<p class="empty-message">No teams</p>'
            : renderGroup(teamsGroupingData.groupB);
    }
}

function pickRandomTeam() {
    if (teamsGroupingData.available.length === 0) {
        return showNotification('⚠️ No teams available to pick!', 'danger');
    }

    const randomIndex = Math.floor(Math.random() * teamsGroupingData.available.length);
    const team = teamsGroupingData.available[randomIndex];
    const group = lastAssignedGroup === 'A' ? 'B' : 'A';
    lastAssignedGroup = group;

    const audio = document.getElementById('revealSound');
    if (audio) {
        audio.currentTime = 0;
        audio.play().catch(err => console.log('Sound play error:', err));
    }

    setTimeout(() => showTeamReveal(team, group), 1500);
}

function showTeamReveal(team, group) {
    if (!team || !team.name) {
        return showNotification('⚠️ Team not found! Please refresh and try again.', 'danger');
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

function assignTeamToGroup(teamId, group) {
    const teamIndex = teamsGroupingData.available.findIndex(t => t.id === teamId);
    if (teamIndex !== -1) {
        const team = teamsGroupingData.available.splice(teamIndex, 1)[0];
        team.group = group;
        if (group === 'A') teamsGroupingData.groupA.push(team);
        else teamsGroupingData.groupB.push(team);
        renderTeamsGrouping();
        socket.emit('getPointsTable');
    }

    fetch('/api/teams/update-group', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: teamId, group })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            showNotification(`✅ Team assigned to Group ${group}!`, 'success');
        }
    })
    .catch(err => {
        showNotification('❌ Error assigning team', 'danger');
        console.error(err);
        updateTeamsGrouping();
    });
}

function removeTeamFromGroup(teamId) {
    if (!confirm('Remove this team from group? It will become available again.')) return;

    fetch('/api/teams/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: teamId, group: null })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            showNotification('🗑️ Team removed from group', 'warning');
            updateTeamsGrouping();
            socket.emit('getPointsTable');
            fetch('/api/points-table')
                .then(res => res.json())
                .then(tableData => updatePointsTable(tableData))
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
    if (!team) return showNotification('⚠️ Team not found!', 'danger');

    const newName = prompt('Edit Team Name:', team.name);
    if (newName === null) return;

    const newGroup = prompt(`Edit Group (A/B) for ${newName}:`, team.group || '');
    if (newGroup === null) return;

    fetch('/api/teams/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            ...team,
            name: newName.trim(),
            group: newGroup.toUpperCase() === 'A' ? 'A' : newGroup.toUpperCase() === 'B' ? 'B' : null
        })
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
// LIVE SCORE - ADMIN LOCK (Unified logout)
// ============================================

function toggleAdminLock() {
    const popup = document.getElementById('adminLoginPopup');
    const pwInput = document.getElementById('adminPasswordInput');
    const errEl = document.getElementById('adminLoginError');
    if (popup) popup.style.display = 'flex';
    if (pwInput) pwInput.value = '';
    if (errEl) errEl.style.display = 'none';
}

function closeAdminLogin() {
    const popup = document.getElementById('adminLoginPopup');
    if (popup) popup.style.display = 'none';
}

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
        const controls = document.querySelector('.game-controls');
        if (controls) controls.style.display = 'grid';
        document.querySelectorAll('.ball-edit-btn').forEach(b => b.style.display = 'inline-block');
        document.querySelectorAll('.ball-delete-btn').forEach(b => b.style.display = 'inline-block');
        const resetBtn = document.getElementById('resetMatchBtn');
        if (resetBtn) resetBtn.style.display = 'inline-block';
        const finishBtn = document.getElementById('finishMatchBtn');
        if (finishBtn) finishBtn.style.display = 'inline-block';
        populateTeamDropdowns();
        showNotification('✅ Admin Mode Activated!', 'success');
    } else {
        const errEl = document.getElementById('adminLoginError');
        if (errEl) errEl.style.display = 'block';
        document.getElementById('adminPasswordInput').value = '';
        document.getElementById('adminPasswordInput').focus();
    }
}

/**
 * Unified logout: handles both the Admin page and Live Score admin states.
 * Safe to call from either context.
 */
function logoutAdmin() {
    // Live Score admin mode
    isAdminMode = false;
    const modeStatus = document.getElementById('adminModeStatus');
    if (modeStatus) {
        modeStatus.textContent = '👤 Read-Only';
        modeStatus.className = 'admin-status read-only';
    }
    const lockBtn = document.getElementById('adminLockBtn');
    if (lockBtn) lockBtn.style.display = 'inline-block';
    const logoutBtn = document.getElementById('adminLogoutBtn');
    if (logoutBtn) logoutBtn.style.display = 'none';
    const controls = document.querySelector('.game-controls');
    if (controls) controls.style.display = 'none';
    document.querySelectorAll('.ball-edit-btn').forEach(b => b.style.display = 'none');
    document.querySelectorAll('.ball-delete-btn').forEach(b => b.style.display = 'none');
    const resetBtn = document.getElementById('resetMatchBtn');
    if (resetBtn) resetBtn.style.display = 'none';
     const finishBtn = document.getElementById('finishMatchBtn');
    if (finishBtn) finishBtn.style.display = 'none';
    const teamSelection = document.querySelector('.team-selection');
    if (teamSelection) teamSelection.style.display = 'none';

    // Admin page mode
    const adminLogin = document.getElementById('adminLogin');
    const adminContent = document.getElementById('adminContent');
    if (adminLogin) adminLogin.style.display = 'block';
    if (adminContent) adminContent.style.display = 'none';
    const adminPassword = document.getElementById('adminPassword');
    if (adminPassword) adminPassword.value = '';

    showNotification('🔒 Logged out from Admin Mode', 'warning');
}

// ============================================
// LIVE SCORE - DROPDOWNS
// ============================================

function populateTeamDropdowns() {
    const teams = window.teams || [];
    if (teams.length === 0) return;

    const battingSelect = document.getElementById('battingTeamSelect');
    const bowlingSelect = document.getElementById('bowlingTeamSelect');

    if (battingSelect) {
        battingSelect.innerHTML = '<option value="">Select Batting Team</option>';
        teams.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t.name;
            opt.textContent = t.name;
            battingSelect.appendChild(opt);
        });
    }
    if (bowlingSelect) {
        bowlingSelect.innerHTML = '<option value="">Select Bowling Team</option>';
        teams.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t.name;
            opt.textContent = t.name;
            bowlingSelect.appendChild(opt);
        });
    }
}

function populateDropdowns(teams, matchTeam1, matchTeam2) {
    const players = [];
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

    const bowlerSelect = document.getElementById('bowlerSelect');
    if (bowlerSelect) {
        bowlerSelect.innerHTML = '<option value="">Select Bowler...</option><option value="__manual__">✏️ Type manually...</option>';
        players.forEach(p => {
            const option = document.createElement('option');
            option.value = p;
            option.textContent = p;
            if (currentMatchState?.bowlers) {
                const bowlerStats = currentMatchState.bowlers.find(b => b.name === p);
                const oversBowled = bowlerStats?.overs || 0;
                if (oversBowled >= 1) {
                    option.textContent = `${p} (1 over done)`;
                    option.disabled = true;
                }
            }
            bowlerSelect.appendChild(option);
        });
    }

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

function toggleBatsmanManualInput() {
    const select = document.getElementById('batsmanSelect');
    const manualDiv = document.getElementById('batsmanManualInput');
    if (!select || !manualDiv) return;
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
    if (!select || !manualDiv) return;
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
    if (!select || !manualDiv) return;
    if (select.value === '__manual__') {
        manualDiv.style.display = 'block';
        document.getElementById('nonStrikerManualName').focus();
    } else {
        manualDiv.style.display = 'none';
    }
}

// ============================================
// LIVE SCORE - UPDATE MATCH STATE
// ============================================

function updateMatchState(state) {
    if (!state) return;
    currentMatchState = state;

    // Scoreboard
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

    // Striker / non-striker display
    const strikerName = document.getElementById('strikerName');
    if (strikerName) strikerName.textContent = state.striker || '-';
    const nonStrikerName = document.getElementById('nonStrikerName');
    if (nonStrikerName) nonStrikerName.textContent = state.nonStriker || '-';

    // Bowler
    const currentBowler = document.getElementById('currentBowler');
    const bowlerSelect = document.getElementById('bowlerSelect');
    if (state.currentBowlerName) {
        let bowlerStats = '';
        if (state.bowlers) {
            const bowler = state.bowlers.find(b => b.name === state.currentBowlerName);
            if (bowler) {
                bowlerStats = ` ${bowler.wickets}/${bowler.runsConceded || 0} (${bowler.overs || 0} ov)`;
            }
        }
        if (currentBowler) currentBowler.textContent = state.currentBowlerName + bowlerStats;
        if (bowlerSelect) {
            let exists = false;
            for (let i = 0; i < bowlerSelect.options.length; i++) {
                if (bowlerSelect.options[i].value === state.currentBowlerName) { exists = true; break; }
            }
            if (exists) bowlerSelect.value = state.currentBowlerName;
        }
    } else {
        if (currentBowler) currentBowler.textContent = '-';
        if (bowlerSelect) bowlerSelect.value = '';
    }

    // Batsman dropdown auto-select
   // Batsman dropdown auto-select / clear
const batsmanSelect = document.getElementById('batsmanSelect');
if (batsmanSelect) {
    if (state.striker) {
        let exists = false;
        for (let i = 0; i < batsmanSelect.options.length; i++) {
            if (batsmanSelect.options[i].value === state.striker) { exists = true; break; }
        }
        if (exists) {
            batsmanSelect.value = state.striker;
        } else {
            const opt = document.createElement('option');
            opt.value = state.striker;
            opt.textContent = state.striker;
            batsmanSelect.appendChild(opt);
            batsmanSelect.value = state.striker;
        }
    } else {
        batsmanSelect.value = '';
    }
}

    // Non-striker dropdown auto-select
   // Non-striker dropdown auto-select / clear
const nonStrikerSelect = document.getElementById('nonStrikerSelect');
if (nonStrikerSelect) {
    if (state.nonStriker && state.nonStriker !== 'Non-Striker') {
        let exists = false;
        for (let i = 0; i < nonStrikerSelect.options.length; i++) {
            if (nonStrikerSelect.options[i].value === state.nonStriker) { exists = true; break; }
        }
        if (exists) {
            nonStrikerSelect.value = state.nonStriker;
        } else {
            const opt = document.createElement('option');
            opt.value = state.nonStriker;
            opt.textContent = state.nonStriker;
            nonStrikerSelect.appendChild(opt);
            nonStrikerSelect.value = state.nonStriker;
        }
        const nonStrikerStatus = document.getElementById('nonStrikerStatus');
        if (nonStrikerStatus) {
            nonStrikerStatus.textContent = `✅ ${state.nonStriker}`;
            nonStrikerStatus.className = 'status-msg success';
        }
    } else {
        nonStrikerSelect.value = '';
        const nonStrikerStatus = document.getElementById('nonStrikerStatus');
        if (nonStrikerStatus) {
            nonStrikerStatus.textContent = '⏳ Not set';
            nonStrikerStatus.className = 'status-msg waiting';
        }
    }
}

    // NO strikePending block (removed - server no longer sends it)

    updateScorecard(state);
    updateBallByBall(state);
    updateAllowedScores(state);
}

function updateScorecard(state) {
    if (!state) return;

    const batsmen = state.batsmen || [];
    const batsmenContainer = document.getElementById('batsmenScorecard');
    if (batsmenContainer) {
        if (batsmen.length === 0) {
            batsmenContainer.innerHTML = '<p class="empty-message">No batsmen yet</p>';
        } else {
            batsmenContainer.innerHTML = batsmen.map(b => `
                <div class="scorecard-player">
                    <span class="sc-name">${b.name}</span>
                    <span class="sc-stats">${b.runs || 0}(${b.balls || 0}) ${b.fours || 0}x4 ${b.sixes || 0}x6</span>
                </div>
            `).join('');
        }
    }

    const bowlers = state.bowlers || [];
    const bowlersContainer = document.getElementById('bowlersScorecard');
    if (bowlersContainer) {
        if (bowlers.length === 0) {
            bowlersContainer.innerHTML = '<p class="empty-message">No bowlers yet</p>';
        } else {
            bowlersContainer.innerHTML = bowlers.map(b => `
                <div class="scorecard-player">
                    <span class="sc-name">${b.name}</span>
                    <span class="sc-stats">${b.wickets || 0}w ${b.runsConceded || 0}r ${b.overs || 0}ov</span>
                </div>
            `).join('');
        }
    }
}

function updateBallByBall(state) {
    if (!state) return;

    const balls = state.ballLog || [];
    const container = document.getElementById('ballByBall');
    if (!container) return;

    if (balls.length === 0) {
        container.innerHTML = '<p class="empty-message">No balls bowled yet</p>';
        return;
    }

    container.innerHTML = balls.map((ball, index) => {
        const editBtn = isAdminMode ? `<button class="ball-edit-btn" onclick="editBall(${index})" style="display:inline-block;">✏️</button>` : '';
        const deleteBtn = isAdminMode ? `<button class="ball-delete-btn" onclick="deleteBall(${index})" style="display:inline-block;">🗑️</button>` : '';
        const corrected = ball.corrected ? ' [Corrected]' : '';
        const resultClass = ball.resultClass || '';
        return `
            <div class="ball-entry">
                <span class="ball-over">${ball.over || '0.0'}</span>
                <span class="ball-result ${resultClass}">${ball.result || ''}${corrected}</span>
                <span class="ball-actions">${editBtn}${deleteBtn}</span>
            </div>
        `;
    }).join('');
}

// ============================================
// LIVE SCORE - SUBMIT FUNCTIONS
// ============================================

function submitBatScore() {
    if (!isAdminMode) return showNotification('⚠️ Admin login required!', 'danger');

    const select = document.getElementById('batsmanSelect');
    let name = select.value;

    if (name === '__manual__') {
        name = document.getElementById('batsmanManualName').value.trim();
        if (!name) return showNotification('⚠️ Please enter batsman name!', 'danger');
    }

    if (!name) return showNotification('⚠️ Please select batsman!', 'danger');

    const score = parseInt(document.getElementById('batsmanScoreInput').value);
    if (isNaN(score) || score < 3 || score > 6) {
        return showNotification('⚠️ Score must be 3, 4, 5, or 6!', 'danger');
    }

    const batsmanStatus = document.getElementById('batsmanStatus');
    if (batsmanStatus) {
        batsmanStatus.textContent = '⏳ Sending score...';
        batsmanStatus.className = 'status-msg waiting';
    }

    socket.emit('batsmanSetScore', { name, score });
    document.getElementById('batsmanScoreInput').value = '';
}

function submitBowlGuess() {
    if (!isAdminMode) return showNotification('⚠️ Admin login required!', 'danger');
    if (!batsmanScoreSet) {
        return showNotification('⚠️ Batsman has not set score yet! Bowler cannot guess first.', 'danger');
    }

    const select = document.getElementById('bowlerSelect');
    let name = select.value;

    if (name === '__manual__') {
        name = document.getElementById('bowlerManualName').value.trim();
        if (!name) return showNotification('⚠️ Please enter bowler name!', 'danger');
    }

    if (!name) return showNotification('⚠️ Please select bowler!', 'danger');

    const guess = parseInt(document.getElementById('bowlerGuessInput').value);
    if (isNaN(guess) || guess < 3 || guess > 6) {
        return showNotification('⚠️ Guess must be 3, 4, 5, or 6!', 'danger');
    }

    const bowlerStatus = document.getElementById('bowlerStatus');
    if (bowlerStatus) {
        bowlerStatus.textContent = '⏳ Sending guess...';
        bowlerStatus.className = 'status-msg waiting';
    }

    socket.emit('bowlerGuess', { name, guess });
    document.getElementById('bowlerGuessInput').value = '';
}

function setNonStriker() {
    if (!isAdminMode) return showNotification('⚠️ Admin login required!', 'danger');

    const select = document.getElementById('nonStrikerSelect');
    let name = select.value;

    if (name === '__manual__') {
        name = document.getElementById('nonStrikerManualName').value.trim();
        if (!name) return showNotification('⚠️ Please enter non-striker name!', 'danger');
    }

    if (!name) return showNotification('⚠️ Please select non-striker!', 'danger');

    socket.emit('setNonStriker', { name });

    const statusEl = document.getElementById('nonStrikerStatus');
    if (statusEl) {
        statusEl.textContent = `✅ ${name}`;
        statusEl.className = 'status-msg success';
    }
    showNotification(`🔄 Non-Striker set: ${name}`, 'success');
}

function applyPenalty(type) {
    if (!isAdminMode) return showNotification('⚠️ Admin login required!', 'danger');

    let penaltyData;

    if (type === 'batsman') {
        const playerName = document.getElementById('penaltyBatsmanSelect').value;
        const offence = document.getElementById('penaltyBatsmanOffence').value;
        if (!playerName || !offence) return showNotification('⚠️ Please select batsman and offence!', 'danger');
        penaltyData = { type: 'batsman', player: playerName, offence };
    } else if (type === 'bowler') {
        const playerName = document.getElementById('penaltyBowlerSelect').value;
        const offence = document.getElementById('penaltyBowlerOffence').value;
        if (!playerName || !offence) return showNotification('⚠️ Please select bowler and offence!', 'danger');
        penaltyData = { type: 'bowler', player: playerName, offence };
    } else {
        return;
    }

    socket.emit('applyPenalty', penaltyData);

    const statusEl = document.getElementById('penaltyStatus');
    if (statusEl) {
        statusEl.textContent = '⏳ Applying penalty...';
        statusEl.className = 'status-msg waiting';
    }
}

// ============================================
// LIVE SCORE - EDIT / DELETE BALL
// ============================================

function editBall(index) {
    if (!isAdminMode) return showNotification('⚠️ Admin login required!', 'danger');

    editBallIndex = index;
    const state = currentMatchState;
    if (!state || !state.ballLog || !state.ballLog[index]) {
        return showNotification('⚠️ Ball not found!', 'danger');
    }

    const ball = state.ballLog[index];
    document.getElementById('editBallOver').textContent = ball.over || '0.0';
    document.getElementById('editCurrentData').textContent =
        `${ball.batsman || 'Unknown'} ${ball.batsmanScore || '?'} | ${ball.bowler || 'Unknown'} ${ball.bowlerGuess || '?'} → ${ball.result || '?'}`;

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
        const manualOpt = document.createElement('option');
        manualOpt.value = '__manual__';
        manualOpt.textContent = '✏️ Type manually...';
        batsmanSelect.appendChild(manualOpt);
    }

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
    if (editBallIndex === null) return showNotification('⚠️ No ball selected!', 'danger');

    let newBatsman = document.getElementById('editBatsmanSelect').value;
    if (newBatsman === '__manual__') {
        newBatsman = prompt('Enter batsman name:');
        if (!newBatsman || !newBatsman.trim()) return showNotification('⚠️ Please enter batsman name!', 'danger');
        newBatsman = newBatsman.trim();
    }
    const newScore = parseInt(document.getElementById('editBatsmanScore').value);

    let newBowler = document.getElementById('editBowlerSelect').value;
    if (newBowler === '__manual__') {
        newBowler = prompt('Enter bowler name:');
        if (!newBowler || !newBowler.trim()) return showNotification('⚠️ Please enter bowler name!', 'danger');
        newBowler = newBowler.trim();
    }
    const newGuess = parseInt(document.getElementById('editBowlerGuess').value);

    if (!newBatsman || isNaN(newScore) || !newBowler || isNaN(newGuess)) {
        return showNotification('⚠️ Please fill all fields!', 'danger');
    }
    if (newScore < 3 || newScore > 6 || newGuess < 3 || newGuess > 6) {
        return showNotification('⚠️ Score and guess must be 3-6!', 'danger');
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

function deleteBall(index) {
    if (!isAdminMode) return showNotification('⚠️ Admin login required!', 'danger');
    if (confirm(`Are you sure you want to delete ball ${index + 1}?`)) {
        socket.emit('deleteBall', { index });
        showNotification('⏳ Deleting ball...', 'warning');
    }
}

// ============================================
// LIVE SCORE - TEAM SELECTION
// ============================================

function setBattingBowlingTeams() {
    if (!isAdminMode) return showNotification('⚠️ Admin login required!', 'danger');

    const battingTeam = document.getElementById('battingTeamSelect').value;
    const bowlingTeam = document.getElementById('bowlingTeamSelect').value;

    if (!battingTeam || !bowlingTeam) return showNotification('⚠️ Please select both teams!', 'danger');
    if (battingTeam === bowlingTeam) {
        return showNotification('⚠️ Batting and bowling teams must be different!', 'danger');
    }

    socket.emit('setBattingBowlingTeams', { battingTeam, bowlingTeam });

    const statusEl = document.getElementById('teamSelectionStatus');
    if (statusEl) {
        statusEl.textContent = `⏳ Setting teams: ${battingTeam} (bat) vs ${bowlingTeam} (bowl)...`;
        statusEl.className = 'status-msg waiting';
    }
}

function resetMatch() {
    if (confirm('Are you sure you want to reset the match? All data will be lost.')) {
        socket.emit('resetMatch');
    }
}
/**
 * Finish Match — Admin only.
 * Sends the finishMatch event to server. Server merges player stats,
 * updates points table, syncs Google Sheet, and marks match complete.
 */
function finishMatch() {
    if (!isAdminMode) {
        return showNotification('⚠️ Admin login required!', 'danger');
    }

    const state = currentMatchState;
    if (!state) {
        return showNotification('⚠️ No match state available', 'danger');
    }

    if (!state.isActive) {
        return showNotification('⚠️ No active match to finish', 'warning');
    }

    if (state.isComplete) {
        return showNotification('⚠️ Match already finished', 'warning');
    }

    // Confirm with details
    const team1 = state.battingTeam?.name || 'Team 1';
    const team2 = state.bowlingTeam?.name || 'Team 2';
    const runs = state.battingTeam?.runs || 0;

    const confirmMsg =
        `🏁 FINISH MATCH?\n\n` +
        `${team1} vs ${team2}\n` +
        `Current score: ${runs}\n\n` +
        `This will:\n` +
        `• Finalize the match\n` +
        `• Update the Points Table\n` +
        `• Update Top Batsmen / Top Bowlers\n` +
        `• Sync to Google Sheet\n` +
        `• Make Live Score read-only\n\n` +
        `This cannot be undone from here. Use Admin page to correct results.\n\n` +
        `Continue?`;

    if (!confirm(confirmMsg)) return;

    socket.emit('finishMatch');
    showNotification('⏳ Finishing match...', 'warning');
}
// ============================================
// HELPER FUNCTIONS
// ============================================

function getTeamNameById(teamId) {
    if (typeof teamId === 'string' && isNaN(teamId)) return teamId;
    const team = teams.find(t => t.id === teamId);
    if (team) return team.name;
    return teamId || 'Unknown Team';
}

// ============================================
// KEYBOARD SUPPORT
// ============================================

document.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && document.getElementById('auctionPassword') === document.activeElement) {
        checkAuctionPassword();
    }
    if (e.key === 'Enter' && document.getElementById('teamsPassword') === document.activeElement) {
        checkTeamsPassword();
    }
    if (e.key === 'Enter' && document.getElementById('fixtureAdminPassword') === document.activeElement) {
        checkFixtureAdminPassword();
    }
});

console.log('🏏 GCL Frontend loaded successfully!');
console.log('📡 Waiting for socket connection...');
