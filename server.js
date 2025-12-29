const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

let rooms = {};

// Korrigierte Punkteberechnung auf dem Server
function calculateScore(id, dice) {
    if (!dice || dice.length === 0 || dice.includes(0)) return 0;

    // Erstelle ein Map der Vorkommen jeder Zahl (1-6)
    const counts = {};
    dice.forEach(v => { counts[v] = (counts[v] || 0) + 1; });
    
    const sum = dice.reduce((a, b) => a + b, 0);
    const vals = Object.values(counts);
    const unique = [...new Set(dice)].sort((a, b) => a - b);

    // Zahlenfelder 1-6
    if (!isNaN(id)) {
        const numId = parseInt(id);
        return (counts[numId] || 0) * numId;
    }
    
    // Spezial-Kategorien
    switch(id) {
        case "kn": // DER TEUFEL (5 Gleiche)
            return vals.some(v => v >= 5) ? 50 : 0;
            
        case "ch": // Schicksal (Chance)
            return sum;
            
        case "fh": // Hexenzirkel (Full House: 3 gleiche + 2 gleiche)
            return (vals.includes(2) && vals.includes(3)) || vals.includes(5) ? 25 : 0;
            
        case "ks": // Kleine Treppe (4 aufeinanderfolgende)
            const s = unique.join('');
            return /1234|2345|3456/.test(s) || /1234/.test(s) || /2345/.test(s) || /3456/.test(s) ? 30 : 0;
            
        case "gs": // Große Treppe (5 aufeinanderfolgende)
            return unique.length === 5 && (unique[4] - unique[0] === 4) ? 40 : 0;
            
        case "3k": // Dreier-Schrei (Mindestens 3 gleiche -> Summe aller Würfel)
            return vals.some(count => count >= 3) ? sum : 0;
            
        case "4k": // Vierer-Qual (Mindestens 4 gleiche -> Summe aller Würfel)
            return vals.some(count => count >= 4) ? sum : 0;
            
        default:
            return 0;
    }
}

io.on('connection', (socket) => {
    socket.on('join-room', ({ roomId, playerName }) => {
        const rId = roomId.toUpperCase();
        socket.join(rId);
        
        if (!rooms[rId]) {
            rooms[rId] = {
                players: [],
                gameStarted: false,
                currentPlayerIdx: 0,
                dice: [0, 0, 0, 0, 0],
                rollsLeft: 3
            };
        }
        
        const room = rooms[rId];
        if (!room.gameStarted) {
            const playerExists = room.players.find(p => p.id === socket.id);
            if (!playerExists) {
                room.players.push({ id: socket.id, name: playerName, scores: {}, total: 0 });
            }
            io.to(rId).emit('update-players', room.players);
        }
    });

    socket.on('start-game', (roomId) => {
        const rId = roomId.toUpperCase();
        if (rooms[rId]) {
            rooms[rId].gameStarted = true;
            rooms[rId].currentPlayerIdx = 0;
            rooms[rId].dice = [0, 0, 0, 0, 0];
            rooms[rId].rollsLeft = 3;
            rooms[rId].players.forEach(p => { p.scores = {}; p.total = 0; });
            io.to(rId).emit('game-started', rooms[rId]);
        }
    });

    socket.on('dice-rolled', ({ roomId, dice, rollsLeft }) => {
        const rId = roomId.toUpperCase();
        if (rooms[rId]) {
            rooms[rId].dice = dice;
            rooms[rId].rollsLeft = rollsLeft;
            io.to(rId).emit('sync-game', rooms[rId]);
        }
    });

    socket.on('select-category', ({ roomId, catId }) => {
        const rId = roomId.toUpperCase();
        const room = rooms[rId];
        if (room) {
            const player = room.players[room.currentPlayerIdx];
            const score = calculateScore(catId, room.dice);
            player.scores[catId] = score;

            // Punktzahl-Updates
            let upper = 0;
            ["1", "2", "3", "4", "5", "6"].forEach(id => upper += (player.scores[id] || 0));
            let total = Object.values(player.scores).reduce((a, b) => a + b, 0);
            player.total = total + (upper >= 63 ? 35 : 0);

            // Wechsel zum nächsten Spieler
            room.currentPlayerIdx = (room.currentPlayerIdx + 1) % room.players.length;
            room.rollsLeft = 3;
            room.dice = [0, 0, 0, 0, 0];

            io.to(rId).emit('sync-game', room);
        }
    });

    socket.on('disconnecting', () => {
        for (const rId of socket.rooms) {
            if (rooms[rId]) {
                rooms[rId].players = rooms[rId].players.filter(p => p.id !== socket.id);
                if (rooms[rId].players.length === 0) {
                    delete rooms[rId];
                } else {
                    io.to(rId).emit('update-players', rooms[rId].players);
                }
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Devil's Dice Server online.`));

