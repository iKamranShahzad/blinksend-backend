const express = require("express");
const WebSocket = require("ws");
const cors = require("cors");

const app = express();
app.use(cors());

// Create WebSocket server
const wss = new WebSocket.Server({ port: 8080 });

// Store connected devices and ongoing transfers
const connectedDevices = new Map();
const activeTransfers = new Map();

wss.on("connection", (ws) => {
  console.log("New client connected");

  ws.on("message", (message) => {
    try {
      const data = JSON.parse(message);

      switch (data.type) {
        case "register":
          // Add new device to connected devices
          const deviceId = data.device.id;
          connectedDevices.set(deviceId, {
            ...data.device,
            ws,
          });
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
    // Remove disconnected device
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

  // Initialize or get transfer data
  if (!activeTransfers.has(transfer.id)) {
    activeTransfers.set(transfer.id, {
      chunks: new Array(transfer.totalChunks),
      receivedChunks: 0,
    });
  }

  const transferData = activeTransfers.get(transfer.id);
  transferData.chunks[transfer.currentChunk] = chunk;
  transferData.receivedChunks++;

  // Acknowledge chunk receipt
  senderWs.send(
    JSON.stringify({
      type: "chunk-received",
      transferId: transfer.id,
      chunkIndex: transfer.currentChunk,
    })
  );

  // If all chunks received, send complete file to target
  if (transferData.receivedChunks === transfer.totalChunks) {
    const completeFile = new Uint8Array(
      transferData.chunks.reduce((acc, chunk) => [...acc, ...chunk], [])
    );

    targetDeviceConn.ws.send(
      JSON.stringify({
        type: "file-received",
        fileName: transfer.fileName,
        fileData: Array.from(completeFile),
      })
    );

    // Clean up transfer data
    activeTransfers.delete(transfer.id);
  }
}

function broadcastDevices() {
  const deviceList = Array.from(connectedDevices.values()).map(
    ({ ws, ...device }) => device
  );
  const message = JSON.stringify({ type: "devices", devices: deviceList });

  for (const device of connectedDevices.values()) {
    device.ws.send(message);
  }
}

console.log("WebSocket server running on port 8080");
