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
      message: `You created room ${roomId}`,
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

  const deviceName = assignedNames.get(deviceId) || "Unknown device";

  // Notify the joining device
  ws.send(
    JSON.stringify({
      type: "room-joined",
      roomId,
      message: `You joined room ${roomId}`,
    })
  );

  // Notify other devices in the room about the new device
  const roomDevices = rooms.get(roomId);
  for (const existingDeviceId of roomDevices) {
    if (existingDeviceId !== deviceId) {
      const device = connectedDevices.get(existingDeviceId);
      if (device && device.ws) {
        device.ws.send(
          JSON.stringify({
            type: "device-joined",
            deviceName,
          })
        );
      }
    }
  }

  // Add device to the room
  roomDevices.add(deviceId);
  broadcastDevices(roomId);
}

// Find which room a device belongs to
function findDeviceRoom(deviceId) {
  for (const [roomId, devices] of rooms.entries()) {
    if (devices.has(deviceId)) {
      return roomId;
    }
  }
  return null;
}

// WebSocket server event handlers
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

        case "leave-room":
          if (!currentDeviceId || !connectedDevices.has(currentDeviceId)) {
            ws.send(
              JSON.stringify({
                type: "room-error",
                message: "Device not registered",
              })
            );
            return;
          }

          const deviceRoom = findDeviceRoom(currentDeviceId);
          if (deviceRoom) {
            const deviceName =
              assignedNames.get(currentDeviceId) || "Unknown device";
            const devices = rooms.get(deviceRoom);
            devices.delete(currentDeviceId);

            // Notify the client that they left
            ws.send(
              JSON.stringify({
                type: "room-left",
                roomId: deviceRoom,
              })
            );

            // Notify remaining devices
            for (const deviceId of devices) {
              const device = connectedDevices.get(deviceId);
              if (device && device.ws) {
                device.ws.send(
                  JSON.stringify({
                    type: "device-left",
                    deviceName,
                  })
                );
              }
            }

            if (devices.size === 0) {
              rooms.delete(deviceRoom);
            } else {
              broadcastDevices(deviceRoom);
            }
          }
          break;

        // WebRTC signaling messages
        case "rtc-offer":
        case "rtc-answer":
        case "rtc-candidate":
          // Forwarding CHEEKY WebRTC signaling messages to the target device
          const targetDeviceConn = connectedDevices.get(data.to);
          if (targetDeviceConn) {
            data.from = currentDeviceId;
            targetDeviceConn.ws.send(JSON.stringify(data));
          } else {
            ws.send(
              JSON.stringify({
                type: "error",
                message: "Target device not found",
              })
            );
          }
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

  ws.on("close", () => {
    if (currentDeviceId) {
      const deviceName = assignedNames.get(currentDeviceId) || "Unknown device";

      // Find which room the device was in
      const roomId = findDeviceRoom(currentDeviceId);
      if (roomId) {
        const devices = rooms.get(roomId);
        devices.delete(currentDeviceId);

        // Notify remaining devices about the departure
        for (const deviceId of devices) {
          const device = connectedDevices.get(deviceId);
          if (device && device.ws) {
            device.ws.send(
              JSON.stringify({
                type: "device-left",
                deviceName,
              })
            );
          }
        }

        if (devices.size === 0) {
          rooms.delete(roomId);
        } else {
          broadcastDevices(roomId);
        }
      }

      connectedDevices.delete(currentDeviceId);
      assignedNames.delete(currentDeviceId);
    }
  });
});

console.log("WebSocket server running on port 8080");
