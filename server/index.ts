import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile, stat, realpath } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { z } from "zod";
import { GET, POST } from "./api.js";
import { authenticate, requestContext } from "./auth.js";
import { closeDatabase, HttpError } from "../lib/database.js";

const port = Number(process.env.PORT || 3001);
const host = process.env.HOST || "127.0.0.1";
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT must be 1–65535.");
const origins = new Set([`http://localhost:${port}`, `http://127.0.0.1:${port}`]);
if (process.env.APP_ORIGIN) origins.add(new URL(process.env.APP_ORIGIN).origin);
if (process.env.NODE_ENV === "development") {
  const uiPort = process.env.DEV_UI_PORT || "5173";
  origins.add(`http://localhost:${uiPort}`); origins.add(`http://127.0.0.1:${uiPort}`);
}
const allowedHosts = new Set([...origins].map(value => new URL(value).host));
const publicRoot = resolve("dist/client");
const mime: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".woff2": "font/woff2", ".ico": "image/x-icon" };
async function bodyOf(req: IncomingMessage): Promise<string> {
  return new Promise((resolveBody, reject) => {
    let size = 0; const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > 40000) { reject(new HttpError(413, "The request is too large.")); return; }
      chunks.push(chunk);
    });
    req.on("end", () => resolveBody(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}
async function send(res: ServerResponse, response: Response, head = false) {
  res.statusCode = response.status;
  response.headers.forEach((v, k) => res.setHeader(k, v));
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "same-origin");
  res.end(head ? undefined : Buffer.from(await response.arrayBuffer()));
}
async function staticFile(pathname: string): Promise<Response> {
  let path: string;
  try { path = decodeURIComponent(pathname); } catch { throw new HttpError(400, "Invalid URL."); }
  if (path.includes("\\") || path.includes("\0") || path.split("/").some(part => part.startsWith(".")))
    throw new HttpError(404, "Not found.");
  const file = resolve(publicRoot, "." + (path === "/" ? "/index.html" : path));
  if (!file.startsWith(publicRoot + sep)) throw new HttpError(404, "Not found.");
  try {
    const root = await realpath(publicRoot);
    const actual = await realpath(file);
    if (!actual.startsWith(root + sep) || !(await stat(actual)).isFile()) throw new HttpError(404, "Not found.");
    const content = await readFile(actual);
    return new Response(new Uint8Array(content), { headers: { "Content-Type": mime[extname(file)] || "application/octet-stream", "Cache-Control": extname(file) === ".html" ? "no-cache" : "public, max-age=3600" } });
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(404, path === "/" ? "Build the website first with npm run build, or use npm run dev." : "Not found.");
  }
}
const server = createServer(async (incoming, outgoing) => {
  try {
    if (!allowedHosts.has(incoming.headers.host || "")) throw new HttpError(403, "Unrecognized host.");
    const scheme = process.env.APP_ORIGIN && new URL(process.env.APP_ORIGIN).host === incoming.headers.host ? new URL(process.env.APP_ORIGIN).protocol : "http:";
    const url = new URL(incoming.url || "/", `${scheme}//${incoming.headers.host}`);
    const method = incoming.method || "GET";
    if (url.pathname.startsWith("/api/")) {
      if (method !== "GET" && method !== "POST") throw new HttpError(405, "Method not allowed.");
      if (method === "POST") {
        if (incoming.headers.origin && incoming.headers.origin !== url.origin) throw new HttpError(403, "This request must come from the website.");
        if (incoming.headers["sec-fetch-site"] === "cross-site") throw new HttpError(403, "This request must come from the website.");
        if (!incoming.headers["content-type"]?.includes("application/json")) throw new HttpError(415, "Use JSON for this request.");
      }
      const headers = new Headers();
      for (const [key, value] of Object.entries(incoming.headers)) if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(", ") : value);
      const request = new Request(url, { method, headers, ...(method === "POST" ? { body: await bodyOf(incoming) } : {}) });
      const response = await requestContext.run(request, async () => {
        const auth = /^\/api\/auth\/(register|login|logout)$/.exec(url.pathname);
        if (auth) {
          if (method !== "POST") throw new HttpError(405, "Method not allowed.");
          return authenticate(auth[1], request, incoming.socket.remoteAddress || "local");
        }
        const match = /^\/api\/([a-z-]+)$/.exec(url.pathname);
        if (!match) throw new HttpError(404, "Not found.");
        const ctx = { params: Promise.resolve({ action: match[1] }) };
        return method === "GET" ? GET(request, ctx) : POST(request, ctx);
      });
      await send(outgoing, response);
    } else {
      if (method !== "GET" && method !== "HEAD") throw new HttpError(405, "Method not allowed.");
      await send(outgoing, await staticFile(url.pathname), method === "HEAD");
    }
  } catch (error) {
    const status = error instanceof HttpError ? error.status : error instanceof z.ZodError ? 400 : 500;
    const message = error instanceof HttpError ? error.message : error instanceof z.ZodError ? error.issues.map(i => i.message).join(". ") : "The request could not be completed.";
    if (status === 500) console.error("Request failed:", error instanceof Error ? error.message : "unknown");
    if (!outgoing.headersSent) await send(outgoing, Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } }));
  }
});
server.requestTimeout = 30000;
server.on("error", error => { console.error(error.message); process.exitCode = 1; closeDatabase(); });
server.listen(port, host, () => console.log(`Planitoday backend and built website: http://${host}:${port}`));
let stopping = false;
function stop() {
  if (stopping) return; stopping = true;
  server.close(() => { closeDatabase(); process.exit(0); });
  setTimeout(() => { server.closeAllConnections(); }, 2000).unref();
}
process.on("SIGINT", stop); process.on("SIGTERM", stop);
