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

io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

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

    // Notify the other peer in the room (if present)
    socket.to(room).emit("peer-joined", { peerId: socket.id });
  });

  // --- Forward WebRTC signaling ---
  socket.on("signal", ({ room, payload }) => {
    socket.to(room).emit("signal", payload);
  });

  // --- Forward authentication handshake ---
  socket.on("auth", ({ room, payload }) => {
    socket.to(room).emit("auth", payload);
  });

  // --- Connection request flow ---
  socket.on("request-connection", ({ room, from }) => {
    socket.to(room).emit("incoming-request", { from });
    console.log(`Connection request from ${from} in room ${room}`);
  });

  socket.on("accept-connection", ({ room }) => {
    socket.to(room).emit("request-accepted");
    console.log(`Connection accepted in room ${room}`);
  });

  socket.on("reject-connection", ({ room }) => {
    socket.to(room).emit("request-rejected");
    console.log(`Connection rejected in room ${room}`);
  });

  // --- Handle disconnects ---
  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);

    // Notify peers in all rooms this socket was part of
    socket.rooms.forEach((room) => {
      if (room !== socket.id) { // skip socket’s private room
        socket.to(room).emit("peer-left", { peerId: socket.id });
      }
    });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
