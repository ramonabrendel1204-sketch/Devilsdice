const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

let rooms = {};

// Hilfsfunktion zur Punkteberechnung auf dem Server (Sicherheit & Sync)
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
        socket.join(roomId);
        if (!rooms[roomId]) {
            rooms[roomId] = {
                players: [],
                gameStarted: false,
                currentPlayerIdx: 0,
                dice: [0, 0, 0, 0, 0],
                rollsLeft: 3,
                held: [false, false, false, false, false]
            };
        }
        const room = rooms[roomId];
        if (!room.gameStarted) {
            room.players.push({ id: socket.id, name: playerName, scores: {}, total: 0 });
            io.to(roomId).emit('update-players', room.players);
        }
    });

    socket.on('start-game', (roomId) => {
        if (rooms[roomId]) {
            rooms[roomId].gameStarted = true;
            io.to(roomId).emit('game-started', rooms[roomId]);
        }
    });

    // Aktion: Würfeln
    socket.on('dice-rolled', ({ roomId, dice, rollsLeft }) => {
        if (rooms[roomId]) {
            rooms[roomId].dice = dice;
            rooms[roomId].rollsLeft = rollsLeft;
            io.to(roomId).emit('sync-game', rooms[roomId]);
        }
    });

    // Aktion: Würfel halten (Nur visuell für andere, falls gewünscht - hier deaktiviert für Privatsphäre)
    socket.on('toggle-hold', ({ roomId, held }) => {
        if (rooms[roomId]) {
            rooms[roomId].held = held;
            socket.to(roomId).emit('sync-held', held);
        }
    });

    // Aktion: Kategorie wählen (Server berechnet Punkte!)
    socket.on('select-category', ({ roomId, catId }) => {
        const room = rooms[roomId];
        if (room) {
            const player = room.players[room.currentPlayerIdx];
            const score = calculateScore(catId, room.dice);
            player.scores[catId] = score;

            // Gesamtpunktzahl & Bonus
            let upper = 0;
            ["1", "2", "3", "4", "5", "6"].forEach(id => upper += (player.scores[id] || 0));
            let total = Object.values(player.scores).reduce((a, b) => a + b, 0);
            player.total = total + (upper >= 63 ? 35 : 0);

            // Nächster Spieler
            room.currentPlayerIdx = (room.currentPlayerIdx + 1) % room.players.length;
            room.rollsLeft = 3;
            room.dice = [0, 0, 0, 0, 0];
            room.held = [false, false, false, false, false];

            io.to(roomId).emit('sync-game', room);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server gestartet auf Port ${PORT}`));

