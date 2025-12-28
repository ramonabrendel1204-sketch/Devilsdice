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
    console.log('Eine Seele hat sich verbunden:', socket.id);

    socket.on('join-room', ({ roomId, playerName, isBotCount }) => {
        socket.join(roomId);
        if (!rooms[roomId]) {
            rooms[roomId] = {
                players: [],
                gameStarted: false,
                round: 1,
                currentPlayerIdx: 0
            };
        }

        const room = rooms[roomId];
        if (room.gameStarted) {
            socket.emit('error-msg', 'Das Ritual hat bereits begonnen.');
            return;
        }

        room.players.push({
            id: socket.id,
            name: playerName,
            isBot: false,
            scores: {},
            total: 0
        });

        io.to(roomId).emit('update-players', room.players);
    });

    socket.on('start-game', (roomId) => {
        if (rooms[roomId]) {
            rooms[roomId].gameStarted = true;
            io.to(roomId).emit('game-started', rooms[roomId]);
        }
    });

    socket.on('sync-game-state', ({ roomId, gameState }) => {
        if (rooms[roomId]) {
            rooms[roomId] = gameState;
            socket.to(roomId).emit('game-state-updated', gameState);
        }
    });

    socket.on('disconnect', () => {
        console.log('Eine Seele ist entkommen.');
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Der Altar ist bereit auf Port ${PORT}`);
});

