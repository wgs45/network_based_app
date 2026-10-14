import http from "node:http";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";

// Determine Port from command line arguments or default to 8080
const args = process.argv.slice(2);
const PORT = args[0] ? parseInt(args[0], 10) : 8080;

// Define MIME type mapping dictionary
const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
};

const server = http.createServer(async (req, res) => {
  try {
    // Handle Supported Methods (GET & HEAD)
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("405 Method Not Allowed");
    }

    // Secure Path Resolution & Path Traversal Prevention
    const docRoot = process.cwd();
    // Parse URL pathname safely
    const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
    let safePath = path.normalize(parsedUrl.pathname);

    // Resolve absolute path relative to process.cwd()
    let filePath = path.join(docRoot, safePath);

    // Debug console.log
    console.log(
      `Requested URL: ${req.url} --> looking for file at: ${filePath}`,
    );

    // Ensure the resolved path stays within docRoot (Path Traversal defense)
    if (!filePath.startsWith(docRoot)) {
      res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("403 Forbidden");
    }

    // Check file/directory stats asynchronously
    let stats;
    try {
      stats = await fsPromises.stat(filePath);
    } catch (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("404 Not Found");
    }

    // Handle Directories (Default to index.html)
    if (stats.isDirectory()) {
      filePath = path.join(filePath, "index.html");
      try {
        stats = await fsPromises.stat(filePath);
      } catch (err) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        return res.end("404 Not Found");
      }
    }

    // Ensure it's a file before proceeding
    if (!stats.isFile()) {
      res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("403 Forbidden");
    }

    // HTTP Caching (304 Not Modified check)
    // Disregard millisecond precision by flooring to nearest second
    const fileMtimeUTC = new Date(
      Math.floor(stats.mtime.getTime() / 1000) * 1000,
    ).toUTCString();
    const ifModifiedSince = req.headers["if-modified-since"];

    if (ifModifiedSince) {
      const clientTime = new Date(ifModifiedSince);
      // Compare timestamps without milliseconds
      if (
        Math.floor(clientTime.getTime() / 1000) ===
        Math.floor(stats.mtime.getTime() / 1000)
      ) {
        res.writeHead(304, {
          "Last-Modified": fileMtimeUTC,
        });
        return res.end();
      }
    }

    // MIME Type & Content-Length resolution
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

    const headers = {
      "Content-Type": contentType,
      "Content-Length": stats.size,
      "Last-Modified": fileMtimeUTC,
      "Cache-Control": "public, max-age=0", // Cachign directive
    };

    res.writeHead(200, headers);
    if (req.method == "HEAD") {
      return res.end();
    }

    // Using pipeline to securely stream and auto-destroy handles on disconnect
    await pipeline(fs.createReadStream(filePath), res);
  } catch (err) {
    if (!res.headersSent) {
      // If headers haven't been sent, reply with 500. Otherwise, tear down socket
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("500 Internal Server Error");
    } else {
      res.destroy();
    }
  }
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}/`);
});
