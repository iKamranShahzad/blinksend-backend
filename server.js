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

// Function to get a unique name for a device
function getUniqueName() {
  let name = uniqueNames[Math.floor(Math.random() * uniqueNames.length)];
  while (assignedNames.has(name)) {
    name = uniqueNames[Math.floor(Math.random() * uniqueNames.length)];
  }
  return name;
}

// Function to broadcast the list of connected devices to all clients
function broadcastDevices(roomId) {
  const roomDevices = rooms.get(roomId);
  if (!roomDevices) return;

  // Create a lightweight device list for each client to reduce memory usage
  for (const deviceId of roomDevices) {
    const device = connectedDevices.get(deviceId);
    if (!device) continue;

    const deviceList = Array.from(roomDevices)
      .filter((id) => id !== deviceId)
      .map((id) => {
        const d = connectedDevices.get(id);
        if (d) {
          // Only send necessary device info (exclude the WebSocket connection)
          const { ws, ...deviceInfo } = d;
          return deviceInfo;
        }
        return null;
      })
      .filter(Boolean); // Remove any null entries

    // Send the device list to the client
    try {
      device.ws.send(
        JSON.stringify({
          type: "devices",
          devices: deviceList,
        })
      );
    } catch (err) {
      console.error(`Error sending device list to ${deviceId}:`, err.message);
    }
  }

  // Request garbage collection after broadcasting
  if (global.gc) {
    global.gc();
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
  try {
    ws.send(
      JSON.stringify({
        type: "room-created",
        roomId,
      })
    );
    broadcastDevices(roomId);
  } catch (err) {
    console.error(`Error creating room for ${deviceId}:`, err.message);
  }
}

function joinRoom(ws, deviceId, roomId) {
  if (!rooms.has(roomId)) {
    try {
      ws.send(
        JSON.stringify({
          type: "room-error",
          message: "Room does not exist",
        })
      );
    } catch (err) {
      console.error(`Error sending room error to ${deviceId}:`, err.message);
    }
    return;
  }

  rooms.get(roomId).add(deviceId);
  try {
    ws.send(
      JSON.stringify({
        type: "room-joined",
        roomId,
      })
    );
    broadcastDevices(roomId);
  } catch (err) {
    console.error(`Error joining room for ${deviceId}:`, err.message);
  }
}

// Enhanced error handling for WebSocket messages
function safeJsonParse(message) {
  try {
    return JSON.parse(message);
  } catch (error) {
    console.error("Invalid JSON message:", error);
    return null;
  }
}

// WebSocket server event handlers
wss.on("connection", (ws) => {
  console.log("New client connected");
  let currentDeviceId = null;

  ws.on("message", (message) => {
    try {
      const data = safeJsonParse(message);
      if (!data) return;

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

      // Suggest garbage collection after processing large messages
      if (message.length > 1024 * 1024 && global.gc) {
        global.gc();
      }
    } catch (error) {
      console.error("Error processing message:", error);
      try {
        ws.send(
          JSON.stringify({
            type: "error",
            message: "Failed to process message",
          })
        );
      } catch (sendError) {
        console.error("Error sending error message:", sendError);
      }
    }
  });

  // Handle disconnections
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

    // Suggest garbage collection after client disconnects
    if (global.gc) {
      global.gc();
    }
  });

  // Handle connection errors
  ws.on("error", (err) => {
    console.error("WebSocket connection error:", err);
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

// Function to handle file transfer in chunks with optimized memory usage
function handleFileTransfer(senderWs, data) {
  try {
    const { transfer, targetDevice, chunk } = data;

    // Validate the required fields
    if (!transfer || !targetDevice || !chunk) {
      senderWs.send(
        JSON.stringify({
          type: "transfer-error",
          transferId: transfer?.id || "unknown",
          error: "Invalid transfer data",
        })
      );
      return;
    }

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
    // Only send necessary transfer data to reduce memory overhead
    try {
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

      // Request garbage collection periodically during large transfers
      if (transfer.currentChunk % 20 === 0 && global.gc) {
        global.gc();
      }
    } catch (sendError) {
      console.error("Error forwarding chunk:", sendError);
      senderWs.send(
        JSON.stringify({
          type: "transfer-error",
          transferId: transfer.id,
          error: "Failed to deliver chunk to target device",
        })
      );
    }
  } catch (error) {
    console.error("Error handling file transfer:", error);
    try {
      senderWs.send(
        JSON.stringify({
          type: "transfer-error",
          transferId: data?.transfer?.id || "unknown",
          error: "Internal server error",
        })
      );
    } catch (sendError) {
      console.error("Error sending error response:", sendError);
    }
  }
}

// Periodically check for stuck transfers or zombie connections
setInterval(() => {
  try {
    // Check for any disconnected but not properly closed WebSockets
    for (const [deviceId, device] of connectedDevices.entries()) {
      if (
        device.ws.readyState === WebSocket.CLOSED ||
        device.ws.readyState === WebSocket.CLOSING
      ) {
        console.log(`Cleaning up stale connection for device ${deviceId}`);
        connectedDevices.delete(deviceId);
        assignedNames.delete(deviceId);

        for (const [roomId, devices] of rooms.entries()) {
          if (devices.has(deviceId)) {
            devices.delete(deviceId);
            if (devices.size === 0) {
              rooms.delete(roomId);
            } else {
              broadcastDevices(roomId);
            }
            break;
          }
        }
      }
    }

    // Request garbage collection
    if (global.gc) {
      global.gc();
    }
  } catch (error) {
    console.error("Error during cleanup interval:", error);
  }
}, 60000); // Run every minute

console.log("WebSocket server running on port 8080");
