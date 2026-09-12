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
// GAME ENGINE
// ============================================

class GCLEngine {
    constructor() {
        this.resetMatch();
        this.teams = [];
        this.tournamentStats = { matches: 0, teams: {} };
        this.fixtures = { matches: [], upcoming: [], completed: [] };
        this.playerStats = { batsmen: {}, bowlers: {}, manOfMatch: [] };
        this.currentMatchStats = {
    innings: {
        1: { batsmen: {}, bowlers: {} },
        2: { batsmen: {}, bowlers: {} }
    },
    manOfMatchCandidates: []
};
        this.penaltyTracker = {};
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
    // HELPERS
    // ============================================

   _ensureBatsmanExists(name, inningNum) {
    if (!name || name === '' || name === 'Non-Striker') return;
    const inn = inningNum || this.matchState.inning || 1;
    const stats = this._getInningStats(inn);
    if (!stats.batsmen[name]) {
        stats.batsmen[name] = {
            name: name,
            runs: 0,
            balls: 0,
            fours: 0,
            sixes: 0
        };
    }
}

_ensureBowlerExists(name, inningNum) {
    if (!name || name === '') return;
    const inn = inningNum || this.matchState.inning || 1;
    const stats = this._getInningStats(inn);
    if (!stats.bowlers[name]) {
        stats.bowlers[name] = {
            name: name,
            wickets: 0,
            balls: 0,
            runsConceded: 0,
            overs: 0
        };
    }
}
    _syncStrikerFields() {
        const battingTeam = this.matchState.battingTeam === 1
            ? this.matchState.team1
            : this.matchState.team2;

        this.matchState.currentBatsmanName = this.matchState.striker || '';
        battingTeam.currentBatsman = this.matchState.striker || '';

        this._ensureBatsmanExists(this.matchState.striker);
        this._ensureBatsmanExists(this.matchState.nonStriker);
    }
    _getCurrentInningStats() {
    const inn = this.matchState.inning || 1;
    if (!this.currentMatchStats.innings[inn]) {
        this.currentMatchStats.innings[inn] = { batsmen: {}, bowlers: {} };
    }
    return this.currentMatchStats.innings[inn];
}

_getInningStats(inningNum) {
    if (!this.currentMatchStats.innings[inningNum]) {
        this.currentMatchStats.innings[inningNum] = { batsmen: {}, bowlers: {} };
    }
    return this.currentMatchStats.innings[inningNum];
}

    _computeBallResult(batsmanScore, bowlerGuess, noBallUsed) {
        // Rule 1: OUT is unconditional and highest priority
        if (batsmanScore === bowlerGuess) {
            return {
                ballType: 'out',
                runsScored: 0,
                isOut: true,
                isWide: false,
                isNoBall: false,
                countsAsBall: true,
                consumesNoBall: batsmanScore === 5,
                message: `🎯 OUT! ${bowlerGuess} guessed correctly!` +
                         (batsmanScore === 5 ? ' (No-ball slot used)' : ''),
                resultClass: 'wicket'
            };
        }

        // Rule 2: Wide (3,6) or (6,3)
        if ((batsmanScore === 3 && bowlerGuess === 6) ||
            (batsmanScore === 6 && bowlerGuess === 3)) {
            return {
                ballType: 'wide',
                runsScored: batsmanScore,
                isOut: false,
                isWide: true,
                isNoBall: false,
                countsAsBall: false,
                consumesNoBall: false,
                message: `📏 WIDE! (${batsmanScore}-${bowlerGuess})`,
                resultClass: 'wide'
            };
        }

        // Rule 3: No-ball (first 5 this over)
        if (batsmanScore === 5 && bowlerGuess !== 5 && !noBallUsed) {
            return {
                ballType: 'noball',
                runsScored: 5,
                isOut: false,
                isWide: false,
                isNoBall: true,
                countsAsBall: false,
                consumesNoBall: true,
                message: `❌ NO-BALL! (5-${bowlerGuess})`,
                resultClass: 'noball'
            };
        }

        // Rule 4: 2nd 5 after no-ball used (normal ball)
        if (batsmanScore === 5 && bowlerGuess !== 5 && noBallUsed) {
            return {
                ballType: 'normal5',
                runsScored: 5,
                isOut: false,
                isWide: false,
                isNoBall: false,
                countsAsBall: true,
                consumesNoBall: false,
                message: `✅ Safe! 5 runs`,
                resultClass: 'runs'
            };
        }

        // Rule 5: Normal safe
        return {
            ballType: 'safe',
            runsScored: batsmanScore,
            isOut: false,
            isWide: false,
            isNoBall: false,
            countsAsBall: true,
            consumesNoBall: false,
            message: `✅ Safe! ${batsmanScore} runs`,
            resultClass: 'runs'
        };
    }

    _handleOut(dismissedName, isLastBall, isPenalty) {
        if (!this.matchState.dismissedBatsmen) {
            this.matchState.dismissedBatsmen = [];
        }
        this.matchState.dismissedBatsmen.push(dismissedName);

        if (isPenalty) {
            if (isLastBall) {
                // Penalty OUT on last ball: clear both
                this.matchState.striker = '';
                this.matchState.nonStriker = '';
            } else {
                // Penalty OUT mid-over: only striker cleared
                this.matchState.striker = '';
                // nonStriker unchanged
            }
        } else {
            if (isLastBall) {
                // Normal OUT on last ball: promote non-striker
                this.matchState.striker = this.matchState.nonStriker;
                this.matchState.nonStriker = '';
            } else {
                // Normal OUT mid-over: only striker cleared
                this.matchState.striker = '';
                // nonStriker unchanged
            }
        }

        this._syncStrikerFields();
    }

    // ============================================
    // MATCH RESET & SETUP
    // ============================================

    resetMatch() {
        this.matchState = {
            isActive: false,
            currentOver: 0,
            currentBall: 0,
            totalOvers: 4,
            team1: {
                name: '', runs: 0, wickets: 0, balls: 0, extras: 0,
                currentBatsman: null, currentBowler: null,
                battingOrder: [], bowlingOrder: [],
                currentBattingIndex: 0, currentBowlingIndex: 0,
                partnership: 0, lastBalls: []
            },
            team2: {
                name: '', runs: 0, wickets: 0, balls: 0, extras: 0,
                currentBatsman: null, currentBowler: null,
                battingOrder: [], bowlingOrder: [],
                currentBattingIndex: 0, currentBowlingIndex: 0,
                partnership: 0, lastBalls: []
            },
            battingTeam: 1,
            bowlingTeam: 2,
            overType: 'normal',
            isFreeHit: false,
            isWide: false,
            isNoBall: false,
            noBallUsed: false,
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
            isComplete: false,
            ballLog: [],
            striker: '',
            nonStriker: '',
            dismissedBatsmen: [],
            removedBowlers: []
        };

        this.currentMatchStats = {
    innings: {
        1: { batsmen: {}, bowlers: {} },
        2: { batsmen: {}, bowlers: {} }
    },
    manOfMatchCandidates: []
};
        this.penaltyTracker = {};
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
        this.matchState.team1.battingOrder = team1BattingOrder || team1.squad || [];
        this.matchState.team2.battingOrder = team2BattingOrder || team2.squad || [];
        this.matchState.battingTeam = 1;
        this.matchState.bowlingTeam = 2;
        this.matchState.currentOver = 0;
        this.matchState.currentBall = 0;
        this.matchState.striker = '';
        this.matchState.nonStriker = '';

        return this.matchState;
    }

    // ============================================
    // BATTING
    // ============================================

    batsmanSetScore(data) {
        const { name, score } = data;
        if (!this.matchState.isActive) return { error: 'Match not active' };
        if (this.matchState.batsmanSet) return { error: 'Batsman already set score for this ball' };

        const validScores = [3, 4, 5, 6];
        if (!validScores.includes(parseInt(score))) {
            return { error: `Invalid score! Allowed: ${validScores.join(', ')}` };
        }

        this.matchState.secretScore = parseInt(score);
        this.matchState.batsmanSet = true;
        this.matchState.bowlerGuessed = false;

        const chosenName = name || this.matchState.striker;
        if (chosenName) {
            this.matchState.striker = chosenName;
        }

        if (!this.matchState.nonStriker || this.matchState.nonStriker === 'undefined') {
            const battingTeam = this.matchState.battingTeam === 1
                ? this.matchState.team1 : this.matchState.team2;
            const order = battingTeam.battingOrder || [];
            const strikerIndex = order.indexOf(this.matchState.striker);
            if (strikerIndex !== -1 && strikerIndex + 1 < order.length) {
                this.matchState.nonStriker = order[strikerIndex + 1];
            } else {
                this.matchState.nonStriker = order.find(p => p !== this.matchState.striker) || '';
            }
        }

        this._syncStrikerFields();

        return {
            success: true,
            message: `${chosenName || 'Batsman'} set score ${score}`,
            batsman: chosenName || 'Batsman',
            score: score
        };
    }

    // ============================================
    // BOWLER GUESS — CORE LOGIC
    // ============================================

    bowlerGuess(data) {
        console.log('🔍 bowlerGuess called with:', data);
        const { name, guess } = data;

        if (!this.matchState.isActive) return { error: 'Match not active' };
        if (!this.matchState.batsmanSet) return { error: 'Batsman has not set score yet!' };
        if (this.matchState.bowlerGuessed) return { error: 'Bowler already guessed for this ball' };

        const batsmanScore = this.matchState.secretScore;
        const bowlerGuess = parseInt(guess);
        const validGuesses = [3, 4, 5, 6];
        if (!validGuesses.includes(bowlerGuess)) {
            return { error: `Invalid guess! Allowed: ${validGuesses.join(', ')}` };
        }

        // Snapshot
        const snapshot = {
            strikerAtBallStart: this.matchState.striker,
            nonStrikerAtBallStart: this.matchState.nonStriker,
            batsmanName: this.matchState.striker,
            bowlerName: name || this.matchState.currentBowlerName || 'Bowler',
            overAtStart: this.matchState.currentOver,
            ballAtStart: this.matchState.currentBall
        };

        this.matchState.currentBowlerName = snapshot.bowlerName;
        this.matchState.bowlerGuessed = true;
        this._ensureBowlerExists(snapshot.bowlerName);

        const result = this._computeBallResult(
            batsmanScore,
            bowlerGuess,
            this.matchState.noBallUsed
        );

        if (result.consumesNoBall) {
            this.matchState.noBallUsed = true;
        }

        const battingTeam = this.matchState.battingTeam === 1
            ? this.matchState.team1 : this.matchState.team2;

        if (result.countsAsBall) {
            this.matchState.currentBall += 1;
            battingTeam.balls += 1;
        }

        this.applyBallEffect({
    runsScored: result.runsScored,
    isOut: result.isOut,
    isWide: result.isWide,
    isNoBall: result.isNoBall,
    countsAsBall: result.countsAsBall,
    batsmanName: snapshot.batsmanName,
    bowlerName: snapshot.bowlerName,
    inning: this.matchState.inning || 1,
    battingTeamId: this.matchState.battingTeam
});

        // Strike handling
        if (result.isOut) {
            const isLastBall = (this.matchState.currentBall >= 6);
            this._handleOut(snapshot.strikerAtBallStart, isLastBall, false);
        } else {
            let shouldChange = false;
            if (result.isWide) {
                shouldChange = (result.runsScored === 3);
            } else if (result.isNoBall) {
                shouldChange = true;
            } else if (result.ballType === 'normal5') {
                shouldChange = true;
            } else if (result.ballType === 'safe') {
                shouldChange = (result.runsScored % 2 !== 0);
            }

            if (shouldChange) {
                const temp = this.matchState.striker;
                this.matchState.striker = this.matchState.nonStriker;
                this.matchState.nonStriker = temp;
            }
            this._syncStrikerFields();
        }

        // BallLog
 if (!this.matchState.ballLog) this.matchState.ballLog = [];
    this.matchState.ballLog.push({
    index: this.matchState.ballLog.length,
    inning: this.matchState.inning || 1,
    battingTeamId: this.matchState.battingTeam,
    over: `${snapshot.overAtStart}.${snapshot.ballAtStart}`,
    batsman: snapshot.batsmanName,
    batsmanScore: batsmanScore,
    bowler: snapshot.bowlerName,
    bowlerGuess: bowlerGuess,
    ballType: result.ballType,
    result: result.message,
    resultClass: result.resultClass,
    runs: result.runsScored,
    isOut: result.isOut,
    isWide: result.isWide,
    isNoBall: result.isNoBall,
    countsAsBall: result.countsAsBall,
    batsmanRuns: result.runsScored,
    batsmanBalls: result.countsAsBall ? 1 : 0,
    bowlerRuns: result.runsScored,
    bowlerBalls: result.countsAsBall ? 1 : 0,
    bowlerWickets: result.isOut ? 1 : 0,
    corrected: false
});

        // Over complete
        if (this.matchState.currentBall >= 6) {
            if (!result.isOut) {
                const shouldChange = (result.runsScored % 2 === 0);
                if (shouldChange) {
                    const temp = this.matchState.striker;
                    this.matchState.striker = this.matchState.nonStriker;
                    this.matchState.nonStriker = temp;
                    this._syncStrikerFields();
                }
            }
            this.matchState.currentBall = 0;
            this.matchState.currentOver += 1;
            this.matchState.noBallUsed = false;
            this.matchState.currentBowlerName = '';
            this.matchState.bowlerGuessed = false;
        }

        this.matchState.batsmanSet = false;
        this.matchState.bowlerGuessed = false;
        this.matchState.secretScore = null;
        this.matchState.lastBallResult = result;

        io.emit('stateUpdate', this.getMatchState());

        return { ...result, matchState: this.getMatchState() };
    }

   applyBallEffect(result) {
    const inningNum = result.inning || this.matchState.inning || 1;
    const battingTeamId = result.battingTeamId || this.matchState.battingTeam;
    const stats = this._getInningStats(inningNum);

    const battingTeam = battingTeamId === 1
        ? this.matchState.team1 : this.matchState.team2;

    battingTeam.runs += result.runsScored || 0;
    if (result.isOut) battingTeam.wickets += 1;

    if (result.batsmanName) {
        this._ensureBatsmanExists(result.batsmanName, inningNum);
        const batsman = stats.batsmen[result.batsmanName];
        batsman.runs = (batsman.runs || 0) + (result.runsScored || 0);
        if (result.countsAsBall) {
            batsman.balls = (batsman.balls || 0) + 1;
        }
        if (result.runsScored === 4) batsman.fours = (batsman.fours || 0) + 1;
        if (result.runsScored === 6) batsman.sixes = (batsman.sixes || 0) + 1;
    }

    if (result.bowlerName) {
        this._ensureBowlerExists(result.bowlerName, inningNum);
        const bowler = stats.bowlers[result.bowlerName];
        if (result.isOut) bowler.wickets = (bowler.wickets || 0) + 1;
        if (result.countsAsBall) {
            bowler.balls = (bowler.balls || 0) + 1;
        }
        bowler.runsConceded = (bowler.runsConceded || 0) + (result.runsScored || 0);
        const overs = Math.floor(bowler.balls / 6);
        const balls = bowler.balls % 6;
        bowler.overs = parseFloat(`${overs}.${balls}`);
    }
}
   reverseBallEffect(ballData) {
    const ballInning = ballData.inning || this.matchState.inning || 1;
    const ballBattingTeamId = ballData.battingTeamId || this.matchState.battingTeam;

    const battingTeam = ballBattingTeamId === 1
        ? this.matchState.team1 : this.matchState.team2;

    const stats = this.currentMatchStats.innings[ballInning];
    if (!stats) return;

    battingTeam.runs -= ballData.runs || 0;
    if (ballData.isOut) battingTeam.wickets = Math.max(0, battingTeam.wickets - 1);
    if (ballData.countsAsBall) {
        battingTeam.balls = Math.max(0, battingTeam.balls - 1);
    }

    if (ballData.batsman && stats.batsmen[ballData.batsman]) {
        const batsman = stats.batsmen[ballData.batsman];
        batsman.runs = Math.max(0, (batsman.runs || 0) - (ballData.batsmanRuns || 0));
        if (ballData.countsAsBall) {
            batsman.balls = Math.max(0, (batsman.balls || 0) - 1);
        }
        if (ballData.batsmanRuns === 4) batsman.fours = Math.max(0, (batsman.fours || 0) - 1);
        if (ballData.batsmanRuns === 6) batsman.sixes = Math.max(0, (batsman.sixes || 0) - 1);
    }

    if (ballData.bowler && stats.bowlers[ballData.bowler]) {
        const bowler = stats.bowlers[ballData.bowler];
        bowler.wickets = Math.max(0, (bowler.wickets || 0) - (ballData.bowlerWickets || 0));
        bowler.runsConceded = Math.max(0, (bowler.runsConceded || 0) - (ballData.bowlerRuns || 0));
        if (ballData.countsAsBall) {
            bowler.balls = Math.max(0, (bowler.balls || 0) - 1);
        }
        const overs = Math.floor(bowler.balls / 6);
        const balls = bowler.balls % 6;
        bowler.overs = parseFloat(`${overs}.${balls}`);
    }
}
    // ============================================
    // STRIKER / NON-STRIKER SET
    // ============================================

    setStriker(name) {
        if (!name || name === '') {
            return { error: 'Striker name required' };
        }
        if (name === this.matchState.nonStriker) {
            return { error: 'Striker cannot be the current non-striker' };
        }
        if ((this.matchState.dismissedBatsmen || []).includes(name)) {
            return { error: 'Cannot set a dismissed batsman as striker' };
        }
        this.matchState.striker = name;
        this._syncStrikerFields();
        return { message: `Striker set: ${name}` };
    }

    setNonStriker(name) {
        if (!name || name === '') {
            return { error: 'Non-striker name required' };
        }
        if (name === this.matchState.striker) {
            return { error: 'Non-striker cannot be the current striker' };
        }
        if ((this.matchState.dismissedBatsmen || []).includes(name)) {
            return { error: 'Cannot set a dismissed batsman as non-striker' };
        }
        this.matchState.nonStriker = name;
        this._syncStrikerFields();
        return { message: `Non-Striker set: ${name}` };
    }

    // ============================================
    // EDIT / DELETE BALL
    // ============================================

   editBall(data) {
    const { index, batsman, score, bowler, guess } = data;

    if (!this.matchState.isActive && !this.matchState.isComplete) {
        return { error: 'Match not active' };
    }
    if (!this.matchState.ballLog || !this.matchState.ballLog[index]) {
        return { error: 'Ball not found' };
    }

    const oldBall = this.matchState.ballLog[index];
    const ballInning = oldBall.inning || this.matchState.inning || 1;
    const ballBattingTeamId = oldBall.battingTeamId || this.matchState.battingTeam;

    this.reverseBallEffect(oldBall);

    const newResult = this._computeBallResult(
        parseInt(score),
        parseInt(guess),
        false
    );

    oldBall.batsman = batsman;
    oldBall.batsmanScore = parseInt(score);
    oldBall.bowler = bowler;
    oldBall.bowlerGuess = parseInt(guess);
    oldBall.result = newResult.message;
    oldBall.resultClass = newResult.resultClass;
    oldBall.ballType = newResult.ballType;
    oldBall.runs = newResult.runsScored;
    oldBall.isOut = newResult.isOut;
    oldBall.isWide = newResult.isWide;
    oldBall.isNoBall = newResult.isNoBall;
    oldBall.countsAsBall = newResult.countsAsBall;
    oldBall.batsmanRuns = newResult.runsScored;
    oldBall.batsmanBalls = newResult.countsAsBall ? 1 : 0;
    oldBall.bowlerRuns = newResult.runsScored;
    oldBall.bowlerBalls = newResult.countsAsBall ? 1 : 0;
    oldBall.bowlerWickets = newResult.isOut ? 1 : 0;
    oldBall.corrected = true;
    // inning and battingTeamId are preserved

    this.applyBallEffect({
        runsScored: newResult.runsScored,
        isOut: newResult.isOut,
        isWide: newResult.isWide,
        isNoBall: newResult.isNoBall,
        countsAsBall: newResult.countsAsBall,
        batsmanName: batsman,
        bowlerName: bowler,
        inning: ballInning,
        battingTeamId: ballBattingTeamId
    });

    this.matchState.striker = '';
    this.matchState.nonStriker = '';
    this._syncStrikerFields();

    this.saveAllData();
    return { message: `Ball ${index + 1} updated: ${oldBall.result}` };
}
    deleteBall(index) {
        if (!this.matchState.isActive && !this.matchState.isComplete) {
            return { error: 'Match not active' };
        }
        if (!this.matchState.ballLog || !this.matchState.ballLog[index]) {
            return { error: 'Ball not found' };
        }

        const ball = this.matchState.ballLog[index];
        this.reverseBallEffect(ball);
        this.matchState.ballLog.splice(index, 1);
        this.matchState.ballLog.forEach((b, i) => { b.index = i; });

        this.matchState.striker = '';
        this.matchState.nonStriker = '';
        this._syncStrikerFields();

        this.saveAllData();
        return { message: `Ball ${index + 1} deleted successfully` };
    }

    // ============================================
    // PENALTIES
    // ============================================

   applyPenalty(data) {
    const { type, player, offence } = data;
    if (!this.matchState.isActive) return { error: 'Match not active' };

    // Initialize per-player, per-offence counters
    if (!this.penaltyTracker[player]) {
        this.penaltyTracker[player] = {
            batsman: {
                score_without_permission: 0,
                text_instead_of_score: 0,
                double_score: 0,
                edit_delete_score: 0
            },
            bowler: {
                guess_before_permission: 0
            }
        };
    }

    // Safety: ensure nested structure exists (for players tracked before this fix)
    if (!this.penaltyTracker[player].batsman || typeof this.penaltyTracker[player].batsman !== 'object') {
        this.penaltyTracker[player].batsman = {
            score_without_permission: 0,
            text_instead_of_score: 0,
            double_score: 0,
            edit_delete_score: 0
        };
    }
    if (!this.penaltyTracker[player].bowler || typeof this.penaltyTracker[player].bowler !== 'object') {
        this.penaltyTracker[player].bowler = {
            guess_before_permission: 0
        };
    }

    const battingTeam = this.matchState.battingTeam === 1
        ? this.matchState.team1 : this.matchState.team2;

    let message = '';
    let teamRunsChange = 0;
    let batsmanRunsChange = 0;
    let isOut = false;
    let countsAsBall = false;
    let offenderFacesBall = false;
    let bowlerRemoved = false;

    if (type === 'batsman') {
        // Ensure this specific offence counter exists
        if (typeof this.penaltyTracker[player].batsman[offence] !== 'number') {
            this.penaltyTracker[player].batsman[offence] = 0;
        }
        const count = this.penaltyTracker[player].batsman[offence] + 1;
        this.penaltyTracker[player].batsman[offence] = count;

        switch (offence) {
            case 'score_without_permission':
                if (count === 1) {
                    teamRunsChange = -3;
                    batsmanRunsChange = -3;
                    message = `${player} - Score without permission (1st): -3 team, -3 batsman`;
                } else if (count === 2) {
                    teamRunsChange = -6;
                    batsmanRunsChange = -6;
                    message = `${player} - Score without permission (2nd): -6 team, -6 batsman`;
                } else {
                    isOut = true;
                    message = `${player} - Score without permission (3rd): DISMISSED!`;
                }
                break;

            case 'text_instead_of_score':
                if (count === 1) {
                    countsAsBall = true;
                    offenderFacesBall = true;
                    message = `${player} - Text instead of score (1st): DOT ball`;
                } else {
                    isOut = true;
                    countsAsBall = true;
                    offenderFacesBall = true;
                    message = `${player} - Text instead of score (2nd): DISMISSED!`;
                }
                break;

            case 'double_score':
                if (count === 1) {
                    teamRunsChange = -3;
                    batsmanRunsChange = -3;
                    countsAsBall = true;
                    offenderFacesBall = true;
                    message = `${player} - Double score (1st): -3 team, -3 batsman`;
                } else {
                    teamRunsChange = -6;
                    batsmanRunsChange = -6;
                    isOut = true;
                    countsAsBall = true;
                    offenderFacesBall = true;
                    message = `${player} - Double score (2nd): -6 + DISMISSED!`;
                }
                break;

            case 'edit_delete_score':
                isOut = true;
                countsAsBall = true;
                offenderFacesBall = true;
                message = `${player} - Edit/delete score in PM: DISMISSED!`;
                break;

            default:
                return { error: 'Invalid offence' };
        }
    } else if (type === 'bowler') {
        if (typeof this.penaltyTracker[player].bowler[offence] !== 'number') {
            this.penaltyTracker[player].bowler[offence] = 0;
        }
        const count = this.penaltyTracker[player].bowler[offence] + 1;
        this.penaltyTracker[player].bowler[offence] = count;

        switch (offence) {
            case 'guess_before_permission':
                if (count === 1) {
                    teamRunsChange = 3;
                    message = `${player} - Guess before permission (1st): +3`;
                } else if (count === 2) {
                    teamRunsChange = 6;
                    message = `${player} - Guess before permission (2nd): +6`;
                } else {
                    teamRunsChange = 6;
                    bowlerRemoved = true;
                    message = `${player} - Guess before permission (3rd): +6 + BOWLER REMOVED!`;
                }
                break;

            default:
                return { error: 'Invalid offence' };
        }
    } else {
        return { error: 'Invalid penalty type' };
    }

    // ---- APPLY CHANGES ----
    if (teamRunsChange !== 0) {
        battingTeam.runs += teamRunsChange;
    }

    if (batsmanRunsChange !== 0) {
        this._ensureBatsmanExists(player);
        const batsman = this.currentMatchStats.batsmen[player];
        batsman.runs = (batsman.runs || 0) + batsmanRunsChange;
        if (batsman.runs < 0) batsman.runs = 0;
    }

    if (countsAsBall) {
        this.matchState.currentBall += 1;
        battingTeam.balls += 1;

        if (offenderFacesBall) {
            this._ensureBatsmanExists(player);
            const batsman = this.currentMatchStats.batsmen[player];
            batsman.balls = (batsman.balls || 0) + 1;

            if (this.matchState.currentBowlerName) {
                this._ensureBowlerExists(this.matchState.currentBowlerName);
                const bowler = this.currentMatchStats.bowlers[this.matchState.currentBowlerName];
                bowler.balls = (bowler.balls || 0) + 1;
                const overs = Math.floor(bowler.balls / 6);
                const balls = bowler.balls % 6;
                bowler.overs = parseFloat(`${overs}.${balls}`);
            }
        }
    }

    if (isOut) {
        battingTeam.wickets += 1;
        const isLastBall = (this.matchState.currentBall >= 6);
        this._handleOut(player, isLastBall, true);
    }

    if (bowlerRemoved) {
        if (!this.matchState.removedBowlers) {
            this.matchState.removedBowlers = [];
        }
        this.matchState.removedBowlers.push(player);
        this.matchState.currentBowlerName = '';
    }

    if (!this.matchState.ballLog) this.matchState.ballLog = [];
    this.matchState.ballLog.push({
        index: this.matchState.ballLog.length,
        over: `${this.matchState.currentOver}.${this.matchState.currentBall}`,
        batsman: type === 'batsman' ? player : '',
        bowler: type === 'bowler' ? player : '',
        ballType: 'penalty',
        result: message,
        resultClass: 'penalty',
        runs: teamRunsChange,
        isOut: isOut,
        isWide: false,
        isNoBall: false,
        countsAsBall: countsAsBall,
        batsmanRuns: batsmanRunsChange,
        batsmanBalls: (countsAsBall && offenderFacesBall) ? 1 : 0,
        bowlerRuns: 0,
        bowlerBalls: 0,
        bowlerWickets: 0,
        isPenalty: true,
        corrected: false
    });

    if (this.matchState.currentBall >= 6) {
        this.matchState.currentBall = 0;
        this.matchState.currentOver += 1;
        this.matchState.noBallUsed = false;
        this.matchState.currentBowlerName = '';
        this.matchState.bowlerGuessed = false;
    }

    this.saveAllData();

    return { message, teamRunsChange, batsmanRunsChange, isOut, bowlerRemoved };
}

    // ============================================
    // EDIT SCORECARD STATS (Admin override)
    // ============================================

   editScorecardStats(data) {
    if (!this.matchState.isActive && !this.matchState.isComplete) {
        return { error: 'Match not active' };
    }

    const { team, batsmen, bowlers } = data;
    const stats = this._getCurrentInningStats();

    if (team) {
        const battingTeam = this.matchState.battingTeam === 1
            ? this.matchState.team1 : this.matchState.team2;
        if (team.runs !== undefined) battingTeam.runs = parseInt(team.runs) || 0;
        if (team.wickets !== undefined) battingTeam.wickets = parseInt(team.wickets) || 0;
        if (team.balls !== undefined) battingTeam.balls = parseInt(team.balls) || 0;
        if (team.extras !== undefined) battingTeam.extras = parseInt(team.extras) || 0;
    }

    if (batsmen && Array.isArray(batsmen)) {
        batsmen.forEach(b => {
            if (!b.name) return;
            this._ensureBatsmanExists(b.name);
            const target = stats.batsmen[b.name];
            if (!target) return;
            if (b.runs !== undefined) target.runs = parseInt(b.runs) || 0;
            if (b.balls !== undefined) target.balls = parseInt(b.balls) || 0;
            if (b.fours !== undefined) target.fours = parseInt(b.fours) || 0;
            if (b.sixes !== undefined) target.sixes = parseInt(b.sixes) || 0;
        });
    }

    if (bowlers && Array.isArray(bowlers)) {
        bowlers.forEach(b => {
            if (!b.name) return;
            this._ensureBowlerExists(b.name);
            const target = stats.bowlers[b.name];
            if (!target) return;
            if (b.wickets !== undefined) target.wickets = parseInt(b.wickets) || 0;
            if (b.balls !== undefined) {
                target.balls = parseInt(b.balls) || 0;
                const ov = Math.floor(target.balls / 6);
                const bl = target.balls % 6;
                target.overs = parseFloat(`${ov}.${bl}`);
            }
            if (b.runsConceded !== undefined) target.runsConceded = parseInt(b.runsConceded) || 0;
        });
    }

    this.saveAllData();
    return { message: 'Scorecard stats updated' };
}

    // ============================================
    // FINISH MATCH
    // ============================================

    async finishMatch() {
        if (!this.matchState.isActive && !this.matchState.isComplete) {
            return { error: 'No active match' };
        }
        if (this.matchState.isComplete) {
            return { error: 'Match already finished' };
        }

        const team1Score = this.matchState.team1.runs;
        const team2Score = this.matchState.team2.runs;
        let winner = 'TIE';
        if (team2Score > team1Score) winner = this.matchState.team2.name;
        else if (team1Score > team2Score) winner = this.matchState.team1.name;

        this.matchState.winner = winner;
        this.matchState.isComplete = true;
        this.matchState.isActive = false;

        // Update team stats
        this.updateTeamStats({
            team1: this.matchState.team1.name,
            team2: this.matchState.team2.name,
            winner: winner,
            runs1: team1Score,
            runs2: team2Score,
            overs1: this.matchState.currentOver + (this.matchState.currentBall / 6),
            overs2: 4
        });

        // Merge player stats (batsmen + bowlers)
        this._mergePlayerStats();

        // Mark fixture complete if applicable
        if (this.matchState.matchId && this.matchState.matchId.startsWith('FIX-')) {
            const fixture = this.fixtures.matches.find(m => m.id === this.matchState.matchId);
            if (fixture) {
                fixture.status = 'completed';
                fixture.result = winner;
                fixture.completedAt = new Date().toISOString();
                fixture.team1Runs = this.matchState.team1.runs;
                fixture.team2Runs = this.matchState.team2.runs;
                fixture.team1Overs = this.matchState.battingTeam === 1
                    ? (this.matchState.currentOver + this.matchState.currentBall / 6)
                    : 4;
                fixture.team2Overs = this.matchState.battingTeam === 2
                    ? (this.matchState.currentOver + this.matchState.currentBall / 6)
                    : 4;
                if (!this.fixtures.completed.includes(fixture.id)) {
                    this.fixtures.completed.push(fixture.id);
                }
            }
        }

        this.tournamentStats.matches = (this.tournamentStats.matches || 0) + 1;

        await this.saveAllData();

        // Sync to Google Sheets (async, non-blocking)
        this.syncToGoogleSheet().catch(err => console.error('Sheet sync error:', err));

        return {
            message: `🏆 Match Complete! Winner: ${winner}`,
            winner: winner,
            team1Score: team1Score,
            team2Score: team2Score
        };
    }

   _mergePlayerStats() {
    const allInnings = [this.currentMatchStats.innings[1], this.currentMatchStats.innings[2]];

    // Merge batsmen from all innings
    for (const innStats of allInnings) {
        if (!innStats) continue;
        for (const [name, stats] of Object.entries(innStats.batsmen || {})) {
            if (!this.playerStats.batsmen[name]) {
                this.playerStats.batsmen[name] = {
                    runs: 0, balls: 0, fours: 0, sixes: 0,
                    innings: 0, notOut: 0, highest: 0, average: 0, strikeRate: 0
                };
            }
            const bat = this.playerStats.batsmen[name];
            bat.runs += stats.runs || 0;
            bat.balls += stats.balls || 0;
            bat.fours += stats.fours || 0;
            bat.sixes += stats.sixes || 0;
            bat.innings += 1;
            if ((stats.runs || 0) > bat.highest) bat.highest = stats.runs || 0;
            bat.average = bat.innings > 0 ? bat.runs / bat.innings : 0;
            bat.strikeRate = bat.balls > 0 ? (bat.runs / bat.balls) * 100 : 0;
        }
    }

    // Merge bowlers from all innings
    for (const innStats of allInnings) {
        if (!innStats) continue;
        for (const [name, stats] of Object.entries(innStats.bowlers || {})) {
            if (!this.playerStats.bowlers[name]) {
                this.playerStats.bowlers[name] = {
                    wickets: 0, balls: 0, runsConceded: 0,
                    economy: 0, best: 0, matches: 0
                };
            }
            const bowl = this.playerStats.bowlers[name];
            bowl.wickets += stats.wickets || 0;
            bowl.balls += stats.balls || 0;
            bowl.runsConceded += stats.runsConceded || 0;
            bowl.matches += 1;
            bowl.economy = bowl.balls > 0 ? (bowl.runsConceded / bowl.balls) * 6 : 0;
            if ((stats.wickets || 0) > bowl.best) bowl.best = stats.wickets || 0;
        }
    }
}

    // ============================================
    // GET MATCH STATE
    // ============================================

    getMatchState() {
        const battingTeam = this.matchState.battingTeam === 1
            ? this.matchState.team1 : this.matchState.team2;
        const bowlingTeam = this.matchState.battingTeam === 1
            ? this.matchState.team2 : this.matchState.team1;

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
            isFreeHit: this.matchState.isFreeHit,
            lastBallResult: this.matchState.lastBallResult,
            batsmanSet: this.matchState.batsmanSet,
            bowlerGuessed: this.matchState.bowlerGuessed,
            currentBowlerName: this.matchState.currentBowlerName,
            noBallUsed: this.matchState.noBallUsed || false,
            striker: this.matchState.striker || '',
            nonStriker: this.matchState.nonStriker || '',
            currentBatsmanName: this.matchState.striker || '',
            dismissedBatsmen: this.matchState.dismissedBatsmen || [],
            removedBowlers: this.matchState.removedBowlers || [],
            ballLog: this.matchState.ballLog || [],
           batsmen: Object.values(this.currentMatchStats.innings[this.matchState.inning || 1]?.batsmen || {}),
          bowlers: Object.values(this.currentMatchStats.innings[this.matchState.inning || 1]?.bowlers || {}),
          batsmenInning1: Object.values(this.currentMatchStats.innings[1]?.batsmen || {}),
          bowlersInning1: Object.values(this.currentMatchStats.innings[1]?.bowlers || {}),
         batsmenInning2: Object.values(this.currentMatchStats.innings[2]?.batsmen || {}),
        bowlersInning2: Object.values(this.currentMatchStats.innings[2]?.bowlers || {})
        };
    }

    resetMatchAdmin() {
        this.resetMatch();
        return { message: 'Match reset successfully' };
    }

    // ============================================
    // END INNINGS (simplified — no stats merge, no sheet sync)
    // ============================================

    async endInnings() {
        const battingTeam = this.matchState.battingTeam === 1
            ? this.matchState.team1 : this.matchState.team2;

        if (this.matchState.inning === 1) {
            this.matchState.target = battingTeam.runs + 1;
            this.matchState.inning = 2;
            this.matchState.battingTeam = 2;
            this.matchState.bowlingTeam = 1;
            this.matchState.currentOver = 1;
            this.matchState.currentBall = 0;
            this.matchState.isFreeHit = false;
            this.matchState.noBallUsed = false;
            this.matchState.dismissedBatsmen = [];

            this.matchState.striker = '';
            this.matchState.nonStriker = '';
            this._syncStrikerFields();

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

            this.tournamentStats.matches = (this.tournamentStats.matches || 0) + 1;
            this.saveAllData();

            this.matchState.striker = '';
            this.matchState.nonStriker = '';

            return {
                message: `🏆 Match Complete! Winner: ${this.matchState.winner}`,
                winner: this.matchState.winner,
                team1Score: team1Score,
                team2Score: team2Score
            };
        }
    }

    // ============================================
    // FIXTURE MANAGEMENT (unchanged)
    // ============================================

    async completeFixtureWithScore(fixtureId, winner, team1Runs, team1Overs, team2Runs, team2Overs, manOfMatch, round) {
        const fixture = this.fixtures.matches.find(m => m.id === fixtureId);
        if (!fixture) throw new Error('Fixture not found');

        const team1Name = fixture.team1;
        const team2Name = fixture.team2;

        let runs1, runs2, overs1, overs2;
        if (winner === team1Name) {
            runs1 = team1Runs; runs2 = team2Runs;
            overs1 = team1Overs; overs2 = team2Overs;
        } else if (winner === team2Name) {
            runs1 = team2Runs; runs2 = team1Runs;
            overs1 = team2Overs; overs2 = team1Overs;
        } else {
            throw new Error('Winner must be one of the teams');
        }

        fixture.status = 'completed';
        fixture.result = winner;
        fixture.manOfMatch = manOfMatch || 'Not Applicable';
        fixture.completedAt = new Date().toISOString();
        fixture.team1Runs = runs1;
        fixture.team1Overs = overs1;
        fixture.team2Runs = runs2;
        fixture.team2Overs = overs2;
        fixture.round = round || 1;

        if (!this.fixtures.completed.includes(fixtureId)) {
            this.fixtures.completed.push(fixtureId);
        }

        this.updateTeamStats({
            team1: team1Name, team2: team2Name, winner,
            runs1, runs2, overs1, overs2
        });

        await this.saveAllData();
        return fixture;
    }

    updateMatchResult(id, team1Runs, team1Overs, team2Runs, team2Overs, winner) {
        const fixture = this.fixtures.matches.find(m => m.id === id);
        if (!fixture) return { success: false, error: 'Match not found' };

        fixture.team1Runs = team1Runs;
        fixture.team1Overs = team1Overs;
        fixture.team2Runs = team2Runs;
        fixture.team2Overs = team2Overs;
        fixture.result = winner;

        this.updateTeamStats({
            team1: fixture.team1, team2: fixture.team2, winner,
            runs1: team1Runs, runs2: team2Runs,
            overs1: team1Overs, overs2: team2Overs
        });
        this.saveAllData();
        return { success: true };
    }

    async editMatchResult(fixtureId, newTeam1Runs, newTeam1Overs, newTeam2Runs, newTeam2Overs, newWinner) {
        const fixture = this.fixtures.matches.find(m => m.id === fixtureId);
        if (!fixture) throw new Error('Fixture not found');

        this.removeMatchStats(fixture);

        fixture.team1Runs = newTeam1Runs;
        fixture.team1Overs = newTeam1Overs;
        fixture.team2Runs = newTeam2Runs;
        fixture.team2Overs = newTeam2Overs;
        fixture.result = newWinner;

        this.updateTeamStats({
            team1: fixture.team1, team2: fixture.team2, winner: newWinner,
            runs1: newTeam1Runs, runs2: newTeam2Runs,
            overs1: newTeam1Overs, overs2: newTeam2Overs
        });
        await this.saveAllData();
        return fixture;
    }

    removeMatchStats(fixture) {
        const team1 = this.teams.find(t => t.name === fixture.team1);
        const team2 = this.teams.find(t => t.name === fixture.team2);

        if (team1) {
            team1.matchesPlayed = Math.max(0, (team1.matchesPlayed || 0) - 1);
            team1.runsScored = Math.max(0, (team1.runsScored || 0) - (fixture.team1Runs || 0));
            team1.runsConceded = Math.max(0, (team1.runsConceded || 0) - (fixture.team2Runs || 0));
            team1.oversPlayed = Math.max(0, (team1.oversPlayed || 0) - (fixture.team1Overs || 4));
            team1.oversBowled = Math.max(0, (team1.oversBowled || 0) - (fixture.team2Overs || 4));
            if (fixture.result === team1.name) {
                team1.wins = Math.max(0, (team1.wins || 0) - 1);
                team1.points = Math.max(0, (team1.points || 0) - 2);
            } else {
                team1.losses = Math.max(0, (team1.losses || 0) - 1);
            }
        }

        if (team2) {
            team2.matchesPlayed = Math.max(0, (team2.matchesPlayed || 0) - 1);
            team2.runsScored = Math.max(0, (team2.runsScored || 0) - (fixture.team2Runs || 0));
            team2.runsConceded = Math.max(0, (team2.runsConceded || 0) - (fixture.team1Runs || 0));
            team2.oversPlayed = Math.max(0, (team2.oversPlayed || 0) - (fixture.team2Overs || 4));
            team2.oversBowled = Math.max(0, (team2.oversBowled || 0) - (fixture.team1Overs || 4));
            if (fixture.result === team2.name) {
                team2.wins = Math.max(0, (team2.wins || 0) - 1);
                team2.points = Math.max(0, (team2.points || 0) - 2);
            } else {
                team2.losses = Math.max(0, (team2.losses || 0) - 1);
            }
        }
    }

    async deleteMatchResult(fixtureId) {
        const fixture = this.fixtures.matches.find(m => m.id === fixtureId);
        if (!fixture) throw new Error('Fixture not found');

        this.removeMatchStats(fixture);
        const index = this.fixtures.matches.findIndex(m => m.id === fixtureId);
        if (index !== -1) this.fixtures.matches.splice(index, 1);
        this.fixtures.completed = this.fixtures.completed.filter(id => id !== fixtureId);
        await this.saveAllData();
        return { success: true };
    }

    getMatchResult(id) {
        const fixture = this.fixtures.matches.find(m => m.id === id);
        if (!fixture) return null;
        return {
            id: fixture.id,
            team1: fixture.team1,
            team2: fixture.team2,
            team1Runs: fixture.team1Runs || 0,
            team1Overs: fixture.team1Overs || 4,
            team2Runs: fixture.team2Runs || 0,
            team2Overs: fixture.team2Overs || 4,
            winner: fixture.result || fixture.winner,
            manOfMatch: fixture.manOfMatch || 'Not Applicable',
            date: fixture.date
        };
    }

    recalculateAllTeamStats() {
        this.teams.forEach(team => {
            team.matchesPlayed = 0;
            team.wins = 0;
            team.losses = 0;
            team.points = 0;
            team.runsScored = 0;
            team.runsConceded = 0;
            team.oversPlayed = 0;
            team.oversBowled = 0;
            team.netRunRate = 0;
        });

        const completedMatches = this.fixtures.matches.filter(f => f.status === 'completed');
        completedMatches.forEach(f => {
            if (f.team1Runs !== undefined && f.team2Runs !== undefined) {
                this.updateTeamStats({
                    team1: f.team1, team2: f.team2,
                    winner: f.result || f.winner,
                    runs1: f.team1Runs || 0, runs2: f.team2Runs || 0,
                    overs1: f.team1Overs || 4, overs2: f.team2Overs || 4
                });
            }
        });
    }

    // ============================================
    // TEAMS
    // ============================================

    async createTeam(teamData) {
        const team = {
            id: Date.now().toString(),
            name: teamData.name,
            captain: teamData.captain,
            viceCaptain: teamData.viceCaptain,
            squad: teamData.squad || [],
            points: 0, matchesPlayed: 0, wins: 0, losses: 0,
            netRunRate: 0, runsScored: 0, runsConceded: 0,
            oversPlayed: 0, oversBowled: 0,
            createdAt: new Date().toISOString()
        };
        this.teams.push(team);
        await this.saveAllData();
        return team;
    }

    getTeam(id) { return this.teams.find(t => t.id === id); }
    getAllTeams() { return this.teams; }

    // ============================================
    // FIXTURES
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
            result: null, matchId: null, manOfMatch: null,
            createdAt: new Date().toISOString()
        };
        this.fixtures.matches.push(fixture);
        this.fixtures.upcoming.push(fixture.id);
        await this.saveAllData();
        return fixture;
    }

    getFixtures() { return this.fixtures; }

    async startFixture(fixtureId) {
        const fixture = this.fixtures.matches.find(m => m.id === fixtureId);
        if (!fixture) throw new Error('Fixture not found');
        this.fixtures.upcoming = this.fixtures.upcoming.filter(id => id !== fixtureId);
        fixture.status = 'ongoing';
        const team1 = this.teams.find(t => t.name === fixture.team1);
        const team2 = this.teams.find(t => t.name === fixture.team2);
        if (team1 && team2) {
            this.setupMatch(team1.id, team2.id,
                team1.squad || [team1.captain, team1.viceCaptain, ...(team1.squad || [])],
                team2.squad || [team2.captain, team2.viceCaptain, ...(team2.squad || [])]
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
            this.updateTeamStats({
                team1: fixture.team1, team2: fixture.team2, winner,
                runs1: this.matchState?.team1?.runs || 0,
                runs2: this.matchState?.team2?.runs || 0,
                overs1: 4, overs2: 4
            });
        }
        await this.saveAllData();
        return fixture;
    }

    // ============================================
    // POINTS TABLE
    // ============================================

    getPointsTable(group) {
        let teams = this.teams;
        if (group) teams = teams.filter(t => t.group === group);

        const table = teams.map(team => ({
            rank: 0,
            name: team.name,
            group: team.group || 'Unassigned',
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
        if (!team1 || !team2) {
            console.error('❌ Team not found:', matchResult.team1, matchResult.team2);
            return;
        }

        const parseOvers = (overs) => {
            if (typeof overs === 'string' && overs.includes('.')) {
                const parts = overs.split('.');
                return parseInt(parts[0]) + (parseInt(parts[1]) || 0) / 6;
            }
            return parseFloat(overs) || 0;
        };

        const overs1 = parseOvers(matchResult.overs1);
        const overs2 = parseOvers(matchResult.overs2);

        if (team1) {
            team1.matchesPlayed = (team1.matchesPlayed || 0) + 1;
            team1.runsScored = (team1.runsScored || 0) + (matchResult.runs1 || 0);
            team1.runsConceded = (team1.runsConceded || 0) + (matchResult.runs2 || 0);
            team1.oversPlayed = (team1.oversPlayed || 0) + overs1;
            team1.oversBowled = (team1.oversBowled || 0) + overs2;
            if (matchResult.winner === team1.name) {
                team1.wins = (team1.wins || 0) + 1;
                team1.points = (team1.points || 0) + 2;
            } else if (matchResult.winner !== 'TIE') {
                team1.losses = (team1.losses || 0) + 1;
            }
        }

        if (team2) {
            team2.matchesPlayed = (team2.matchesPlayed || 0) + 1;
            team2.runsScored = (team2.runsScored || 0) + (matchResult.runs2 || 0);
            team2.runsConceded = (team2.runsConceded || 0) + (matchResult.runs1 || 0);
            team2.oversPlayed = (team2.oversPlayed || 0) + overs2;
            team2.oversBowled = (team2.oversBowled || 0) + overs1;
            if (matchResult.winner === team2.name) {
                team2.wins = (team2.wins || 0) + 1;
                team2.points = (team2.points || 0) + 2;
            } else if (matchResult.winner !== 'TIE') {
                team2.losses = (team2.losses || 0) + 1;
            }
        }

        this.saveAllData();
    }

    // ============================================
    // PLAYER STATS
    // ============================================

    updatePlayerStats(stats) {
        for (const [player, data] of Object.entries(stats)) {
            if (!this.playerStats.batsmen[player]) {
                this.playerStats.batsmen[player] = {
                    runs: 0, balls: 0, fours: 0, sixes: 0,
                    innings: 0, notOut: 0, highest: 0, average: 0, strikeRate: 0
                };
            }
            if (!this.playerStats.bowlers[player]) {
                this.playerStats.bowlers[player] = {
                    wickets: 0, balls: 0, runsConceded: 0,
                    economy: 0, best: 0, matches: 0
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
    // GOOGLE SHEET SYNC
    // ============================================

    async syncToGoogleSheet() {
        try {
            const batsmen = this.getTopBatsmen(10);
            const bowlers = this.getTopBowlers(10);
            const mom = this.getTopManOfMatch(5);
            const pointsTable = this.getPointsTable();

            const { GoogleSpreadsheet } = require('google-spreadsheet');
            const SHEET_ID = '1p35HY4tjArypj2fPp6JXtIIkHXLoV_kk5kZxZrjixeA';

            let creds;
            try {
                creds = JSON.parse(fs.readFileSync('/etc/secrets/credentials.json', 'utf8'));
            } catch (fileError) {
                creds = JSON.parse(fs.readFileSync('./credentials.json', 'utf8'));
            }

            if (!creds.client_email || !creds.private_key) {
                console.error('❌ Credentials missing!');
                return false;
            }

            const doc = new GoogleSpreadsheet(SHEET_ID);
            await doc.useServiceAccountAuth({
                client_email: creds.client_email,
                private_key: creds.private_key
            });
            await doc.loadInfo();

            const batsmenSheet = doc.sheetsByIndex[0];
            await batsmenSheet.clearRows();
            await batsmenSheet.setHeaderRow(['Player', 'Runs', 'Balls', 'Fours', 'Sixes', 'Avg', 'SR']);
            await batsmenSheet.addRows(batsmen.map(b => [
                b.name, b.runs || 0, b.balls || 0, b.fours || 0, b.sixes || 0,
                (b.average || 0).toFixed(2), (b.strikeRate || 0).toFixed(2)
            ]));

            const momSheet = doc.sheetsByIndex[1];
            await momSheet.clearRows();
            await momSheet.setHeaderRow(['Player', 'Count']);
            await momSheet.addRows(mom.map(m => [m.name, m.count || 0]));

            const bowlersSheet = doc.sheetsByIndex[2];
            await bowlersSheet.clearRows();
            await bowlersSheet.setHeaderRow(['Player', 'Wickets', 'Balls', 'Runs', 'Economy', 'Best']);
            await bowlersSheet.addRows(bowlers.map(b => [
                b.name, b.wickets || 0, b.balls || 0, b.runsConceded || 0,
                (b.economy || 0).toFixed(2), b.best || 0
            ]));

            const pointsSheet = doc.sheetsByIndex[3];
            if (pointsSheet) {
                await pointsSheet.clearRows();
                await pointsSheet.setHeaderRow(['Rank', 'Team', 'Matches', 'Wins', 'Losses', 'Points', 'NRR']);
                await pointsSheet.addRows(pointsTable.map(t => [
                    t.rank, t.name, t.matches || 0, t.wins || 0, t.losses || 0,
                    t.points || 0, t.netRunRate || 0
                ]));
            }

            console.log('✅ Google Sheet auto-synced successfully!');
            return true;
        } catch (error) {
            console.error('❌ Google Sheet sync failed:', error.message);
            return false;
        }
    }

    // ============================================
    // DATA EXPORT
    // ============================================

    exportTournamentData(format = 'json') {
        const data = {
            tournament: {
                name: 'GEM-STAR Championship 2026',
                exportedAt: new Date().toISOString(),
                totalMatches: this.tournamentStats.matches || 0
            },
            teams: this.teams.map(t => ({
                name: t.name, captain: t.captain, viceCaptain: t.viceCaptain,
                squad: t.squad, matches: t.matchesPlayed || 0,
                wins: t.wins || 0, losses: t.losses || 0,
                points: t.points || 0, netRunRate: t.netRunRate || 0            })),
            pointsTable: this.getPointsTable(),
            fixtures: this.fixtures.matches.map(f => ({
                team1: f.team1, team2: f.team2, date: f.date,
                venue: f.venue, host: f.host, status: f.status,
                result: f.result, manOfMatch: f.manOfMatch
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
        let html = `<!DOCTYPE html><html><head><title>GCL Report</title></head><body>`;
        html += `<h1>GEM-STAR Championship 2026</h1>`;
        html += `<p>Exported: ${new Date(data.tournament.exportedAt).toLocaleString()}</p>`;
        html += `<h2>Points Table</h2><table border="1"><tr><th>Rank</th><th>Team</th><th>Mat</th><th>W</th><th>L</th><th>Pts</th><th>NRR</th></tr>`;
        data.pointsTable.forEach(t => {
            html += `<tr><td>${t.rank}</td><td>${t.name}</td><td>${t.matches}</td><td>${t.wins}</td><td>${t.losses}</td><td>${t.points}</td><td>${t.netRunRate}</td></tr>`;
        });
        html += `</table></body></html>`;
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

    socket.on('setStriker', (data) => {
        try {
            const result = gameEngine.setStriker(data.name);
            if (result.error) {
                socket.emit('strikerError', { message: result.error });
                return;
            }
            io.emit('strikerSet', { name: data.name, state: gameEngine.getMatchState() });
            io.emit('stateUpdate', gameEngine.getMatchState());
            io.emit('notification', `🏏 Striker set: ${data.name}`);
        } catch (error) {
            socket.emit('strikerError', { message: error.message });
        }
    });

    socket.on('setNonStriker', (data) => {
        try {
            const result = gameEngine.setNonStriker(data.name);
            if (result.error) {
                socket.emit('nonStrikerError', { message: result.error });
                return;
            }
            io.emit('nonStrikerSet', { name: data.name, state: gameEngine.getMatchState() });
            io.emit('stateUpdate', gameEngine.getMatchState());
            io.emit('notification', `🔄 Non-Striker set: ${data.name}`);
        } catch (error) {
            socket.emit('nonStrikerError', { message: error.message });
        }
    });

    socket.on('applyPenalty', (data) => {
        try {
            const result = gameEngine.applyPenalty(data);
            if (result.error) {
                socket.emit('penaltyError', { message: result.error });
                return;
            }
            io.emit('penaltyApplied', { message: result.message, state: gameEngine.getMatchState() });
            io.emit('stateUpdate', gameEngine.getMatchState());
            io.emit('pointsTable', gameEngine.getPointsTable());
            io.emit('notification', `⚠️ ${result.message}`);
        } catch (error) {
            socket.emit('error', { message: error.message });
        }
    });

   socket.on('setBattingBowlingTeams', (data) => {
    try {
        const { battingTeam, bowlingTeam } = data;
        const team1Name = gameEngine.matchState.team1.name;
        const team2Name = gameEngine.matchState.team2.name;

        const newBattingTeamId = battingTeam === team1Name ? 1 : 2;
        const newBowlingTeamId = bowlingTeam === team1Name ? 1 : 2;
        const currentBattingTeamId = gameEngine.matchState.battingTeam;
        const isSwap = newBattingTeamId !== currentBattingTeamId;

        let notification = '';

        if (isSwap) {
            const previousBattingTeamObj = currentBattingTeamId === 1
                ? gameEngine.matchState.team1
                : gameEngine.matchState.team2;
            const previousRuns = previousBattingTeamObj.runs || 0;

            if (gameEngine.matchState.inning === 1) {
                gameEngine.matchState.target = previousRuns + 1;
                gameEngine.matchState.inning = 2;
                notification = `🏏 Inning 1 complete! Target: ${previousRuns + 1}`;
            } else {
                notification = `🏏 Teams swapped`;
            }

            gameEngine.matchState.battingTeam = newBattingTeamId;
            gameEngine.matchState.bowlingTeam = newBowlingTeamId;

            gameEngine.matchState.currentOver = 0;
            gameEngine.matchState.currentBall = 0;
            gameEngine.matchState.noBallUsed = false;
            gameEngine.matchState.batsmanSet = false;
            gameEngine.matchState.bowlerGuessed = false;
            gameEngine.matchState.secretScore = null;
            gameEngine.matchState.lastBallResult = null;
            gameEngine.matchState.currentBowlerName = '';

            gameEngine.matchState.striker = '';
            gameEngine.matchState.nonStriker = '';
            gameEngine._syncStrikerFields();
        } else {
            notification = `🏏 Teams unchanged`;
        }

        io.emit('teamsSet', {
            battingTeam, bowlingTeam,
            state: gameEngine.getMatchState()
        });
        io.emit('stateUpdate', gameEngine.getMatchState());
        io.emit('notification', notification);
    } catch (error) {
        socket.emit('error', { message: error.message });
    }
});
    socket.on('editBall', (data) => {
        try {
            const result = gameEngine.editBall(data);
            if (result.error) {
                socket.emit('error', { message: result.error });
                return;
            }
            io.emit('ballUpdated', { result: result.message, state: gameEngine.getMatchState() });
            io.emit('stateUpdate', gameEngine.getMatchState());
            io.emit('pointsTable', gameEngine.getPointsTable());
        } catch (error) {
            socket.emit('error', { message: error.message });
        }
    });

    socket.on('deleteBall', (data) => {
        try {
            const result = gameEngine.deleteBall(data.index);
            if (result.error) {
                socket.emit('error', { message: result.error });
                return;
            }
            io.emit('ballDeleted', { result: result.message, state: gameEngine.getMatchState() });
            io.emit('stateUpdate', gameEngine.getMatchState());
            io.emit('pointsTable', gameEngine.getPointsTable());
        } catch (error) {
            socket.emit('error', { message: error.message });
        }
    });

    socket.on('editScorecardStats', (data) => {
        try {
            const result = gameEngine.editScorecardStats(data);
            if (result.error) {
                socket.emit('error', { message: result.error });
                return;
            }
            io.emit('scorecardUpdated', { message: result.message, state: gameEngine.getMatchState() });
            io.emit('stateUpdate', gameEngine.getMatchState());
            io.emit('notification', `✏️ ${result.message}`);
        } catch (error) {
            socket.emit('error', { message: error.message });
        }
    });

    socket.on('finishMatch', async () => {
        try {
            const result = await gameEngine.finishMatch();
            if (result.error) {
                socket.emit('error', { message: result.error });
                return;
            }
            io.emit('stateUpdate', gameEngine.getMatchState());
            io.emit('pointsTable', gameEngine.getPointsTable());
            io.emit('topStats', {
                batsmen: gameEngine.getTopBatsmen(),
                bowlers: gameEngine.getTopBowlers(),
                manOfMatch: gameEngine.getTopManOfMatch()
            });
            io.emit('fixturesUpdate', gameEngine.getFixtures());
            io.emit('matchFinished', { message: result.message, winner: result.winner });
            io.emit('notification', `🏆 ${result.message}`);
        } catch (error) {
            socket.emit('error', { message: error.message });
        }
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
                data.team1Id, data.team2Id,
                data.team1Order, data.team2Order
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

    socket.on('completeFixtureWithScore', (data) => {
        try {
            const { fixtureId, team1Runs, team1Overs, team2Runs, team2Overs, winner, manOfMatch, round } = data;
            gameEngine.completeFixtureWithScore(
                fixtureId, winner, team1Runs, team1Overs,
                team2Runs, team2Overs, manOfMatch || 'Not Applicable', round || 1
            ).then(fixture => {
                io.emit('fixturesUpdate', gameEngine.getFixtures());
                io.emit('pointsTable', gameEngine.getPointsTable());
                io.emit('notification', `🏆 Match completed! Winner: ${winner}`);
            }).catch(err => {
                socket.emit('error', { message: err.message });
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

app.get('/api/teams', (req, res) => res.json(gameEngine.getAllTeams()));

app.post('/api/teams', (req, res) => {
    try {
        gameEngine.createTeam(req.body).then(team => res.json(team));
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.get('/api/match/state', (req, res) => res.json(gameEngine.getMatchState()));

app.post('/api/match/setup', (req, res) => {
    try {
        const state = gameEngine.setupMatch(
            req.body.team1Id, req.body.team2Id,
            req.body.team1Order, req.body.team2Order
        );
        res.json(state);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.post('/api/match/reset', (req, res) => {
    res.json(gameEngine.resetMatchAdmin());
});

app.post('/api/match/bat', (req, res) => {
    const result = gameEngine.batsmanSetScore(req.body);
    if (result.error) return res.status(400).json(result);
    io.emit('scoreUpdate', { type: 'batsmanSet', result, state: gameEngine.getMatchState() });
    res.json(result);
});

app.post('/api/match/bowl', (req, res) => {
    const result = gameEngine.bowlerGuess(req.body);
    if (result.error) return res.status(400).json(result);
    io.emit('scoreUpdate', { type: 'bowlResult', result, state: gameEngine.getMatchState() });
    res.json(result);
});

app.get('/api/fixtures', (req, res) => res.json(gameEngine.getFixtures()));

app.post('/api/fixtures', (req, res) => {
    try {
        gameEngine.createFixture(req.body).then(fixture => res.json(fixture));
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.post('/api/fixtures/start/:id', (req, res) => {
    try {
        gameEngine.startFixture(req.params.id).then(fixture => res.json(fixture));
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.post('/api/fixtures/complete', (req, res) => {
    try {
        gameEngine.completeFixture(
            req.body.fixtureId, req.body.winner,
            req.body.manOfMatch, req.body.playerStats
        ).then(fixture => res.json(fixture));
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.get('/api/points-table', (req, res) => {
    try {
        res.json(gameEngine.getPointsTable());
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.get('/api/stats/batsmen', (req, res) => res.json(gameEngine.getTopBatsmen()));
app.get('/api/stats/bowlers', (req, res) => res.json(gameEngine.getTopBowlers()));
app.get('/api/stats/manofmatch', (req, res) => res.json(gameEngine.getTopManOfMatch()));
app.get('/api/stats/player/:name', (req, res) => res.json(gameEngine.getPlayerStats(req.params.name)));

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
            let csv = '=== BATSMEN ===\nPlayer,Runs,Balls,Fours,Sixes,Average,SR,Highest\n';
            data.batsmen.forEach(p => {
                csv += `${p.name},${p.runs||0},${p.balls||0},${p.fours||0},${p.sixes||0},${(p.average||0).toFixed(2)},${(p.strikeRate||0).toFixed(2)},${p.highest||0}\n`;
            });
            res.setHeader('Content-Type', 'text/csv');
            res.send(csv);
        } else {
            res.status(400).json({ error: 'Invalid format' });
        }
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.get('/api/export/top10', (req, res) => {
    try {
        res.json({
            batsmen: gameEngine.getTopBatsmen(10),
            bowlers: gameEngine.getTopBowlers(10),
            manOfMatch: gameEngine.getTopManOfMatch(5)
        });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.get('/api/export/all', (req, res) => {
    try {
        res.json({
            pointsTable: gameEngine.getPointsTable(),
            topBatsmen: gameEngine.getTopBatsmen(10),
            topBowlers: gameEngine.getTopBowlers(10),
            manOfMatch: gameEngine.getTopManOfMatch(5),
            teams: gameEngine.getAllTeams(),
            fixtures: gameEngine.getFixtures()
        });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.get('/api/fixtures/round/:round', (req, res) => {
    try {
        const round = parseInt(req.params.round);
        res.json(gameEngine.getFixtures().matches.filter(f => f.round === round));
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.get('/api/points-table/:group?', (req, res) => {
    try {
        res.json(gameEngine.getPointsTable(req.params.group));
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.get('/api/tournament/stats', (req, res) => res.json(gameEngine.tournamentStats));

app.post('/api/fixtures/complete-with-score', (req, res) => {
    try {
        const { fixtureId, team1Runs, team1Overs, team2Runs, team2Overs, winner, manOfMatch } = req.body;
        gameEngine.completeFixtureWithScore(
            fixtureId, winner, team1Runs, team1Overs,
            team2Runs, team2Overs, manOfMatch || 'Not Applicable'
        ).then(fixture => res.json({ success: true, fixture }))
         .catch(err => res.status(400).json({ success: false, error: err.message }));
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

app.post('/api/matches/update', (req, res) => {
    try {
        const { id, team1Runs, team1Overs, team2Runs, team2Overs, winner } = req.body;
        const result = gameEngine.updateMatchResult(id, team1Runs, team1Overs, team2Runs, team2Overs, winner);
        if (result.success) res.json({ success: true });
        else res.status(404).json({ success: false, error: result.error });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

app.post('/api/matches/delete', (req, res) => {
    try {
        const result = gameEngine.deleteMatchResult(req.body.id);
        if (result.success) res.json({ success: true });
        else res.status(404).json({ success: false, error: result.error });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

app.get('/api/matches/:id', (req, res) => {
    try {
        const match = gameEngine.getMatchResult(req.params.id);
        if (match) res.json(match);
        else res.status(404).json({ error: 'Match not found' });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.post('/api/fixtures/update', (req, res) => {
    try {
        const updatedFixture = req.body;
        const index = gameEngine.fixtures.matches.findIndex(f => f.id === updatedFixture.id);
        if (index === -1) return res.status(404).json({ success: false, error: 'Fixture not found' });
        gameEngine.fixtures.matches[index] = updatedFixture;
        gameEngine.saveAllData();
        res.json({ success: true });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

app.post('/api/fixtures/delete', (req, res) => {
    try {
        const index = gameEngine.fixtures.matches.findIndex(f => f.id === req.body.id);
        if (index === -1) return res.status(404).json({ success: false, error: 'Fixture not found' });
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
        if (index === -1) return res.status(404).json({ success: false, error: 'Team not found' });
        if (updatedTeam.name !== undefined) gameEngine.teams[index].name = updatedTeam.name;
        if (updatedTeam.captain !== undefined) gameEngine.teams[index].captain = updatedTeam.captain;
        if (updatedTeam.viceCaptain !== undefined) gameEngine.teams[index].viceCaptain = updatedTeam.viceCaptain;
        if (updatedTeam.squad !== undefined) gameEngine.teams[index].squad = updatedTeam.squad || [];
        if (updatedTeam.group !== undefined) gameEngine.teams[index].group = updatedTeam.group || null;
        gameEngine.saveAllData();
        res.json({ success: true });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

app.post('/api/teams/update-group', (req, res) => {
    try {
        const { id, group } = req.body;
        const index = gameEngine.teams.findIndex(t => t.id === id);
        if (index === -1) return res.status(404).json({ success: false, error: 'Team not found' });
        gameEngine.teams[index].group = group || null;
        gameEngine.saveAllData();
        res.json({ success: true });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

app.post('/api/teams/delete', (req, res) => {
    try {
        const index = gameEngine.teams.findIndex(t => t.id === req.body.id);
        if (index === -1) return res.status(404).json({ success: false, error: 'Team not found' });
        gameEngine.teams.splice(index, 1);
        gameEngine.saveAllData();
        res.json({ success: true });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================
// GOOGLE SHEETS FETCH
// ============================================

const SHEET_ID = '1p35HY4tjArypj2fPp6JXtIIkHXLoV_kk5kZxZrjixeA';

async function fetchTop10FromSheet() {
    try {
        let creds;
        try {
            creds = JSON.parse(fs.readFileSync('/etc/secrets/credentials.json', 'utf8'));
        } catch (fileError) {
            creds = JSON.parse(fs.readFileSync('./credentials.json', 'utf8'));
        }
        if (!creds.client_email || !creds.private_key) {
            return { batsmen: [], bowlers: [], mom: [] };
        }

        const { GoogleSpreadsheet } = require('google-spreadsheet');
        const doc = new GoogleSpreadsheet(SHEET_ID);
        await doc.useServiceAccountAuth({
            client_email: creds.client_email,
            private_key: creds.private_key
        });
        await doc.loadInfo();

        const batsmenSheet = doc.sheetsByIndex[0];
        const bowlersSheet = doc.sheetsByIndex[2];
        const momSheet = doc.sheetsByIndex[1];

        const batsmenRows = await batsmenSheet.getRows();
        const bowlersRows = await bowlersSheet.getRows();
        const momRows = await momSheet.getRows();

        const batsmen = batsmenRows.map(row => {
            const data = row._rawData || {};
            const keys = Object.keys(data);
            return {
                name: data[keys[0]] || '',
                runs: parseInt(data[keys[1]]) || 0,
                balls: parseInt(data[keys[2]]) || 0,
                fours: parseInt(data[keys[3]]) || 0,
                sixes: parseInt(data[keys[4]]) || 0,
                average: parseFloat(data[keys[5]]) || 0,
                strikeRate: parseFloat(data[keys[6]]) || 0
            };
        });

        const bowlers = bowlersRows.map(row => {
            const data = row._rawData || {};
            const keys = Object.keys(data);
            return {
                name: data[keys[0]] || '',
                wickets: parseInt(data[keys[1]]) || 0,
                balls: parseInt(data[keys[2]]) || 0,
                runs: parseInt(data[keys[3]]) || 0,
                economy: parseFloat(data[keys[4]]) || 0,
                best: data[keys[5]] || ''
            };
        });

        const mom = momRows.map(row => {
            const data = row._rawData || {};
            const keys = Object.keys(data);
            return {
                name: data[keys[0]] || '',
                count: parseInt(data[keys[1]]) || 0
            };
        });

        return { batsmen, bowlers, mom };
    } catch (error) {
        console.error('❌ Google Sheet Error:', error.message);
        return { batsmen: [], bowlers: [], mom: [] };
    }
}

app.get('/api/top10/sheet', async (req, res) => {
    try {
        res.json(await fetchTop10FromSheet());
    } catch (error) {
        res.status(500).json({ error: error.message });
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
    });
}

startServer();
