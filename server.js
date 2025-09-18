const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

// just to confirm server is alive
app.get("/", (req, res) => {
  res.send("✅ Signaling server is running");
});

// Map: pubKey -> socket.id
const userSockets = {};

io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  // --- Registration: each client must tell us their pubKey ---
  socket.on("register", (pubKey) => {
    if (!pubKey) return;
    userSockets[pubKey] = socket.id;
    socket.data.pubKey = pubKey; // store on socket for cleanup
    console.log(`🔑 Registered: ${pubKey.slice(0, 12)}... -> ${socket.id}`);
  });

  // --- Room join with 2-user limit ---
  socket.on("join", (room) => {
    const clients = io.sockets.adapter.rooms.get(room);
    const count = clients ? clients.size : 0;

    if (count >= 3) {
      socket.emit("room-full", room);
      console.log(`Room ${room} is full. Rejecting ${socket.id}`);
      return;
    }

    socket.join(room);
    console.log(`Client ${socket.id} joined ${room}`);

    // Notify the other peer in the room (if present)
    socket.to(room).emit("peer-joined", { peerId: socket.id });
  });

  // --- Forward WebRTC signaling ---
  socket.on("signal", ({ room, payload }) => {
  socket.to(room).emit("signal", { room, payload });
});

socket.on("auth", ({ room, payload }) => {
  socket.to(room).emit("auth", { room, payload });
});


  // --- Connection request flow ---
  socket.on("request-connection", ({ to, from, fromLabel }) => {
    const targetId = userSockets[to];
    if (targetId) {
      io.to(targetId).emit("incoming-request", { from, fromLabel });
      console.log(`📨 Connection request: ${from.slice(0, 12)} → ${to.slice(0, 12)}`);
    } else {
      console.log(`⚠️ Could not deliver request from ${from} to ${to} (not registered)`);
    }
  });

  socket.on("accept-connection", ({ to, from }) => {
    const targetId = userSockets[to];
    if (targetId) {
      io.to(targetId).emit("request-accepted", { from });
      console.log(`✅ Connection accepted by ${from.slice(0, 12)} for ${to.slice(0, 12)}`);
    } else {
      console.log(`⚠️ Accept could not be delivered: ${from} → ${to}`);
    }
  });

  socket.on("reject-connection", ({ to, from }) => {
    const targetId = userSockets[to];
    if (targetId) {
      io.to(targetId).emit("request-rejected", { from });
      console.log(`❌ Connection rejected by ${from.slice(0, 12)} for ${to.slice(0, 12)}`);
    } else {
      console.log(`⚠️ Reject could not be delivered: ${from} → ${to}`);
    }
  });

  // --- Handle disconnects ---
  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);

    // Remove pubKey mapping
    if (socket.data.pubKey) {
      delete userSockets[socket.data.pubKey];
      console.log(`🗑️ Unregistered: ${socket.data.pubKey.slice(0, 12)}...`);
    }

    // Notify peers in all rooms this socket was part of
    socket.rooms.forEach((room) => {
      if (room !== socket.id) {
        socket.to(room).emit("peer-left", { peerId: socket.id });
      }
    });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
