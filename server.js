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

// Helper: reusable function to forward events
const forwardEvent = (eventName, socket) => {
  socket.on(eventName, ({ room, to, payload }) => {
    if (to) {
      const targetId = userSockets[normKey(to)];
      if (targetId) {
        // Forward to the specific socket ID of the recipient
        io.to(targetId).emit(eventName, { room, payload });
        return;
      }
      console.log(`${eventName}: target not registered yet:`, (to || ''));
    }
    // Fallback to broadcasting to the room if 'to' is not found
    if (room) {
      socket.to(room).emit(eventName, { room, payload });
    }
  });
};

io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  // --- Registration: client provides its public key ---
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

  // --- Forward WebRTC and Auth events ---
  forwardEvent("signal", socket);
  forwardEvent("auth", socket);

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
