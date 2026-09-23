/**
 * Portable backend acceptance tests. Run from the project root after npm run build:
 *   node tests/local.test.mjs
 * Uses only Node's built-ins, an isolated loopback server and a temporary SQLite DB.
 * Never connects to cloud services or modifies the normal application's data.
 */
import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const root = process.cwd();
const entry = resolve(root, "dist/server/server/index.js");
try {
  await access(entry);
} catch {
  throw new Error("Build the portable edition first with npm run build, then run this test from its project folder.");
}
const temporary = await mkdtemp(join(tmpdir(), "planitoday-local-test-"));
const dbPath = join(temporary, "acceptance.sqlite");
const reservation = http.createServer();
reservation.listen(0, "127.0.0.1");
await once(reservation, "listening");
const port = reservation.address().port;
await new Promise((resolveClose) => reservation.close(resolveClose));
const origin = `http://127.0.0.1:${port}`;
let child;
let output = "";
let checks = 0;
const delay = (milliseconds) => new Promise((done) => setTimeout(done, milliseconds));
const pass = (name) => {
  checks++;
  console.log("PASS " + name);
};

async function start() {
  child = spawn(process.execPath, [entry], {
    cwd: root,
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: String(port),
      DB_PATH: dbPath,
      NODE_ENV: "test",
      AI_PROVIDER: "preview",
      OLLAMA_MODEL: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const collect = (chunk) => { output = (output + String(chunk)).slice(-16000); };
  child.stdout.on("data", collect);
  child.stderr.on("data", collect);
  let startupError;
  child.on("error", (error) => { startupError = error; });
  for (let i = 0; i < 150; i++) {
    if (startupError) throw startupError;
    if (child.exitCode !== null) throw new Error(`Server exited during startup.\n${output}`);
    try {
      const response = await fetch(origin + "/api/health", { signal: AbortSignal.timeout(500) });
      if (response.ok) return;
    } catch { /* Wait for the isolated server to bind. */ }
    await delay(100);
  }
  throw new Error(`Server failed to become ready.\n${output}`);
}

async function stop() {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exit = once(child, "exit");
  child.kill("SIGTERM");
  const timer = setTimeout(() => child?.kill("SIGKILL"), 3000);
  try { await exit; } finally { clearTimeout(timer); }
}

async function request(path, body, cookie = "", extraHeaders = {}) {
  const response = await fetch(origin + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(cookie ? { Cookie: cookie } : {}),
      ...extraHeaders,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "manual",
    signal: AbortSignal.timeout(10000),
  });
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { data = null; }
  return { status: response.status, headers: response.headers, data, text };
}
async function good(path, body, cookie) {
  const result = await request(path, body, cookie);
  assert.equal(result.status, 200, `${path}: ${result.status} ${result.text}`);
  return result.data;
}
function session(result) {
  const setCookie = result.headers.getSetCookie().find((value) => value.startsWith("planitoday_session="));
  assert.ok(setCookie, "The server must issue planitoday_session");
  assert.match(setCookie, /;\s*HttpOnly\b/i);
  assert.match(setCookie, /;\s*SameSite=(Lax|Strict)\b/i);
  return setCookie.split(";")[0];
}
function rawGet(path) {
  return new Promise((resolveResponse, reject) => {
    const req = http.request({ hostname: "127.0.0.1", port, path, method: "GET" }, (res) => {
      const chunks = [];
      res.on("data", (data) => chunks.push(data));
      res.on("end", () => resolveResponse({ status: res.statusCode, headers: res.headers, text: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("error", reject);
    req.setTimeout(5000, () => req.destroy(new Error("Static file request timed out")));
    req.end();
  });
}

try {
  await start();
  assert.equal((await good("/api/health")).bookingMode, "demo");
  pass("Standalone backend starts with a new local database");

  const home = await request("/");
  assert.equal(home.status, 200);
  assert.match(home.headers.get("content-type") || "", /text\/html/);
  pass("Built frontend is served by the standalone backend");

  let anonymous = await good("/api/state");
  assert.equal(anonymous.user, null);
  assert.deepEqual(anonymous.trips, []);
  assert.equal((await request("/api/new-trip", {})).status, 401);
  pass("Anonymous users cannot read saved records or create trips");

  const spoof = await request("/api/state", undefined, "", {
    "oai-authenticated-user-id": "forged-id",
    "oai-authenticated-user-email": "forged@example.com",
  });
  assert.equal(spoof.status, 200);
  assert.equal(spoof.data.user, null);
  assert.equal((await request("/api/new-trip", {}, "", {
    "oai-authenticated-user-id": "forged-id",
    "oai-authenticated-user-email": "forged@example.com",
  })).status, 401);
  pass("Spoofed hosting-platform headers cannot authenticate");

  const alice = { name: "Alice Local", email: "alice.local@example.test", password: "portable-test-Passphrase-7381!" };
  const bob = { name: "Bob Local", email: "bob.local@example.test", password: "portable-test-Passphrase-8392!" };
  assert.equal((await request("/api/auth/register", alice, "", { Origin: "https://unrelated.example" })).status, 403);
  assert.equal((await request("/api/auth/login", alice, "", { Origin: "https://unrelated.example" })).status, 403);
  pass("Cross-origin registration and login are blocked");

  const invalid = await request("/api/auth/register", { name: "", email: "invalid", password: "x" });
  assert.ok([400, 401].includes(invalid.status), invalid.text);
  pass("Invalid account details are rejected");

  const registration = await request("/api/auth/register", alice, "", { Origin: origin });
  assert.equal(registration.status, 201, registration.text);
  let aliceCookie = session(registration);
  assert.equal((await good("/api/state", undefined, aliceCookie)).user.email, alice.email);
  pass("Local registration creates an HttpOnly same-site session");

  const duplicate = await request("/api/auth/register", alice);
  assert.ok([400, 409].includes(duplicate.status), duplicate.text);
  pass("A duplicate email cannot create a second account");

  const wrong = await request("/api/auth/login", { email: alice.email, password: "incorrect-password" });
  assert.ok([400, 401].includes(wrong.status), wrong.text);
  assert.ok(!wrong.headers.getSetCookie().some((value) => /^planitoday_session=[^;]/.test(value)));
  pass("Wrong passwords cannot create a session");

  const bobRegistration = await request("/api/auth/register", bob);
  assert.equal(bobRegistration.status, 201, bobRegistration.text);
  const bobCookie = session(bobRegistration);

  const date = (days) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
  const params = {
    category: "flights", from: "Mumbai", to: "Goa", start: date(30), end: date(34),
    travelers: 2, rooms: 1, cabin: "Economy", direction: "outbound", roundtrip: true,
  };
  const search = await good("/api/search", params);
  assert.ok(search.offers.length > 0);
  let trip = (await good("/api/new-trip", {}, aliceCookie)).trip;
  trip = (await good("/api/add", { tripId: trip.id, version: trip.version, offerId: search.offers[0].id, params, price: 1, total: 1 }, aliceCookie)).trip;
  assert.equal(trip.items[0].total, search.offers[0].total);
  pass("Standalone travel search and server-priced trip creation work");

  const bobState = await good("/api/state", undefined, bobCookie);
  assert.equal(bobState.trips.some((value) => value.id === trip.id), false);
  assert.deepEqual(bobState.orders, []);
  assert.equal((await request(`/api/export?tripId=${trip.id}`, undefined, bobCookie)).status, 404);
  assert.equal((await request(`/api/export?tripId=${trip.id}`)).status, 401);
  assert.equal((await request("/api/remove", { tripId: trip.id, version: trip.version, itemId: trip.items[0].itemId }, bobCookie)).status, 404);
  assert.equal((await request("/api/quote", { tripId: trip.id, version: trip.version }, bobCookie)).status, 404);
  assert.equal((await request("/api/recommend", { tripId: trip.id }, bobCookie)).status, 404);
  pass("A second account cannot view, export, modify or quote another user's trip");

  const exported = await request(`/api/export?tripId=${trip.id}`, undefined, aliceCookie);
  assert.equal(exported.status, 200);
  assert.match(exported.headers.get("content-type") || "", /text\/plain/);
  assert.match(exported.text, /PLANITODAY/);
  pass("Trip owners can download their itinerary locally");

  assert.equal((await request("/api/new-trip", {}, aliceCookie, { Origin: "https://unrelated.example" })).status, 403);
  assert.equal((await request("/api/auth/logout", {}, aliceCookie, { Origin: "https://unrelated.example" })).status, 403);
  assert.equal((await good("/api/state", undefined, aliceCookie)).user.email, alice.email);
  pass("Cross-origin writes and logout are rejected without changing the session");

  const large = await request("/api/new-trip", { ignored: "x".repeat(41000) }, aliceCookie);
  assert.equal(large.status, 413, large.text);
  const largeAuth = await request("/api/auth/login", { email: alice.email, password: "x".repeat(41000) });
  assert.equal(largeAuth.status, 413, largeAuth.text);
  pass("Travel and authentication endpoints reject bodies larger than 40 KB");

  const quote = (await good("/api/quote", { tripId: trip.id, version: trip.version }, aliceCookie)).quote;
  assert.ok(quote.expiresAt > Date.now() + 590000 && quote.expiresAt < Date.now() + 601000);
  const payment = { quoteId: quote.id, name: alice.name, email: alice.email, acknowledged: true };
  assert.equal((await request("/api/checkout", payment, bobCookie)).status, 404);
  const [first, second] = await Promise.all([
    good("/api/checkout", payment, aliceCookie), good("/api/checkout", payment, aliceCookie),
  ]);
  assert.equal(first.order.id, second.order.id);
  assert.equal((await good("/api/checkout", payment, aliceCookie)).order.id, first.order.id);
  pass("Checkout remains owner-scoped and duplicate requests create one demo order");

  let expiring = (await good("/api/new-trip", {}, aliceCookie)).trip;
  expiring = (await good("/api/add", { tripId: expiring.id, version: expiring.version, offerId: search.offers[0].id, params }, aliceCookie)).trip;
  const expiredQuote = (await good("/api/quote", { tripId: expiring.id, version: expiring.version }, aliceCookie)).quote;
  const database = new DatabaseSync(dbPath);
  try {
    database.prepare("UPDATE quotes SET expires_at = ? WHERE id = ?").run(Date.now() - 1000, expiredQuote.id);
    const expiredAttempts = await Promise.all(Array.from({ length: 6 }, () => request("/api/checkout", { ...payment, quoteId: expiredQuote.id }, aliceCookie)));
    for (const attempt of expiredAttempts) assert.equal(attempt.status, 410, attempt.text);
    assert.equal(database.prepare("SELECT COUNT(*) AS total FROM orders WHERE quote_id = ?").get(expiredQuote.id).total, 0);
    assert.equal(database.prepare("SELECT version FROM trips WHERE id = ?").get(expiring.id).version, expiring.version);
  } finally { database.close(); }
  pass("Expired quotes reject concurrent checkout without creating an order or changing the trip");

  for (const path of ["/.env", "/.dev.vars", "/package.json", "/server/index.ts", "/lib/database.ts", "/data/planitoday.sqlite", "/@fs/etc/passwd", "/..%2fpackage.json", "/%2e%2e/%2e%2e/package.json", "/%2e%2e%5cpackage.json"]) {
    const response = await rawGet(path);
    assert.ok([200, 400, 403, 404].includes(response.status), `${path}: ${response.status}`);
    if (response.status === 200) assert.match(String(response.headers["content-type"]), /text\/html/, `${path} must not serve a source or secret file`);
    assert.doesNotMatch(response.text, /SQLite format 3|root:[^\n]*:0:0:|"scripts"\s*:\s*\{|OPENAI_API_KEY\s*=|new DatabaseSync\s*\(/, `Sensitive static content at ${path}`);
  }
  pass("Static serving contains traversal paths and does not expose source, secrets or databases");

  await stop();
  await start();
  const restored = await good("/api/state", undefined, aliceCookie);
  assert.equal(restored.user.email, alice.email);
  assert.ok(restored.trips.some((value) => value.id === trip.id));
  assert.ok(restored.orders.some((value) => value.id === first.order.id));
  assert.equal((await good("/api/state", undefined, bobCookie)).trips.some((value) => value.id === trip.id), false);
  pass("Accounts, sessions, trips, orders and ownership survive a backend restart");

  const logout = await request("/api/auth/logout", {}, aliceCookie, { Origin: origin });
  assert.ok([200, 204].includes(logout.status), logout.text);
  assert.equal((await good("/api/state", undefined, aliceCookie)).user, null);
  assert.equal((await request("/api/new-trip", {}, aliceCookie)).status, 401);
  pass("Logout revokes the server-side session even if its old cookie is replayed");

  const login = await request("/api/auth/login", { email: alice.email, password: alice.password });
  assert.equal(login.status, 200, login.text);
  const freshCookie = session(login);
  assert.notEqual(freshCookie, aliceCookie);
  aliceCookie = freshCookie;
  assert.ok((await good("/api/state", undefined, aliceCookie)).trips.some((value) => value.id === trip.id));
  pass("Password login after restart restores the same account with a new session");

  console.log(`\n${checks} portable-backend acceptance checks passed.`);
} catch (error) {
  console.error("\nServer diagnostic output:\n" + output);
  throw error;
} finally {
  await stop();
  await rm(temporary, { recursive: true, force: true });
}
