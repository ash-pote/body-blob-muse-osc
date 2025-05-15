import express from "express";
import fs from "fs";
import path, { dirname as pathDirname } from "path";
import bodyParser from "body-parser";
import { fileURLToPath } from "url";
import cors from "cors";
import http from "http";
import { WebSocketServer } from "ws";
import osc from "osc";

// Fix __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = pathDirname(__filename);

const app = express();
const PORT = 3000;
const recordingsDir = path.join(__dirname, "public", "recordings");

// Enable CORS
app.use(cors({ origin: "http://localhost:5173" }));
app.use(bodyParser.json({ limit: "50mb" }));
app.use(express.static("public"));

// Save JSON pose data
app.post("/save", (req, res) => {
  const filename = `pose_${Date.now()}.json`;
  const filePath = path.join(recordingsDir, filename);

  fs.writeFile(filePath, JSON.stringify(req.body), (err) => {
    if (err) {
      console.error("Error saving file:", err);
      return res.status(500).send("Failed to save file.");
    }
    res.send("Saved: " + filename);
    console.log("Saved pose to:", filePath);
  });
});

// Get random pose file
app.get("/random-pose", (req, res) => {
  fs.readdir(recordingsDir, (err, files) => {
    if (err || files.length === 0) {
      return res.status(404).send("No files found.");
    }

    const jsonFiles = files.filter((f) => f.endsWith(".json"));
    if (jsonFiles.length === 0) {
      return res.status(404).send("No JSON files found.");
    }

    const randomFile = jsonFiles[Math.floor(Math.random() * jsonFiles.length)];
    const fullPath = path.join(recordingsDir, randomFile);
    res.sendFile(fullPath);
  });
});

// Create HTTP server and bind WebSocket server to it
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

function broadcast(data) {
  const msg = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === client.OPEN) {
      client.send(msg);
    }
  });
}

// OSC UDP Port (receiving from TouchDesigner or Muse)
const udpPort = new osc.UDPPort({
  localAddress: "0.0.0.0",
  localPort: 8000,
});

udpPort.on("message", function (oscMsg) {
  console.log("Received OSC:", oscMsg);
  broadcast(oscMsg); // send to browser via WebSocket
});

udpPort.open();

// Start the server
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
