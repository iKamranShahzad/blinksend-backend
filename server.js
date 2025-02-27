const express = require("express");
const WebSocket = require("ws");
const cors = require("cors");

const app = express();
app.use(cors());

// Initializing the WebSocket server
const wss = new WebSocket.Server({ port: 8080 });

// These two maps store the connected devices and roomIDs
const connectedDevices = new Map();
const rooms = new Map();

const uniqueNames = [
  "Harry",
  "Drake",
  "Jake Paul",
  "Django",
  "Hermione",
  "Zayn",
  "John Snow",
  "Ron",
  "Luna",
  "Dobby",
  "Draco",
  "Hagrid",
  "Dumbledore",
  "Severus",
  "Mario Mario",
  "Luigi Mario",
  "Princess Peach",
  "Link",
  "Gryffindor",
  "Slytherin",
  "Ravenclaw",
  "Zelda",
  "Master Chief",
  "Lara Croft",
  "Kratos",
  "Solid Snake",
  "Samus Aran",
  "Gordon Freeman",
  "Nathan Drake",
  "Aloy",
  "Geralt of Rivia",
  "Cloud Strife",
  "Ellie",
  "Joel",
  "Commander Shepard",
  "Ezio Auditore",
  "Lara Croft",
];
const assignedNames = new Map(); // this map will store the assigned names

// Function to get a unique name for a device kinda cheeky way to get a unique name
function getUniqueName() {
  let name = uniqueNames[Math.floor(Math.random() * uniqueNames.length)];
  while (assignedNames.has(name)) {
    name = uniqueNames[Math.floor(Math.random() * uniqueNames.length)];
  }
  return name;
}

// Function to broadcast the list of connected devices to all clients (prolly filter out the current device from the list)
function broadcastDevices(roomId) {
  const roomDevices = rooms.get(roomId);
  if (!roomDevices) return;

  for (const deviceId of roomDevices) {
    const device = connectedDevices.get(deviceId);
    if (!device) continue;

    const deviceList = Array.from(roomDevices)
      .filter((id) => id !== deviceId)
      .map((id) => {
        const d = connectedDevices.get(id);
        const { ws, ...deviceInfo } = d;
        return deviceInfo;
      });

    device.ws.send(
      JSON.stringify({
        type: "devices",
        devices: deviceList,
      })
    );
  }
}

// Function to generate a random room ID
function generateRoomId() {
  const min = 10000;
  const max = 99999;
  let roomId;
  do {
    roomId = Math.floor(Math.random() * (max - min + 1)) + min;
  } while (rooms.has(roomId.toString()));
  return roomId.toString();
}

function createRoom(ws, deviceId) {
  const roomId = generateRoomId();
  rooms.set(roomId, new Set([deviceId]));
  ws.send(
    JSON.stringify({
      type: "room-created",
      roomId,
    })
  );
  broadcastDevices(roomId);
}

function joinRoom(ws, deviceId, roomId) {
  if (!rooms.has(roomId)) {
    ws.send(
      JSON.stringify({
        type: "room-error",
        message: "Room does not exist",
      })
    );
    return;
  }

  rooms.get(roomId).add(deviceId);
  ws.send(
    JSON.stringify({
      type: "room-joined",
      roomId,
    })
  );
  broadcastDevices(roomId);
}

// WebSocket server event handlers (connection, message, close)
wss.on("connection", (ws) => {
  console.log("New client connected");
  let currentDeviceId = null;

  ws.on("message", (message) => {
    try {
      const data = JSON.parse(message);

      switch (data.type) {
        case "register":
          currentDeviceId = data.device.id;
          const deviceName = getUniqueName();
          assignedNames.set(currentDeviceId, deviceName);
          connectedDevices.set(currentDeviceId, {
            ...data.device,
            name: deviceName,
            ws,
          });

          ws.send(
            JSON.stringify({
              type: "self-identity",
              name: deviceName,
            })
          );
          break;

        case "create-room":
          if (!currentDeviceId || !connectedDevices.has(currentDeviceId)) {
            ws.send(
              JSON.stringify({
                type: "room-error",
                message: "Device not registered",
              })
            );
            return;
          }
          createRoom(ws, currentDeviceId);
          break;

        case "join-room":
          if (!currentDeviceId || !connectedDevices.has(currentDeviceId)) {
            ws.send(
              JSON.stringify({
                type: "room-error",
                message: "Device not registered",
              })
            );
            return;
          }
          joinRoom(ws, currentDeviceId, data.roomId);
          break;

        case "file-transfer":
          handleFileTransfer(ws, data);
          break;

        default:
          ws.send(
            JSON.stringify({
              type: "error",
              message: "Unknown message type",
            })
          );
      }
    } catch (error) {
      console.error("Error processing message:", error);
      ws.send(
        JSON.stringify({
          type: "error",
          message: "Failed to process message",
        })
      );
    }
  });

  // Keep the existing close handler
  ws.on("close", () => {
    if (currentDeviceId) {
      connectedDevices.delete(currentDeviceId);
      assignedNames.delete(currentDeviceId);

      for (const [roomId, devices] of rooms.entries()) {
        if (devices.has(currentDeviceId)) {
          devices.delete(currentDeviceId);
          if (devices.size === 0) {
            rooms.delete(roomId);
          } else {
            broadcastDevices(roomId);
          }
          break;
        }
      }
    }
  });
});

// Function to handle file transfer in chunks
function handleFileTransfer(senderWs, data) {
  const { transfer, targetDevice, chunk } = data;
  const targetDeviceConn = connectedDevices.get(targetDevice);
  if (!targetDeviceConn) {
    senderWs.send(
      JSON.stringify({
        type: "transfer-error",
        transferId: transfer.id,
        error: "Target device not found",
      })
    );
    return;
  }

  // Forward the chunk directly to the target device
  targetDeviceConn.ws.send(
    JSON.stringify({
      type: "file-chunk",
      transfer: {
        id: transfer.id,
        fileName: transfer.fileName,
        fileSize: transfer.fileSize,
        currentChunk: transfer.currentChunk,
        totalChunks: transfer.totalChunks,
      },
      chunk: chunk,
    })
  );

  // Acknowledge receipt to the sender
  senderWs.send(
    JSON.stringify({
      type: "chunk-received",
      transferId: transfer.id,
      chunkIndex: transfer.currentChunk,
    })
  );
}

console.log("WebSocket server running on port 8080");
