  socket.on("accept-connection", ({ to, from }) => {
    for (let [id, s] of io.sockets.sockets) {
      const sPub = getSocketPub(s);
      if (sPub === to) {
        io.to(id).emit("request-accepted", { from });
        console.log(`Connection accepted: ${from} → ${to}`);
        break;
      }
    }
  });

  socket.on("reject-connection", ({ to, from }) => {
    for (let [id, s] of io.sockets.sockets) {
      const sPub = getSocketPub(s);
      if (sPub === to) {
        io.to(id).emit("request-rejected", { from });
        console.log(`Connection rejected: ${from} → ${to}`);
        break;
      }
    }
  });
