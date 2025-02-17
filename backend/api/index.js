import express from "express";
import http from "http";
import { Server as socketIo } from "socket.io";
import { exec } from "child_process";
import fs from "fs";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new socketIo(server);

app.use(express.json());
app.use(cors());

// Serve static files from the React app
app.use(express.static(path.join(__dirname, "client/dist")));

const userSocketMap = {};
const roomChatHistory = {};

function getAllConnectedClients(roomid) {
  const room = io.sockets.adapter.rooms.get(roomid);
  if (!room) return [];

  return Array.from(room).map((socketid) => ({
    socketid,
    username: userSocketMap[socketid],
  }));
}

io.on("connection", (socket) => {
  console.log("New client connected");

  socket.on("join", ({ roomid, username }) => {
    if (!username) {
      socket.emit("redirect", "/");
      return;
    }
    userSocketMap[socket.id] = username;
    socket.join(roomid);
    const clients = getAllConnectedClients(roomid);
    if (roomChatHistory[roomid]) {
      socket.emit("chat_history", roomChatHistory[roomid]);
    }
    clients.forEach(({ socketid }) => {
      io.to(socketid).emit("joined", {
        clients,
        username,
        socketid: socket.id,
      });
    });
  });

  socket.on("runCode", (data) => {
    const { code } = data;
    const fileName = "tempCode.js"; // Assuming JavaScript code for example
    fs.writeFileSync(fileName, code);

    exec(`node ${fileName}`, (error, stdout, stderr) => {
      if (error) {
        console.error(`exec error: ${error}`);
        socket.emit("codeOutput", { output: `Error: ${stderr}` });
      } else {
        socket.emit("codeOutput", { output: stdout });
      }

      if (fs.existsSync(fileName)) {
        fs.unlinkSync(fileName);
      } else {
        console.error(`File ${fileName} does not exist.`);
      }
    });
  });

  socket.on("message", ({ username, message, roomid, time, socketid }) => {
    const chatMessage = { username, message, time, socketid };
    if (!roomChatHistory[roomid]) {
      roomChatHistory[roomid] = [];
    }
    roomChatHistory[roomid].push(chatMessage);
    io.to(roomid).emit("message", chatMessage);
  });

  socket.on("sync-change", ({ roomid, code }) => {
    io.to(roomid).emit("sync", code);
  });

  socket.on("draw", ({ offsetX, offsetY, isDrawing, tool, color, roomid }) => {
    let data = { offsetX, offsetY, isDrawing, tool, color };
    io.to(roomid).emit("draw", data);
  });

  socket.on("clear", ({ roomid }) => {
    io.to(roomid).emit("clear", roomid);
  });

  socket.on("disconnecting", () => {
    const rooms = Array.from(socket.rooms);
    rooms.forEach((roomid) => {
      io.to(roomid).emit("disconnected", {
        socketId: socket.id,
        username: userSocketMap[socket.id],
      });
    });
  });

  socket.on("disconnect", () => {
    delete userSocketMap[socket.id];
    console.log("Client disconnected");
  });
});

app.post("/runCode", (req, res) => {
  const { code } = req.body;
  exec(`node -e "${code}"`, (error, stdout, stderr) => {
    if (error) {
      console.error(`exec error: ${error}`);
      res.status(500).json({ output: stderr });
    } else {
      res.status(200).json({ output: stdout });
    }
  });
});

// All remaining requests return the React app, so it can handle routing.
app.use((req, res, next) => {
  res.sendFile(path.join(__dirname, "client/dist", "index.html"));
});

export default (req, res) => app(req, res);
