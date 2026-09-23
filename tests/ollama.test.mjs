/**
 * Ollama adapter contract checks, using a local fake HTTP response server.
 * Run from the portable project root after npm run build:
 *   node tests/ollama.test.mjs
 * These tests validate protocol and response validation, NOT real model inference.
 * They download no models and make no external requests.
 */
import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { access } from "node:fs/promises";

const plannerPath = resolve("dist/server/lib/planner.js");
const travelPath = resolve("dist/server/lib/travel.js");
try {
  await Promise.all([access(plannerPath), access(travelPath)]);
} catch {
  throw new Error("Build the portable edition first with npm run build, then run this test from its project folder.");
}
const [{ generatePlan, aiConfigured }, { defaultProfile }] = await Promise.all([
  import(pathToFileURL(plannerPath).href),
  import(pathToFileURL(travelPath).href),
]);
const environmentKeys = ["AI_PROVIDER", "OLLAMA_MODEL", "OLLAMA_BASE_URL"];
const savedEnvironment = new Map(environmentKeys.map((key) => [key, process.env[key]]));
let mode = "valid";
let checks = 0;
let requests = 0;
let redirectTargets = 0;
let lastContext;
let lastPayload;
const serverErrors = [];
const pass = (name) => {
  checks++;
  console.log("PASS " + name);
};
const profile = structuredClone(defaultProfile);

function validPlan(context) {
  assert.ok(context.places.length >= context.days.length);
  return {
    summary: "Local adapter contract fixture: curated activities selected for this traveller.",
    days: context.days.map((day, index) => ({
      day: day.day,
      title: "Local model day " + day.day,
      activityIds: [context.places[index].id],
    })),
  };
}

const server = http.createServer(async (request, response) => {
  try {
    if (request.url === "/redirect-target") {
      redirectTargets++;
      response.writeHead(500, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: "A redirect must never be followed." }));
      return;
    }
    requests++;
    assert.equal(request.method, "POST");
    assert.equal(request.url, "/api/chat");
    assert.match(request.headers["content-type"] || "", /application\/json/);
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    lastPayload = payload;
    assert.equal(payload.model, "planitoday-contract-fixture");
    assert.equal(payload.stream, false);
    assert.equal(payload.format.type, "object");
    assert.equal(payload.format.properties.days.type, "array");
    assert.deepEqual(payload.format.required, ["summary", "days"]);
    assert.equal(payload.messages.length, 2);
    assert.equal(payload.messages[0].role, "system");
    assert.equal(payload.messages[1].role, "user");
    const context = JSON.parse(payload.messages[1].content);
    lastContext = context;
    assert.deepEqual(context.profile, profile);
    assert.ok(Array.isArray(context.days) && context.days.length > 1);
    assert.ok(Array.isArray(context.places) && context.places.length > 0);

    if (mode === "redirect") {
      response.writeHead(302, { Location: "/redirect-target" });
      response.end();
      return;
    }
    if (mode === "unavailable") {
      response.writeHead(503, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: "The fake local model is unavailable." }));
      return;
    }

    const plan = validPlan(context);
    if (mode === "unknown-activity") plan.days[0].activityIds = ["not-in-the-curated-catalog"];
    if (mode === "duplicate-activity") plan.days[0].activityIds.push(plan.days[0].activityIds[0]);
    if (mode === "missing-day") plan.days.pop();
    if (mode === "wrong-schema") plan.days[0].activityIds = "not-an-array";

    const envelope = {
      done: mode !== "incomplete-envelope",
      message: {
        role: "assistant",
        content: mode === "malformed-json" ? "This is not JSON." : JSON.stringify(plan),
      },
    };
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify(envelope));
  } catch (error) {
    serverErrors.push(error);
    response.writeHead(500, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: "The adapter did not match its HTTP contract." }));
  }
});

try {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const localBase = `http://127.0.0.1:${server.address().port}`;
  process.env.AI_PROVIDER = "ollama";
  process.env.OLLAMA_MODEL = "planitoday-contract-fixture";
  process.env.OLLAMA_BASE_URL = localBase;
  assert.equal(aiConfigured(), true);

  const generated = await generatePlan(profile);
  assert.equal(serverErrors.length, 0, serverErrors[0]?.stack);
  assert.equal(generated.mode, "ai");
  assert.equal(generated.summary, validPlan(lastContext).summary);
  assert.equal(generated.days.length, lastContext.days.length);
  for (const [index, day] of generated.days.entries()) {
    assert.equal(day.day, lastContext.days[index].day);
    assert.equal(day.title, "Local model day " + day.day);
    assert.equal(day.activities.length, 1);
    assert.equal(day.activities[0].title, lastContext.places[index].title);
    assert.equal(day.activities[0].area, lastContext.places[index].area);
    assert.match(day.activities[0].time, /^\d{2}:\d{2}$/);
    assert.equal(typeof day.activities[0].cost, "number");
  }
  assert.equal(lastPayload.options.temperature, 0);
  pass("Schema-valid Ollama response becomes a plan using server-owned activity details");

  for (const [responseMode, description] of [
    ["malformed-json", "Malformed model JSON is rejected"],
    ["wrong-schema", "Valid JSON with an invalid schema is rejected"],
    ["unknown-activity", "Unknown activity IDs cannot enter an itinerary"],
    ["duplicate-activity", "Duplicate activities within a day are rejected"],
    ["missing-day", "Incomplete itinerary days are rejected"],
    ["incomplete-envelope", "An unfinished Ollama response is rejected"],
    ["unavailable", "A failed Ollama HTTP response is surfaced as a failure"],
  ]) {
    mode = responseMode;
    const before = requests;
    await assert.rejects(() => generatePlan(profile));
    assert.equal(requests, before + 1, "Each case must reach the local adapter server exactly once");
    assert.equal(serverErrors.length, 0, serverErrors[0]?.stack);
    pass(description);
  }

  mode = "redirect";
  const beforeRedirect = requests;
  await assert.rejects(() => generatePlan(profile));
  assert.equal(requests, beforeRedirect + 1);
  assert.equal(redirectTargets, 0);
  pass("HTTP redirects are rejected without following the destination");

  mode = "valid";
  const beforeInvalidAddresses = requests;
  for (const base of ["http://example.invalid:11434", "https://127.0.0.1:11434", "http://127.0.0.1.example.invalid:11434"]) {
    process.env.OLLAMA_BASE_URL = base;
    await assert.rejects(() => generatePlan(profile), /loopback address/);
  }
  assert.equal(requests, beforeInvalidAddresses);
  pass("Remote hosts and non-HTTP connections are rejected before any AI request");

  process.env.OLLAMA_BASE_URL = localBase;
  process.env.AI_PROVIDER = "preview";
  const beforePreview = requests;
  const preview = await generatePlan(profile);
  assert.equal(aiConfigured(), false);
  assert.equal(preview.mode, "preview");
  assert.equal(requests, beforePreview);
  pass("Preview planning does not contact the local model server");

  assert.equal(serverErrors.length, 0, serverErrors[0]?.stack);
  console.log(`\n${checks} Ollama adapter contract checks passed with mocked local responses.`);
  console.log("These checks do not validate a real model's inference quality or availability.");
} finally {
  for (const [key, value] of savedEnvironment) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  server.closeAllConnections();
  if (server.listening) await new Promise((done, reject) => server.close((error) => error ? reject(error) : done()));
}
