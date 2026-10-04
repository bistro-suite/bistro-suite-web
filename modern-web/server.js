import http from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, resolve, sep } from "node:path";

const port = Number(process.env.PORT || 4173);
const root = resolve("dist");
const upstream = new URL(process.env.API_PROXY_TARGET || "http://127.0.0.1:8000");
const proxyPrefixes = ["/api", "/sanctum", "/storage"];
const contentTypes = {
  ".css": "text/css; charset=utf-8", ".html": "text/html; charset=utf-8", ".ico": "image/x-icon",
  ".jpeg": "image/jpeg", ".jpg": "image/jpeg", ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".png": "image/png", ".svg": "image/svg+xml", ".webp": "image/webp", ".woff2": "font/woff2", ".otf": "font/otf",
};

function proxyRequest(request, response) {
  const headers = { ...request.headers, "x-forwarded-host": request.headers.host || "", "x-forwarded-proto": request.headers["x-forwarded-proto"] || "https" };
  const proxy = http.request({ hostname: upstream.hostname, port: upstream.port || 80, method: request.method, path: request.url, headers }, (proxied) => {
    response.writeHead(proxied.statusCode || 502, proxied.headers);
    proxied.pipe(response);
  });
  proxy.on("error", () => {
    if (response.destroyed) return;
    if (!response.headersSent) response.writeHead(502, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ message: "El servicio de Bistro Suite no está disponible." }));
  });
  request.pipe(proxy);
}

function serveFile(request, response, filePath) {
  const stat = statSync(filePath);
  response.writeHead(200, {
    "content-length": stat.size,
    "content-type": contentTypes[extname(filePath).toLowerCase()] || "application/octet-stream",
    "x-content-type-options": "nosniff",
  });
  if (request.method === "HEAD") response.end();
  else createReadStream(filePath).pipe(response);
}

http.createServer((request, response) => {
  const url = new URL(request.url || "/", "http://localhost");
  if (proxyPrefixes.some((prefix) => url.pathname === prefix || url.pathname.startsWith(`${prefix}/`))) {
    proxyRequest(request, response);
    return;
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { allow: "GET, HEAD" }).end();
    return;
  }

  let pathname;
  try { pathname = decodeURIComponent(url.pathname); }
  catch { response.writeHead(400).end(); return; }

  const filePath = resolve(root, `.${pathname}`);
  if (filePath !== root && !filePath.startsWith(`${root}${sep}`)) {
    response.writeHead(400).end();
    return;
  }

  const candidate = existsSync(filePath) && statSync(filePath).isFile() ? filePath : null;
  if (candidate) {
    serveFile(request, response, candidate);
    return;
  }
  if (extname(pathname)) {
    response.writeHead(404).end();
    return;
  }
  serveFile(request, response, resolve(root, "index.html"));
}).listen(port, "0.0.0.0", () => process.stdout.write(`Bistro Suite web listening on ${port}\n`));
