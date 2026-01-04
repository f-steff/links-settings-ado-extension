const fs = require("fs");
const https = require("https");
const path = require("path");
const url = require("url");

const rootDir = path.join(__dirname, "..");
const distDir = path.join(rootDir, "dist");
const certDir = path.join(rootDir, "certs");
const keyPath = path.join(certDir, "localhost.key");
const certPath = path.join(certDir, "localhost.crt");

if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
  console.error("Missing HTTPS certs.");
  console.error("Create certs/localhost.key and certs/localhost.crt first.");
  process.exit(1);
}

const server = https.createServer(
  {
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath)
  },
  (req, res) => {
    const parsed = url.parse(req.url || "/");
    const requestedPath = decodeURIComponent(parsed.pathname || "/");
    const safePath = requestedPath.replace(/^\//, "");
    const filePath = path.join(distDir, safePath);
    const resolved = path.resolve(filePath);

    if (!resolved.startsWith(distDir)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    const finalPath = fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()
      ? path.join(resolved, "index.html")
      : resolved;

    if (!fs.existsSync(finalPath)) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    const ext = path.extname(finalPath).toLowerCase();
    const contentType = getContentType(ext);
    res.writeHead(200, { "Content-Type": contentType });
    fs.createReadStream(finalPath).pipe(res);
  }
);

server.listen(44405, () => {
  console.log("Serving dist/ over https://localhost:44405/");
});

function getContentType(ext) {
  switch (ext) {
    case ".html":
      return "text/html";
    case ".css":
      return "text/css";
    case ".js":
      return "application/javascript";
    case ".map":
      return "application/json";
    case ".png":
      return "image/png";
    default:
      return "application/octet-stream";
  }
}
