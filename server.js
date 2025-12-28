const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

let rooms = {};

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
            room.players.push({
                id: socket.id,
                name: playerName,
                scores: {},
                total: 0
            });
            io.to(roomId).emit('update-players', room.players);
        }
    });

    socket.on('start-game', (roomId) => {
        if (rooms[roomId]) {
            rooms[roomId].gameStarted = true;
            io.to(roomId).emit('game-started', rooms[roomId]);
        }
    });

    // Synchronisiert JEDE Aktion (Würfeln, Halten, Eintragen)
    socket.on('sync-action', ({ roomId, gameState }) => {
        if (rooms[roomId]) {
            rooms[roomId] = { ...rooms[roomId], ...gameState };
            // Sende an alle anderen im Raum
            socket.to(roomId).emit('game-state-updated', rooms[roomId]);
        }
    });

    socket.on('disconnect', () => {
        // Logik für Spieler verlassen könnte hier erweitert werden
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server läuft auf Port ${PORT}`));

