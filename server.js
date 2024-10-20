const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();

// Set up CORS with environment variable
const corsOptions = {
  origin: process.env.CORS_ORIGIN || "*", // Use environment variable for allowed origin in production
  methods: ["GET", "POST"],
};
app.use(cors(corsOptions));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || "*", // Same origin setting for WebSocket connection
    methods: ["GET", "POST"],
  },
  maxHttpBufferSize: 5e6, // 5 MB max file size for now
});

const users = new Map();

io.on("connection", (socket) => {
  console.log("A user connected");

  socket.on("set_name", (name) => {
    users.set(socket.id, { id: socket.id, name });
    io.emit("users", Array.from(users.values()));
  });

  socket.on("send_file_offer", (data) => {
    const receiver = io.sockets.sockets.get(data.to);
    if (receiver) {
      receiver.emit("file_offer", {
        from: socket.id,
        name: data.name,
        size: data.size,
      });
    }
  });

  socket.on("accept_file", (data) => {
    const sender = io.sockets.sockets.get(data.from);
    if (sender) {
      sender.emit("file_accepted", { to: socket.id });
    }
  });

  socket.on("reject_file", (data) => {
    const sender = io.sockets.sockets.get(data.from);
    if (sender) {
      sender.emit("file_rejected", { to: socket.id });
    }
  });

  socket.on("file_chunk", (data) => {
    const receiver = io.sockets.sockets.get(data.to);
    if (receiver) {
      receiver.emit("file_chunk", data);
    }
  });

  socket.on("disconnect", () => {
    console.log("A user disconnected");
    users.delete(socket.id);
    io.emit("users", Array.from(users.values()));
  });
});

// Use the dynamic port provided by Render or default to 3001 not okay
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
