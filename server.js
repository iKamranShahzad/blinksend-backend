const express = require("express");
const WebSocket = require("ws");
const cors = require("cors");

const app = express();
app.use(cors());

// Initializing the WebSocket server
const wss = new WebSocket.Server({ port: 8080 });

// These two maps store the connected devices and active file transfers
const connectedDevices = new Map();
const activeTransfers = new Map();

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
function broadcastDevices() {
  for (const [deviceId, device] of connectedDevices.entries()) {
    const deviceList = Array.from(connectedDevices.values())
      .filter((d) => d.id !== deviceId)
      .map(({ ws, ...deviceInfo }) => deviceInfo);
    const message = JSON.stringify({ type: "devices", devices: deviceList });
    device.ws.send(message);
  }
}

// WebSocket server event handlers (connection, message, close)

wss.on("connection", (ws) => {
  console.log("New client connected");

  ws.on("message", (message) => {
    try {
      const data = JSON.parse(message);

      switch (data.type) {
        case "register":
          const deviceId = data.device.id;
          const deviceName = getUniqueName();
          assignedNames.set(deviceId, deviceName);
          connectedDevices.set(deviceId, {
            ...data.device,
            name: deviceName,
            ws,
          });

          // sending the assigned name to the client side
          ws.send(
            JSON.stringify({
              type: "self-identity",
              name: deviceName,
            })
          );

          // Broadcast the updated list of connected devices (with the current device's name filtered out)
          broadcastDevices();
          break;

        case "file-transfer":
          handleFileTransfer(ws, data);
          break;
      }
    } catch (error) {
      console.error("Error processing message:", error);
    }
  });

  ws.on("close", () => {
    // When a client disconnects, it is then removed from the connected devices list and the updated list is broadcasted to all clients
    for (const [deviceId, device] of connectedDevices.entries()) {
      if (device.ws === ws) {
        connectedDevices.delete(deviceId);
        break;
      }
    }
    broadcastDevices();
    console.log("Client disconnected");
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

  // Initializing the new transfer data
  if (!activeTransfers.has(transfer.id)) {
    activeTransfers.set(transfer.id, {
      chunks: new Array(transfer.totalChunks),
      receivedChunks: 0,
    });
  }

  const transferData = activeTransfers.get(transfer.id);
  transferData.chunks[transfer.currentChunk] = chunk;
  transferData.receivedChunks++;

  // Acknowledge chunk receipt to sender & target
  senderWs.send(
    JSON.stringify({
      type: "chunk-received",
      transferId: transfer.id,
      chunkIndex: transfer.currentChunk,
    })
  );

  // If all chunks received, send complete file to target device
  if (transferData.receivedChunks === transfer.totalChunks) {
    const completeFile = transferData.chunks.reduce(
      (acc, chunk) => acc.concat(chunk),
      []
    );
    targetDeviceConn.ws.send(
      JSON.stringify({
        type: "file-received",
        fileName: transfer.fileName,
        fileData: completeFile,
      })
    );

    // Clean up transfer data after sending the complete file
    activeTransfers.delete(transfer.id);
  }
}

console.log("WebSocket server running on port 8080");
