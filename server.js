const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

// To confirm server is alive
app.get("/", (req, res) => {
  res.send("✅ Signaling server is running");
});

// Map: pubKey -> socket.id
const userSockets = {};

// Helper: normalize base64-like key strings
function normKey(k) {
  return (typeof k === 'string') ? k.replace(/\s+/g, '') : k;
}

io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  // --- Registration: each client must tell us their pubKey ---
  socket.on("register", (pubKey) => {
    if (!pubKey) return;
    const key = normKey(pubKey);
    userSockets[key] = socket.id;
    socket.data.pubKey = key;
    console.log(`🔑 Registered: ${key.slice(0, 12)}... -> ${socket.id}`);
  });

  // --- Room join with 2-user limit ---
  socket.on("join", (room) => {
    const clients = io.sockets.adapter.rooms.get(room);
    const count = clients ? clients.size : 0;

    if (count >= 2) {
      socket.emit("room-full", room);
      console.log(`Room ${room} is full. Rejecting ${socket.id}`);
      return;
    }
    socket.join(room);
    console.log(`Client ${socket.id} joined ${room}`);
    socket.to(room).emit("peer-joined", { peerId: socket.id });
  });

  // --- Forward WebRTC signaling & Auth Handshake to a room ---
  socket.on("signal", ({ room, payload }) => {
    socket.to(room).emit("signal", payload);
  });
  socket.on("auth", ({ room, payload }) => {
    socket.to(room).emit("auth", payload);
  });

  // --- This handles the initial "ping" for notifications ---
  socket.on("request-connection", ({ to, from }) => {
    const targetId = userSockets[normKey(to)];
    if (targetId) {
      io.to(targetId).emit("incoming-request", { from: normKey(from) });
      console.log(`📨 Connection request: ${from.slice(0, 12)} → ${to.slice(0, 12)}`);
    } else {
      console.log(`⚠️ Could not deliver request from ${from} to ${to} (not registered)`);
    }
  });

  // --- Handle disconnects ---
  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
    if (socket.data.pubKey) {
      delete userSockets[socket.data.pubKey];
      console.log(`🗑️ Unregistered: ${socket.data.pubKey.slice(0, 12)}...`);
    }
    socket.rooms.forEach((room) => {
      if (room !== socket.id) {
        socket.to(room).emit("peer-left", { peerId: socket.id });
      }
    });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
