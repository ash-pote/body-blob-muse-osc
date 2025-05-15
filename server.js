import express from "express";
import fs from "fs";
import path, { dirname } from "path";
import bodyParser from "body-parser";
import { fileURLToPath } from "url";
import { dirname as pathDirname } from "path";
import cors from "cors";

// Fix __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = pathDirname(__filename);

const app = express();
const PORT = 3000;
const recordingsDir = path.join(__dirname, "public", "recordings");

// Enable CORS (you can restrict the origin to 'http://localhost:5173' if needed)
app.use(cors({ origin: "http://localhost:5173" })); // Allow the frontend to access this server

// Middleware to parse JSON requests
app.use(bodyParser.json({ limit: "50mb" }));
app.use(express.static("public"));

// Save JSON pose data
app.post("/save", (req, res) => {
  const filename = `pose_${Date.now()}.json`;
  const filePath = path.join(recordingsDir, filename);
  fs.writeFile(filePath, JSON.stringify(req.body), (err) => {
    if (err) return res.status(500).send("Failed to save file.");
    res.send("Saved: " + filename);
  });
  console.log("Saving pose to:", filePath);
});

// Get random pose file
app.get("/random-pose", (req, res) => {
  fs.readdir(recordingsDir, (err, files) => {
    if (err || files.length === 0)
      return res.status(404).send("No files found.");
    const jsonFiles = files.filter((f) => f.endsWith(".json"));
    const randomFile = jsonFiles[Math.floor(Math.random() * jsonFiles.length)];
    res.sendFile(path.join(recordingsDir, randomFile));
  });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
