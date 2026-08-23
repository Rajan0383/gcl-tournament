const express = require('express');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000;

// ============================================
// MONGODB CONNECTION
// ============================================

const MONGODB_URI = process.env.MONGODB_URI || '';
let dbClient = null;
let db = null;
let useDatabase = false;
// ============================================
// MIDDLEWARE
// ============================================

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Root route - Serve index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
async function connectMongoDB() {
    if (!MONGODB_URI) {
        console.log('⚠️ MONGODB_URI not found. Using local file storage.');
        return false;
    }
    
    try {
        console.log('🔄 Connecting to MongoDB...');
        dbClient = new MongoClient(MONGODB_URI);
        await dbClient.connect();
        db = dbClient.db('gcl_tournament');
        useDatabase = true;
        console.log('✅ Connected to MongoDB successfully!');
        return true;
    } catch (error) {
        console.error('❌ MongoDB connection failed:', error.message);
        console.log('📁 Falling back to local file storage.');
        return false;
    }
}

async function loadData(collectionName, defaultData) {
    if (useDatabase && db) {
        try {
            const collection = db.collection(collectionName);
            const data = await collection.findOne({ _id: 'data' });
            return data ? data.value : defaultData;
        } catch (error) {
            console.error(`Error loading ${collectionName}:`, error);
            return defaultData;
        }
    } else {
        const filePath = path.join(__dirname, 'data', `${collectionName}.json`);
        if (fs.existsSync(filePath)) {
            try {
                return JSON.parse(fs.readFileSync(filePath, 'utf8'));
            } catch (e) {
                return defaultData;
            }
        }
        return defaultData;
    }
}

async function saveData(collectionName, data) {
    if (useDatabase && db) {
        try {
            const collection = db.collection(collectionName);
            await collection.updateOne(
                { _id: 'data' },
                { $set: { value: data } },
                { upsert: true }
            );
            return true;
        } catch (error) {
            console.error(`Error saving ${collectionName}:`, error);
            return false;
        }
    } else {
        const dataDir = path.join(__dirname, 'data');
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir);
        }
        const filePath = path.join(dataDir, `${collectionName}.json`);
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        return true;
    }
}

// ============================================
// GAME ENGINE - COMPLETE
// ============================================

class GCLEngine {
    constructor() {
        this.resetMatch();
        this.teams = [];
        this.tournamentStats = { matches: 0, teams: {} };
        this.fixtures = { matches: [], upcoming: [], completed: [] };
        this.playerStats = { batsmen: {}, bowlers: {}, manOfMatch: [] };
        this.currentMatchStats = { batsmen: {}, bowlers: {}, manOfMatchCandidates: [] };
        this.striker = null;
        this.nonStriker = null;
        this.strikeChanged = false;
        this.isLoaded = false;
    }

    async loadAllData() {
        try {
            this.teams = await loadData('teams', []);
            this.tournamentStats = await loadData('stats', { matches: 0, teams: {} });
            this.fixtures = await loadData('fixtures', { matches: [], upcoming: [], completed: [] });
            this.playerStats = await loadData('playerStats', { batsmen: {}, bowlers: {}, manOfMatch: [] });
            this.isLoaded = true;
            console.log('📊 All data loaded successfully!');
        } catch (error) {
            console.error('Error loading data:', error);
        }
    }

    async saveAllData() {
        if (!this.isLoaded) return;
        try {
            await saveData('teams', this.teams);
            await saveData('stats', this.tournamentStats);
            await saveData('fixtures', this.fixtures);
            await saveData('playerStats', this.playerStats);
        } catch (error) {
            console.error('Error saving data:', error);
        }
    }

    // ============================================
    // TEAM MANAGEMENT
    // ============================================

    async createTeam(teamData) {
        const team = {
            id: Date.now().toString(),
            name: teamData.name,
            captain: teamData.captain,
            viceCaptain: teamData.viceCaptain,
            squad: teamData.squad || [],
            points: 0,
            matchesPlayed: 0,
            wins: 0,
            losses: 0,
            netRunRate: 0,
            runsScored: 0,
            runsConceded: 0,
            oversPlayed: 0,
            oversBowled: 0,
            createdAt: new Date().toISOString()
        };
        this.teams.push(team);
        await this.saveAllData();
        return team;
    }

    getTeam(id) {
        return this.teams.find(t => t.id === id);
    }

    getAllTeams() {
        return this.teams;
    }

    // ============================================
    // FIXTURE MANAGEMENT
    // ============================================

    async createFixture(matchData) {
        const fixture = {
            id: `FIX-${Date.now()}`,
            team1: matchData.team1,
            team2: matchData.team2,
            date: matchData.date || new Date().toISOString(),
            venue: matchData.venue || 'PalTalk Room',
            host: matchData.host || '',
            status: 'scheduled',
            result: null,
            matchId: null,
            manOfMatch: null,
            createdAt: new Date().toISOString()
        };
        this.fixtures.matches.push(fixture);
        this.fixtures.upcoming.push(fixture.id);
        await this.saveAllData();
        return fixture;
    }

    getFixtures() {
        return this.fixtures;
    }

    async startFixture(fixtureId) {
        const fixture = this.fixtures.matches.find(m => m.id === fixtureId);
        if (!fixture) throw new Error('Fixture not found');
        this.fixtures.upcoming = this.fixtures.upcoming.filter(id => id !== fixtureId);
        fixture.status = 'ongoing';
        const team1 = this.teams.find(t => t.name === fixture.team1);
        const team2 = this.teams.find(t => t.name === fixture.team2);
        if (team1 && team2) {
            this.setupMatch(team1.id, team2.id,
                team1.squad || [team1.captain, team1.viceCaptain, ...team1.squad],
                team2.squad || [team2.captain, team2.viceCaptain, ...team2.squad]
            );
            this.matchState.matchId = fixtureId;
            fixture.matchId = fixtureId;
        }
        await this.saveAllData();
        return fixture;
    }

    async completeFixture(fixtureId, winner, manOfMatch, playerStats) {
        const fixture = this.fixtures.matches.find(m => m.id === fixtureId);
        if (!fixture) throw new Error('Fixture not found');
        fixture.status = 'completed';
        fixture.result = winner;
        fixture.manOfMatch = manOfMatch;
        fixture.completedAt = new Date().toISOString();
        this.fixtures.completed.push(fixtureId);
        if (playerStats) this.updatePlayerStats(playerStats);
        if (manOfMatch) {
            this.playerStats.manOfMatch.push({
                player: manOfMatch,
                fixtureId: fixtureId,
                team: winner,
                date: new Date().toISOString()
            });
        }
        const team1 = this.teams.find(t => t.name === fixture.team1);
        const team2 = this.teams.find(t => t.name === fixture.team2);
        if (team1 && team2) {
            const matchResult = {
                team1: fixture.team1,
                team2: fixture.team2,
                winner: winner,
                runs1: this.matchState?.team1?.runs || 0,
                runs2: this.matchState?.team2?.runs || 0,
                overs1: 4,
                overs2: 4
            };
            this.updateTeamStats(matchResult);
        }
        this.striker = null;
        this.nonStriker = null;
        this.strikeChanged = false;
        await this.saveAllData();
        return fixture;
    }

    // ============================================
    // POINTS TABLE
    // ============================================

    getPointsTable() {
        const table = this.teams.map(team => ({
            rank: 0,
            name: team.name,
            matches: team.matchesPlayed || 0,
            wins: team.wins || 0,
            losses: team.losses || 0,
            points: team.points || 0,
            netRunRate: team.netRunRate || 0,
            runsScored: team.runsScored || 0,
            runsConceded: team.runsConceded || 0,
            oversPlayed: team.oversPlayed || 4,
            oversBowled: team.oversBowled || 4
        }));
        table.sort((a, b) => {
            if (b.points !== a.points) return b.points - a.points;
            return b.netRunRate - a.netRunRate;
        });
        table.forEach((team, index) => { team.rank = index + 1; });
        table.forEach(team => {
            if (team.oversPlayed > 0 && team.oversBowled > 0) {
                const runRate = team.runsScored / team.oversPlayed;
                const concededRate = team.runsConceded / team.oversBowled;
                team.netRunRate = parseFloat((runRate - concededRate).toFixed(3));
            }
        });
        return table;
    }

    updateTeamStats(matchResult) {
        const team1 = this.teams.find(t => t.name === matchResult.team1);
        const team2 = this.teams.find(t => t.name === matchResult.team2);
        if (team1) {
            team1.matchesPlayed = (team1.matchesPlayed || 0) + 1;
            team1.runsScored = (team1.runsScored || 0) + (matchResult.runs1 || 0);
            team1.runsConceded = (team1.runsConceded || 0) + (matchResult.runs2 || 0);
            team1.oversPlayed = (team1.oversPlayed || 0) + (matchResult.overs1 || 4);
            team1.oversBowled = (team1.oversBowled || 0) + (matchResult.overs2 || 4);
            if (matchResult.winner === team1.name) {
                team1.wins = (team1.wins || 0) + 1;
                team1.points = (team1.points || 0) + 2;
            } else {
                team1.losses = (team1.losses || 0) + 1;
            }
        }
        if (team2) {
            team2.matchesPlayed = (team2.matchesPlayed || 0) + 1;
            team2.runsScored = (team2.runsScored || 0) + (matchResult.runs2 || 0);
            team2.runsConceded = (team2.runsConceded || 0) + (matchResult.runs1 || 0);
            team2.oversPlayed = (team2.oversPlayed || 0) + (matchResult.overs2 || 4);
            team2.oversBowled = (team2.oversBowled || 0) + (matchResult.overs1 || 4);
            if (matchResult.winner === team2.name) {
                team2.wins = (team2.wins || 0) + 1;
                team2.points = (team2.points || 0) + 2;
            } else {
                team2.losses = (team2.losses || 0) + 1;
            }
        }
        this.saveAllData();
    }

    // ============================================
    // PLAYER STATISTICS
    // ============================================

    updatePlayerStats(stats) {
        for (const [player, data] of Object.entries(stats)) {
            if (!this.playerStats.batsmen[player]) {
                this.playerStats.batsmen[player] = {
                    runs: 0, balls: 0, fours: 0, sixes: 0, innings: 0, notOut: 0, highest: 0, average: 0, strikeRate: 0
                };
            }
            if (!this.playerStats.bowlers[player]) {
                this.playerStats.bowlers[player] = {
                    wickets: 0, balls: 0, runsConceded: 0, economy: 0, best: 0, matches: 0
                };
            }
            const bat = this.playerStats.batsmen[player];
            bat.runs += data.runs || 0;
            bat.balls += data.balls || 0;
            bat.fours += data.fours || 0;
            bat.sixes += data.sixes || 0;
            bat.innings += 1;
            if (data.notOut) bat.notOut += 1;
            if (data.runs > bat.highest) bat.highest = data.runs;
            bat.average = bat.innings > 0 ? bat.runs / bat.innings : 0;
            bat.strikeRate = bat.balls > 0 ? (bat.runs / bat.balls) * 100 : 0;
            const bowl = this.playerStats.bowlers[player];
            bowl.wickets += data.wickets || 0;
            bowl.balls += data.balls || 0;
            bowl.runsConceded += data.runsConceded || 0;
            bowl.matches += 1;
            bowl.economy = bowl.balls > 0 ? (bowl.runsConceded / bowl.balls) * 6 : 0;
            if (data.wickets > bowl.best) bowl.best = data.wickets;
        }
    }

    getTopBatsmen(limit = 10) {
        return Object.entries(this.playerStats.batsmen)
            .map(([name, stats]) => ({ name, ...stats }))
            .sort((a, b) => b.runs - a.runs)
            .slice(0, limit);
    }

    getTopBowlers(limit = 10) {
        return Object.entries(this.playerStats.bowlers)
            .map(([name, stats]) => ({ name, ...stats }))
            .sort((a, b) => b.wickets - a.wickets)
            .slice(0, limit);
    }

    getTopManOfMatch(limit = 5) {
        const countMap = {};
        this.playerStats.manOfMatch.forEach(m => {
            countMap[m.player] = (countMap[m.player] || 0) + 1;
        });
        return Object.entries(countMap)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, limit);
    }

    getPlayerStats(playerName) {
        return {
            batting: this.playerStats.batsmen[playerName] || null,
            bowling: this.playerStats.bowlers[playerName] || null,
            manOfMatch: this.playerStats.manOfMatch.filter(m => m.player === playerName).length
        };
    }

    // ============================================
// MATCH SETUP AND GAME LOGIC
// ============================================

resetMatch() {
    this.matchState = {
        isActive: false,
        currentOver: 0,
        currentBall: 0,
        totalOvers: 4,
        team1: {
            name: '',
            runs: 0,
            wickets: 0,
            balls: 0,
            extras: 0,
            currentBatsman: null,
            currentBowler: null,
            battingOrder: [],
            bowlingOrder: [],
            currentBattingIndex: 0,
            currentBowlingIndex: 0,
            partnership: 0,
            lastBalls: []
        },
        team2: {
            name: '',
            runs: 0,
            wickets: 0,
            balls: 0,
            extras: 0,
            currentBatsman: null,
            currentBowler: null,
            battingOrder: [],
            bowlingOrder: [],
            currentBattingIndex: 0,
            currentBowlingIndex: 0,
            partnership: 0,
            lastBalls: []
        },
        battingTeam: 1,
        bowlingTeam: 2,
        overType: 'normal', // Always normal
        // lbwCount: 0, // REMOVED
        isFreeHit: false,
        isWide: false,
        isNoBall: false,
        lastBallResult: null,
        secretScore: null,
        batsmanSet: false,
        bowlerGuessed: false,
        currentBatsmanName: '',
        currentBowlerName: '',
        matchId: null,
        inning: 1,
        target: null,
        winner: null,
        isComplete: false
    };
    this.currentMatchStats = { batsmen: {}, bowlers: {}, manOfMatchCandidates: [] };
    this.striker = null;
    this.nonStriker = null;
    this.strikeChanged = false;
}

setupMatch(team1Id, team2Id, team1BattingOrder, team2BattingOrder) {
    const team1 = this.getTeam(team1Id);
    const team2 = this.getTeam(team2Id);
    if (!team1 || !team2) throw new Error('Team not found');
    this.resetMatch();
    this.matchState.isActive = true;
    this.matchState.matchId = `MATCH-${Date.now()}`;
    this.matchState.team1.name = team1.name;
    this.matchState.team2.name = team2.name;
    this.matchState.team1.battingOrder = team1BattingOrder || team1.squad;
    this.matchState.team2.battingOrder = team2BattingOrder || team2.squad;
    this.matchState.team1.currentBatsman = this.matchState.team1.battingOrder[0];
    this.matchState.team2.currentBatsman = this.matchState.team2.battingOrder[0];
    this.matchState.battingTeam = 1;
    this.matchState.bowlingTeam = 2;
    this.matchState.currentOver = 1;
    this.matchState.currentBall = 0;
    this.matchState.overType = 'normal';
    this.matchState.currentBatsmanName = this.matchState.team1.currentBatsman;
    this.striker = this.matchState.team1.currentBatsman;
    this.nonStriker = this.matchState.team1.battingOrder[1] || 'Non-Striker';
    return this.matchState;
}

// OLD RULES - Commented
/*
getOverType(over) {
    if (over === 1) return 'lbw';
    if (over === 4) return 'powerplay';
    return 'normal';
}
*/

// NEW RULES - All overs normal
getOverType(over) {
    return 'normal';
}

batsmanSetScore(data) {
    const { name, score } = data;
    if (!this.matchState.isActive) return { error: 'Match not active' };
    if (this.matchState.batsmanSet) return { error: 'Batsman already set score for this ball' };
    
    // NEW RULES: Always 3,4,5,6
    const validScores = [3, 4, 5, 6];
    /*
    // OLD RULES - Commented
    const overType = this.getOverType(this.matchState.currentOver);
    let validScores = [];
    if (overType === 'lbw') validScores = [2, 3, 4, 5, 6];
    else if (overType === 'powerplay') validScores = [1, 2, 3, 4, 5, 6];
    else validScores = [3, 4, 5, 6];
    */
    
    if (!validScores.includes(parseInt(score))) {
        return { error: `Invalid score! Allowed numbers: ${validScores.join(', ')}` };
    }
    this.matchState.secretScore = parseInt(score);
    this.matchState.batsmanSet = true;
    this.matchState.bowlerGuessed = false;
    this.matchState.currentBatsmanName = name || 'Batsman';
    const battingTeam = this.matchState.battingTeam === 1 ? this.matchState.team1 : this.matchState.team2;
    battingTeam.currentBatsman = name || battingTeam.currentBatsman;
    if (!this.striker) {
        this.striker = name || battingTeam.currentBatsman;
        this.nonStriker = battingTeam.battingOrder[1] || 'Non-Striker';
    }
    return {
        success: true,
        message: `${name || 'Batsman'} set score ${score}`,
        batsman: name || 'Batsman',
        score: score
    };
}

bowlerGuess(data) {
    const { name, guess } = data;
    if (!this.matchState.isActive) return { error: 'Match not active' };
    if (!this.matchState.batsmanSet) return { error: 'Batsman has not set score yet!' };
    if (this.matchState.bowlerGuessed) return { error: 'Bowler already guessed for this ball' };
    const batsmanScore = this.matchState.secretScore;
    const bowlerGuess = parseInt(guess);
    
    // NEW RULES: Always 3,4,5,6
    const validGuesses = [3, 4, 5, 6];
    /*
    // OLD RULES - Commented
    const overType = this.getOverType(this.matchState.currentOver);
    let validGuesses = [];
    if (overType === 'lbw') validGuesses = [2, 3, 4, 5, 6];
    else if (overType === 'powerplay') validGuesses = [1, 2, 3, 4, 5, 6];
    else validGuesses = [3, 4, 5, 6];
    */
    
    if (!validGuesses.includes(bowlerGuess)) {
        return { error: `Invalid guess! Allowed numbers: ${validGuesses.join(', ')}` };
    }
    this.matchState.bowlerGuessed = true;
    this.matchState.currentBowlerName = name || 'Bowler';
    const battingTeam = this.matchState.battingTeam === 1 ? this.matchState.team1 : this.matchState.team2;
    let result = {
        batsmanScore: batsmanScore,
        bowlerGuess: bowlerGuess,
        isOut: false,
        runsScored: 0,
        isWide: false,
        isNoBall: false,
        isFreeHit: false,
        isLBW: false,
        isPowerplay: false,
        message: '',
        ballResult: '',
        batsmanName: this.matchState.currentBatsmanName,
        bowlerName: this.matchState.currentBowlerName
    };

    // OLD RULES - LBW OVER - Commented
    /*
    if (overType === 'lbw') {
        const diff = Math.abs(batsmanScore - bowlerGuess);
        if (batsmanScore === bowlerGuess) {
            result.isOut = true;
            result.message = `🎯 OUT! ${bowlerGuess} guessed correctly!`;
            result.ballResult = 'W';
        } else if (diff === 1) {
            this.matchState.lbwCount += 1;
            if (this.matchState.lbwCount >= 3) {
                result.isOut = true;
                result.isLBW = true;
                result.message = `🏏 LBW OUT! 3 consecutive diff of 1!`;
                result.ballResult = 'LBW';
                this.matchState.lbwCount = 0;
            } else {
                result.runsScored = batsmanScore;
                result.message = `✅ Safe! ${batsmanScore} runs (LBW count: ${this.matchState.lbwCount}/3)`;
                result.ballResult = batsmanScore.toString();
            }
        } else {
            result.runsScored = batsmanScore;
            result.message = `✅ Safe! ${batsmanScore} runs`;
            result.ballResult = batsmanScore.toString();
            this.matchState.lbwCount = 0;
        }
    }
    */

  // CURRENT RULES - Normal Over
// WIDE: 3 vs 6 OR 6 vs 3
if ((batsmanScore === 3 && bowlerGuess === 6) || (batsmanScore === 6 && bowlerGuess === 3)) {
    result.isWide = true;
    result.runsScored = batsmanScore;
    result.message = `📏 WIDE! ${batsmanScore} runs added. Ball repeated.`;
    result.ballResult = 'WD';
}
// NO-BALL: Batsman 5 with any guess other than 5
else if (batsmanScore === 5 && bowlerGuess !== 5) {
    result.isNoBall = true;
    result.runsScored = 5;
    result.message = `❌ NO-BALL! 5 runs added. Ball repeated.`;
    result.ballResult = 'NB';
}
// OUT: Exact match
else if (batsmanScore === bowlerGuess) {
    result.isOut = true;
    result.message = `🎯 OUT! ${bowlerGuess} guessed correctly!`;
    result.ballResult = 'W';
}
// SAFE: Runs added
else {
    result.runsScored = batsmanScore;
    result.message = `✅ Safe! ${batsmanScore} runs`;
    result.ballResult = batsmanScore.toString();
}

    // OLD RULES - POWERPLAY - Commented
    /*
    else if (overType === 'powerplay') {
        result.isPowerplay = true;
        if (batsmanScore === bowlerGuess) {
            result.isOut = true;
            result.runsScored = -batsmanScore;
            result.message = `💥 POWERPLAY! OUT! ${batsmanScore} runs DEDUCTED!`;
            result.ballResult = 'W*';
        } else {
            result.runsScored = batsmanScore * 2;
            result.message = `⚡ POWERPLAY! ${batsmanScore} × 2 = ${batsmanScore * 2} runs!`;
            result.ballResult = (batsmanScore * 2).toString();
        }
    }
    */

    battingTeam.runs += result.runsScored;
    if (!result.isWide && !result.isNoBall) {
        battingTeam.balls += 1;
        this.matchState.currentBall += 1;
    }
    if (result.isWide) battingTeam.extras += 1;
    if (result.isNoBall) battingTeam.extras += 1;
    if (result.isOut) {
        battingTeam.wickets += 1;
        battingTeam.currentBattingIndex += 1;
        if (battingTeam.currentBattingIndex < battingTeam.battingOrder.length) {
            battingTeam.currentBatsman = battingTeam.battingOrder[battingTeam.currentBattingIndex];
            this.matchState.currentBatsmanName = battingTeam.currentBatsman;
        } else {
            result.message += ' 🏏 All out!';
            this.endInnings();
        }
    } else {
        this.matchState.currentBatsmanName = battingTeam.currentBatsman;
        if (result.runsScored > 0) {
            this.updateStrike(this.matchState.currentBatsmanName, result.runsScored);
        }
    }
    this.matchState.lastBallResult = result;
    if (this.matchState.currentBall >= 6) {
        this.matchState.currentBall = 0;
        this.matchState.currentOver += 1;
        if (this.matchState.currentOver <= this.matchState.totalOvers) {
            this.matchState.overType = 'normal';
            // this.matchState.overType = this.getOverType(this.matchState.currentOver);
        } else {
            this.endInnings();
        }
    }
    this.matchState.batsmanSet = false;
    this.matchState.bowlerGuessed = false;
    this.matchState.secretScore = null;
    return {
        ...result,
        matchState: this.getMatchState()
    };
}

updateStrike(batsmanName, runsScored) {
    // Strike change on ODD runs (3,5)
    if (runsScored % 2 !== 0 && this.striker && this.nonStriker) {
        const temp = this.striker;
        this.striker = this.nonStriker;
        this.nonStriker = temp;
        this.strikeChanged = true;
    } else {
        this.strikeChanged = false;
    }
}

endInnings() {
    const battingTeam = this.matchState.battingTeam === 1 ? this.matchState.team1 : this.matchState.team2;
    if (this.matchState.inning === 1) {
        this.matchState.target = battingTeam.runs + 1;
        this.matchState.inning = 2;
        this.matchState.battingTeam = 2;
        this.matchState.bowlingTeam = 1;
        this.matchState.currentOver = 1;
        this.matchState.currentBall = 0;
        this.matchState.overType = 'normal';
        // this.matchState.lbwCount = 0; // REMOVED
        this.matchState.isFreeHit = false;
        const newBattingTeam = this.matchState.team2;
        newBattingTeam.currentBatsman = newBattingTeam.battingOrder[0] || newBattingTeam.squad[0];
        this.matchState.currentBatsmanName = newBattingTeam.currentBatsman;
        this.striker = newBattingTeam.currentBatsman;
        this.nonStriker = newBattingTeam.battingOrder[1] || 'Non-Striker';
        return {
            message: `🏏 Innings complete! Target: ${this.matchState.target}`,
            target: this.matchState.target
        };
    } else {
        this.matchState.isComplete = true;
        this.matchState.isActive = false;
        const team1Score = this.matchState.team1.runs;
        const team2Score = this.matchState.team2.runs;
        if (team2Score > team1Score) this.matchState.winner = this.matchState.team2.name;
        else if (team1Score > team2Score) this.matchState.winner = this.matchState.team1.name;
        else this.matchState.winner = 'TIE';
        this.tournamentStats.matches += 1;
        if (this.matchState.matchId && this.matchState.matchId.startsWith('FIX-')) {
            const fixture = this.fixtures.matches.find(m => m.id === this.matchState.matchId);
            if (fixture && fixture.status === 'ongoing') {
                this.completeFixture(fixture.id, this.matchState.winner, null, this.currentMatchStats.batsmen);
            }
        }
        this.saveAllData();
        this.striker = null;
        this.nonStriker = null;
        this.strikeChanged = false;
        return {
            message: `🏆 Match Complete! Winner: ${this.matchState.winner}`,
            winner: this.matchState.winner,
            team1Score: team1Score,
            team2Score: team2Score
        };
    }
}

getMatchState() {
    const battingTeam = this.matchState.battingTeam === 1 ? this.matchState.team1 : this.matchState.team2;
    const bowlingTeam = this.matchState.battingTeam === 1 ? this.matchState.team2 : this.matchState.team1;
    return {
        matchId: this.matchState.matchId,
        isActive: this.matchState.isActive,
        isComplete: this.matchState.isComplete,
        inning: this.matchState.inning,
        currentOver: this.matchState.currentOver,
        currentBall: this.matchState.currentBall,
        totalOvers: this.matchState.totalOvers,
        overType: this.matchState.overType,
        battingTeam: {
            name: battingTeam.name,
            runs: battingTeam.runs,
            wickets: battingTeam.wickets,
            balls: battingTeam.balls,
            extras: battingTeam.extras,
            currentBatsman: battingTeam.currentBatsman,
            battingOrder: battingTeam.battingOrder
        },
        bowlingTeam: {
            name: bowlingTeam.name,
            currentBowler: bowlingTeam.currentBowler
        },
        target: this.matchState.target,
        winner: this.matchState.winner,
        // lbwCount: this.matchState.lbwCount, // REMOVED
        isFreeHit: this.matchState.isFreeHit,
        lastBallResult: this.matchState.lastBallResult,
        batsmanSet: this.matchState.batsmanSet,
        bowlerGuessed: this.matchState.bowlerGuessed,
        currentBatsmanName: this.matchState.currentBatsmanName,
        currentBowlerName: this.matchState.currentBowlerName,
        striker: this.striker,
        nonStriker: this.nonStriker,
        strikeChanged: this.strikeChanged
    };
}

resetMatchAdmin() {
    this.resetMatch();
    this.striker = null;
    this.nonStriker = null;
    this.strikeChanged = false;
    return { message: 'Match reset successfully' };
}

    exportTournamentData(format = 'json') {
        const data = {
            tournament: {
                name: 'GEM-STAR Championship 2026',
                exportedAt: new Date().toISOString(),
                totalMatches: this.tournamentStats.matches || 0
            },
            teams: this.teams.map(t => ({
                name: t.name,
                captain: t.captain,
                viceCaptain: t.viceCaptain,
                squad: t.squad,
                matches: t.matchesPlayed || 0,
                wins: t.wins || 0,
                losses: t.losses || 0,
                points: t.points || 0,
                netRunRate: t.netRunRate || 0
            })),
            pointsTable: this.getPointsTable(),
            fixtures: this.fixtures.matches.map(f => ({
                team1: f.team1,
                team2: f.team2,
                date: f.date,
                venue: f.venue,
                host: f.host,
                status: f.status,
                result: f.result,
                manOfMatch: f.manOfMatch
            })),
            playerStats: {
                batsmen: this.playerStats.batsmen,
                bowlers: this.playerStats.bowlers,
                manOfMatch: this.playerStats.manOfMatch
            },
            topBatsmen: this.getTopBatsmen(10),
            topBowlers: this.getTopBowlers(10),
            topManOfMatch: this.getTopManOfMatch(5)
        };
        if (format === 'json') return data;
        if (format === 'csv') return this.convertToCSV(data);
        if (format === 'html') return this.convertToHTML(data);
        return data;
    }

    convertToCSV(data) {
        let csv = '';
        csv += '=== GCL POINTS TABLE ===\n';
        csv += 'Rank,Team,Matches,Wins,Losses,Points,NRR\n';
        data.pointsTable.forEach(t => {
            csv += `${t.rank},${t.name},${t.matches},${t.wins},${t.losses},${t.points},${t.netRunRate}\n`;
        });
        csv += '\n=== TOP BATSMEN ===\n';
        csv += 'Rank,Player,Runs,Balls,Fours,Sixes,Average,SR,Highest\n';
        data.topBatsmen.forEach((p, i) => {
            csv += `${i+1},${p.name},${p.runs||0},${p.balls||0},${p.fours||0},${p.sixes||0},${(p.average||0).toFixed(2)},${(p.strikeRate||0).toFixed(2)},${p.highest||0}\n`;
        });
        csv += '\n=== TOP BOWLERS ===\n';
        csv += 'Rank,Player,Wickets,Balls,Runs,Economy,Best,Matches\n';
        data.topBowlers.forEach((p, i) => {
            csv += `${i+1},${p.name},${p.wickets||0},${p.balls||0},${p.runsConceded||0},${(p.economy||0).toFixed(2)},${p.best||0},${p.matches||0}\n`;
        });
        csv += '\n=== MAN OF THE MATCH ===\n';
        csv += 'Rank,Player,Count\n';
        data.topManOfMatch.forEach((p, i) => {
            csv += `${i+1},${p.name},${p.count||0}\n`;
        });
        return csv;
    }

    convertToHTML(data) {
        let html = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>GCL Tournament Report</title>
                <style>
                    body { font-family: Arial, sans-serif; margin: 40px; background: #f5f5f5; }
                    .container { max-width: 1200px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                    h1 { color: #1a1a2e; border-bottom: 3px solid #ffd700; padding-bottom: 10px; }
                    h2 { color: #1a1a2e; margin-top: 30px; }
                    table { width: 100%; border-collapse: collapse; margin: 15px 0; }
                    th { background: #1a1a2e; color: white; padding: 10px; text-align: left; }
                    td { padding: 8px 10px; border-bottom: 1px solid #eee; }
                    tr:hover td { background: #f9f9f9; }
                    .gold { color: #ffd700; font-weight: bold; }
                    .silver { color: #c0c0c0; font-weight: bold; }
                    .bronze { color: #cd7f32; font-weight: bold; }
                    .header { background: linear-gradient(135deg, #1a1a2e, #16213e); color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
                    .header h1 { color: #ffd700; border: none; }
                    .meta { color: #aaa; font-size: 0.9rem; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>🏏 GEM-STAR Championship 2026</h1>
                        <p>Tournament Report</p>
                        <p class="meta">Exported: ${new Date(data.tournament.exportedAt).toLocaleString()}</p>
                    </div>
        `;

        html += `<h2>🏆 Points Table</h2><table><thead><tr><th>Rank</th><th>Team</th><th>Matches</th><th>Wins</th><th>Losses</th><th>Points</th><th>NRR</th></tr></thead><tbody>`;
        data.pointsTable.forEach(t => {
            const rankClass = t.rank === 1 ? 'gold' : t.rank === 2 ? 'silver' : t.rank === 3 ? 'bronze' : '';
            html += `<tr><td class="${rankClass}">#${t.rank}</td><td><strong>${t.name}</strong></td><td>${t.matches}</td><td>${t.wins}</td><td>${t.losses}</td><td><strong>${t.points}</strong></td><td>${t.netRunRate}</td></tr>`;
        });
        html += `</tbody></table>`;

        html += `<h2>🏏 Top Batsmen</h2><table><thead><tr><th>Rank</th><th>Player</th><th>Runs</th><th>Balls</th><th>Fours</th><th>Sixes</th><th>Avg</th><th>SR</th><th>Highest</th></tr></thead><tbody>`;
        data.topBatsmen.forEach((p, i) => {
            const rankClass = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
            html += `<tr><td class="${rankClass}">#${i+1}</td><td><strong>${p.name}</strong></td><td>${p.runs||0}</td><td>${p.balls||0}</td><td>${p.fours||0}</td><td>${p.sixes||0}</td><td>${(p.average||0).toFixed(2)}</td><td>${(p.strikeRate||0).toFixed(2)}</td><td>${p.highest||0}</td></tr>`;
        });
        html += `</tbody></table>`;

        html += `<h2>⚾ Top Bowlers</h2><table><thead><tr><th>Rank</th><th>Player</th><th>Wickets</th><th>Balls</th><th>Runs</th><th>Economy</th><th>Best</th><th>Matches</th></tr></thead><tbody>`;
        data.topBowlers.forEach((p, i) => {
            const rankClass = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
            html += `<tr><td class="${rankClass}">#${i+1}</td><td><strong>${p.name}</strong></td><td>${p.wickets||0}</td><td>${p.balls||0}</td><td>${p.runsConceded||0}</td><td>${(p.economy||0).toFixed(2)}</td><td>${p.best||0}</td><td>${p.matches||0}</td></tr>`;
        });
        html += `</tbody></table>`;

        html += `<h2>⭐ Man of the Match</h2><table><thead><tr><th>Rank</th><th>Player</th><th>Times Won</th></tr></thead><tbody>`;
        data.topManOfMatch.forEach((p, i) => {
            const rankClass = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
            html += `<tr><td class="${rankClass}">#${i+1}</td><td><strong>${p.name}</strong></td><td>${p.count||0}</td></tr>`;
        });
        html += `</tbody></table>`;

        html += `
                    <div style="margin-top: 20px; border-top: 1px solid #eee; padding-top: 20px; text-align: center; color: #666; font-size: 0.85rem;">
                        Generated by GCL Tournament System • ${new Date().toLocaleString()}
                    </div>
                </div>
            </body>
            </html>
        `;
        return html;
    }
}

const gameEngine = new GCLEngine();

// ============================================
// SOCKET.IO EVENTS
// ============================================

io.on('connection', (socket) => {
    console.log('🟢 Client connected:', socket.id);

    socket.emit('stateUpdate', gameEngine.getMatchState());
    socket.emit('fixturesUpdate', gameEngine.getFixtures());
    socket.emit('pointsTable', gameEngine.getPointsTable());
    socket.emit('topStats', {
        batsmen: gameEngine.getTopBatsmen(),
        bowlers: gameEngine.getTopBowlers(),
        manOfMatch: gameEngine.getTopManOfMatch()
    });

    socket.on('batsmanSetScore', (data) => {
        const result = gameEngine.batsmanSetScore(data);
        io.emit('scoreUpdate', {
            type: 'batsmanSet',
            result: result,
            state: gameEngine.getMatchState()
        });
    });

    socket.on('bowlerGuess', (data) => {
        const result = gameEngine.bowlerGuess(data);
        io.emit('scoreUpdate', {
            type: 'bowlResult',
            result: result,
            state: gameEngine.getMatchState()
        });
    });

    socket.on('getState', () => {
        socket.emit('stateUpdate', gameEngine.getMatchState());
    });

    socket.on('getPointsTable', () => {
        socket.emit('pointsTable', gameEngine.getPointsTable());
    });

    socket.on('getTopStats', () => {
        socket.emit('topStats', {
            batsmen: gameEngine.getTopBatsmen(),
            bowlers: gameEngine.getTopBowlers(),
            manOfMatch: gameEngine.getTopManOfMatch()
        });
    });

    socket.on('resetMatch', () => {
        gameEngine.resetMatchAdmin();
        io.emit('stateUpdate', gameEngine.getMatchState());
        io.emit('notification', '🔄 Match has been reset');
    });

    socket.on('setupMatch', (data) => {
        try {
            const state = gameEngine.setupMatch(
                data.team1Id,
                data.team2Id,
                data.team1Order,
                data.team2Order
            );
            io.emit('stateUpdate', state);
            io.emit('notification', `🏏 Match setup: ${gameEngine.matchState.team1.name} vs ${gameEngine.matchState.team2.name}`);
        } catch (error) {
            socket.emit('error', { message: error.message });
        }
    });

    socket.on('createTeam', (data) => {
        try {
            gameEngine.createTeam(data).then(team => {
                io.emit('teamCreated', team);
                io.emit('notification', `✅ Team "${team.name}" created successfully!`);
                io.emit('teamsList', gameEngine.getAllTeams());
            });
        } catch (error) {
            socket.emit('error', { message: error.message });
        }
    });

    socket.on('getTeams', () => {
        socket.emit('teamsList', gameEngine.getAllTeams());
    });

    socket.on('createFixture', (data) => {
        try {
            gameEngine.createFixture(data).then(fixture => {
                io.emit('fixturesUpdate', gameEngine.getFixtures());
                io.emit('notification', `📅 Fixture created: ${fixture.team1} vs ${fixture.team2}`);
            });
        } catch (error) {
            socket.emit('error', { message: error.message });
        }
    });

    socket.on('startFixture', (fixtureId) => {
        try {
            gameEngine.startFixture(fixtureId).then(fixture => {
                io.emit('fixturesUpdate', gameEngine.getFixtures());
                io.emit('notification', `⚔️ Match started: ${fixture.team1} vs ${fixture.team2}`);
            });
        } catch (error) {
            socket.emit('error', { message: error.message });
        }
    });

    socket.on('completeFixture', (data) => {
        try {
            gameEngine.completeFixture(
                data.fixtureId,
                data.winner,
                data.manOfMatch,
                data.playerStats
            ).then(fixture => {
                io.emit('fixturesUpdate', gameEngine.getFixtures());
                io.emit('pointsTable', gameEngine.getPointsTable());
                io.emit('topStats', {
                    batsmen: gameEngine.getTopBatsmen(),
                    bowlers: gameEngine.getTopBowlers(),
                    manOfMatch: gameEngine.getTopManOfMatch()
                });
                io.emit('notification', `🏆 Match completed! Winner: ${data.winner}`);
            });
        } catch (error) {
            socket.emit('error', { message: error.message });
        }
    });

    socket.on('getFixtures', () => {
        socket.emit('fixturesUpdate', gameEngine.getFixtures());
    });

    socket.on('disconnect', () => {
        console.log('🔴 Client disconnected:', socket.id);
    });
});

// ============================================
// REST API ENDPOINTS
// ============================================

app.use(express.json());

app.get('/api/teams', (req, res) => {
    res.json(gameEngine.getAllTeams());
});

app.post('/api/teams', (req, res) => {
    try {
        gameEngine.createTeam(req.body).then(team => {
            res.json(team);
        });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.get('/api/match/state', (req, res) => {
    res.json(gameEngine.getMatchState());
});

app.post('/api/match/setup', (req, res) => {
    try {
        const state = gameEngine.setupMatch(
            req.body.team1Id,
            req.body.team2Id,
            req.body.team1Order,
            req.body.team2Order
        );
        res.json(state);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.post('/api/match/reset', (req, res) => {
    const result = gameEngine.resetMatchAdmin();
    res.json(result);
});

app.post('/api/match/bat', (req, res) => {
    const result = gameEngine.batsmanSetScore(req.body);
    if (result.error) {
        res.status(400).json(result);
    } else {
        io.emit('scoreUpdate', {
            type: 'batsmanSet',
            result: result,
            state: gameEngine.getMatchState()
        });
        res.json(result);
    }
});

app.post('/api/match/bowl', (req, res) => {
    const result = gameEngine.bowlerGuess(req.body);
    if (result.error) {
        res.status(400).json(result);
    } else {
        io.emit('scoreUpdate', {
            type: 'bowlResult',
            result: result,
            state: gameEngine.getMatchState()
        });
        res.json(result);
    }
});

app.get('/api/fixtures', (req, res) => {
    res.json(gameEngine.getFixtures());
});

app.post('/api/fixtures', (req, res) => {
    try {
        gameEngine.createFixture(req.body).then(fixture => {
            res.json(fixture);
        });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.post('/api/fixtures/start/:id', (req, res) => {
    try {
        gameEngine.startFixture(req.params.id).then(fixture => {
            res.json(fixture);
        });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.post('/api/fixtures/complete', (req, res) => {
    try {
        gameEngine.completeFixture(
            req.body.fixtureId,
            req.body.winner,
            req.body.manOfMatch,
            req.body.playerStats
        ).then(fixture => {
            res.json(fixture);
        });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.get('/api/points-table', (req, res) => {
    try {
        const table = gameEngine.getPointsTable();
        res.json(table);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.get('/api/stats/batsmen', (req, res) => {
    res.json(gameEngine.getTopBatsmen());
});

app.get('/api/stats/bowlers', (req, res) => {
    res.json(gameEngine.getTopBowlers());
});

app.get('/api/stats/manofmatch', (req, res) => {
    res.json(gameEngine.getTopManOfMatch());
});

app.get('/api/stats/player/:name', (req, res) => {
    res.json(gameEngine.getPlayerStats(req.params.name));
});

app.get('/api/export', (req, res) => {
    const format = req.query.format || 'json';
    try {
        const data = gameEngine.exportTournamentData(format);
        if (format === 'json') {
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Content-Disposition', 'attachment; filename=gcl-tournament-data.json');
            res.json(data);
        } else if (format === 'csv') {
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', 'attachment; filename=gcl-tournament-data.csv');
            res.send(data);
        } else if (format === 'html') {
            res.setHeader('Content-Type', 'text/html');
            res.setHeader('Content-Disposition', 'attachment; filename=gcl-tournament-report.html');
            res.send(data);
        } else {
            res.status(400).json({ error: 'Invalid format. Use json, csv, or html' });
        }
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.get('/api/export/points-table', (req, res) => {
    const format = req.query.format || 'json';
    try {
        const data = gameEngine.getPointsTable();
        if (format === 'json') {
            res.json(data);
        } else if (format === 'csv') {
            let csv = 'Rank,Team,Matches,Wins,Losses,Points,NRR\n';
            data.forEach(t => {
                csv += `${t.rank},${t.name},${t.matches},${t.wins},${t.losses},${t.points},${t.netRunRate}\n`;
            });
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', 'attachment; filename=gcl-points-table.csv');
            res.send(csv);
        } else {
            res.status(400).json({ error: 'Invalid format' });
        }
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.get('/api/export/player-stats', (req, res) => {
    const format = req.query.format || 'json';
    try {
        const data = {
            batsmen: gameEngine.getTopBatsmen(50),
            bowlers: gameEngine.getTopBowlers(50),
            manOfMatch: gameEngine.getTopManOfMatch(20)
        };
        if (format === 'json') {
            res.json(data);
        } else if (format === 'csv') {
            let csv = '=== BATSMEN ===\n';
            csv += 'Player,Runs,Balls,Fours,Sixes,Average,SR,Highest\n';
            data.batsmen.forEach(p => {
                csv += `${p.name},${p.runs||0},${p.balls||0},${p.fours||0},${p.sixes||0},${(p.average||0).toFixed(2)},${(p.strikeRate||0).toFixed(2)},${p.highest||0}\n`;
            });
            csv += '\n=== BOWLERS ===\n';
            csv += 'Player,Wickets,Balls,Runs,Economy,Best,Matches\n';
            data.bowlers.forEach(p => {
                csv += `${p.name},${p.wickets||0},${p.balls||0},${p.runsConceded||0},${(p.economy||0).toFixed(2)},${p.best||0},${p.matches||0}\n`;
            });
            csv += '\n=== MAN OF THE MATCH ===\n';
            csv += 'Player,Count\n';
            data.manOfMatch.forEach(p => {
                csv += `${p.name},${p.count||0}\n`;
            });
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', 'attachment; filename=gcl-player-stats.csv');
            res.send(csv);
        } else {
            res.status(400).json({ error: 'Invalid format' });
        }
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.get('/api/tournament/stats', (req, res) => {
    res.json(gameEngine.tournamentStats);
});
// ============================================
// FIXTURE UPDATE/DELETE API
// ============================================

// Update fixture
app.post('/api/fixtures/update', (req, res) => {
    try {
        const updatedFixture = req.body;
        const index = gameEngine.fixtures.matches.findIndex(f => f.id === updatedFixture.id);
        if (index === -1) {
            return res.status(404).json({ success: false, error: 'Fixture not found' });
        }
        gameEngine.fixtures.matches[index] = updatedFixture;
        gameEngine.saveAllData();
        res.json({ success: true });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

// Delete fixture
app.post('/api/fixtures/delete', (req, res) => {
    try {
        const { id } = req.body;
        const index = gameEngine.fixtures.matches.findIndex(f => f.id === id);
        if (index === -1) {
            return res.status(404).json({ success: false, error: 'Fixture not found' });
        }
        gameEngine.fixtures.matches.splice(index, 1);
        gameEngine.saveAllData();
        res.json({ success: true });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});
app.post('/api/teams/update', (req, res) => {
    try {
        const updatedTeam = req.body;
        const index = gameEngine.teams.findIndex(t => t.id === updatedTeam.id);
        if (index === -1) {
            return res.status(404).json({ success: false, error: 'Team not found' });
        }
        gameEngine.teams[index] = updatedTeam;
        gameEngine.saveAllData();
        res.json({ success: true });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

app.post('/api/teams/delete', (req, res) => {
    try {
        const { id } = req.body;
        const index = gameEngine.teams.findIndex(t => t.id === id);
        if (index === -1) {
            return res.status(404).json({ success: false, error: 'Team not found' });
        }
        gameEngine.teams.splice(index, 1);
        gameEngine.saveAllData();
        res.json({ success: true });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================
// START SERVER
// ============================================

async function startServer() {
    await connectMongoDB();
    await gameEngine.loadAllData();
    
    server.listen(PORT, () => {
        console.log(`🏏 GCL Tournament Server running on port ${PORT}`);
        console.log(`📡 Socket.IO ready for real-time updates`);
        console.log(`📋 http://localhost:${PORT} for the interface`);
    });
}

startServer();
