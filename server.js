const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

let rooms = {};

function calculateScore(id, dice) {
    const counts = dice.reduce((a, v) => { a[v] = (a[v] || 0) + 1; return a; }, {});
    const sum = dice.reduce((a, b) => a + b, 0);
    const vals = Object.values(counts);
    const unique = [...new Set(dice)].sort();

    if (parseInt(id)) return (counts[id] || 0) * parseInt(id);
    if (id === "kn") return vals.some(v => v >= 5) ? 50 : 0;
    if (id === "ch") return sum;
    if (id === "fh") return (vals.includes(2) && vals.includes(3)) || vals.includes(5) ? 25 : 0;
    if (id === "ks") return /1234|2345|3456/.test(unique.join('')) ? 30 : 0;
    if (id === "gs") return unique.length === 5 && (unique[4] - unique[0] === 4) ? 40 : 0;
    if (id === "3k") return vals.some(v => v >= 3) ? sum : 0;
    if (id === "4k") return vals.some(v => v >= 4) ? sum : 0;
    return 0;
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
        // Spieler nur hinzufügen, wenn das Spiel noch nicht läuft
        if (!room.gameStarted) {
            const playerExists = room.players.find(p => p.id === socket.id);
            if (!playerExists) {
                room.players.push({ id: socket.id, name: playerName, scores: {}, total: 0 });
            }
            // Broadcast an ALLE im Raum (inklusive des neuen Spielers)
            io.to(rId).emit('update-players', room.players);
        }
    });

    socket.on('start-game', (roomId) => {
        const rId = roomId.toUpperCase();
        if (rooms[rId] && rooms[rId].players.length > 0) {
            rooms[rId].gameStarted = true;
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

            let upper = 0;
            ["1", "2", "3", "4", "5", "6"].forEach(id => upper += (player.scores[id] || 0));
            let total = Object.values(player.scores).reduce((a, b) => a + b, 0);
            player.total = total + (upper >= 63 ? 35 : 0);

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
                io.to(rId).emit('update-players', rooms[rId].players);
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Dämonen lauschen auf Port ${PORT}`));

