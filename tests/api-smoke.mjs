import assert from "node:assert/strict";
import {
  defaultSearch,
  defaultProfile,
  searchSchema,
  profileSchema,
  offersFor,
  recommendations,
} from "../lib/travel.ts";
const origin = process.env.TEST_ORIGIN || "http://127.0.0.1:5173";
if (!["localhost", "127.0.0.1"].includes(new URL(origin).hostname))
  throw new Error("This test only runs against a local development server.");
let checks = 0;
const pass = (name) => {
  checks++;
  console.log("PASS " + name);
};
const sign = await fetch(origin + "/api/auth/register", {
  method: "POST", headers: { "Content-Type": "application/json", Origin: origin },
  body: JSON.stringify({ name: "Acceptance Test", email: `smoke-${crypto.randomUUID()}@example.test`, password: "Local-test-password-2026" }),
});
assert.equal(sign.status, 201, (await sign.clone().text()).slice(0, 500));
const cookie = sign.headers.getSetCookie().map(s => s.split(";")[0]).join("; ");
assert.ok(cookie, "Local account session required");
async function request(action, body, auth = true) {
  const r = await fetch(origin + "/api/" + action, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
      ...(auth ? { Cookie: cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, data: await r.json() };
}
async function good(action, body) {
  const r = await request(action, body);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.data;
}
const p = { ...defaultSearch };
assert.equal(
  searchSchema.safeParse({ ...p, cabin: "AC chair car" }).success,
  false,
);
pass("Flight cabin validation");
assert.equal(
  profileSchema.safeParse({ ...defaultProfile, children: 1, childAges: "" })
    .success,
  false,
);
pass("Child age is required");
assert.equal(
  profileSchema.safeParse({ ...defaultProfile, children: 1, childAges: "0" })
    .success,
  true,
);
pass("Age zero remains valid");
assert.equal(
  recommendations({ ...defaultProfile, transport: "Public transport" }).some(
    (o) => o.category === "cabs",
  ),
  false,
);
pass("Public transport avoids private cab recommendation");
assert.equal(
  recommendations({ ...defaultProfile, stay: "Apartment" }).some(
    (o) => o.category === "hotels",
  ),
  false,
);
pass("No misleading apartment substitution");
assert.equal((await request("new-trip", {}, false)).status, 401);
pass("Anonymous writes blocked");
for (const category of [
  "flights",
  "hotels",
  "trains",
  "buses",
  "packages",
  "cabs",
]) {
  const r = await good("search", { ...p, category });
  assert.ok(r.offers.length);
  pass(category + " search");
}
const fresh = await good("new-trip", {});
let t = fresh.trip;
let r = await good("add", {
  tripId: t.id,
  version: t.version,
  offerId: "flights-0",
  params: p,
  total: 1,
  price: 1,
});
t = r.trip;
assert.equal(t.items[0].total, 850000);
pass("Client price tampering ignored");
const q1 = (await good("quote", { tripId: t.id, version: t.version })).quote;
assert.ok(
  q1.expiresAt > Date.now() + 590000 && q1.expiresAt <= Date.now() + 600100,
);
pass("Quote expiry issued by server");
r = await good("add", {
  tripId: t.id,
  version: t.version,
  offerId: "flights-0",
  params: { ...p, direction: "return" },
});
t = r.trip;
assert.equal(
  (
    await request("checkout", {
      quoteId: q1.id,
      name: "Test Traveller",
      email: "test@example.com",
      acknowledged: true,
    })
  ).status,
  409,
);
pass("Stale quote rejected after trip mutation");
r = await good("add", {
  tripId: t.id,
  version: t.version,
  offerId: "hotels-0",
  params: { ...p, category: "hotels" },
});
t = r.trip;
assert.equal(t.items.length, 3);
pass("Outbound + return + hotel share one trip");
const dedup = await good("add", {
  tripId: t.id,
  version: t.version,
  offerId: "hotels-0",
  params: { ...p, category: "hotels" },
});
assert.equal(dedup.trip.items.length, 3);
pass("Repeated add does not duplicate item");
const quote = (await good("quote", { tripId: t.id, version: t.version })).quote;
assert.equal(quote.total, Math.round(quote.subtotal * 1.02));
pass("Unified total includes explicit fee");
const payment = {
  quoteId: quote.id,
  name: "Test Traveller",
  email: "test@example.com",
  acknowledged: true,
};
const [one, two] = await Promise.all([
  good("checkout", payment),
  good("checkout", payment),
]);
assert.equal(one.order.id, two.order.id);
pass("Concurrent duplicate payments return one order");
const replay = await good("checkout", payment);
assert.equal(replay.order.id, one.order.id);
pass("Checkout replay is idempotent");
assert.equal(
  (
    await request("add", {
      tripId: t.id,
      version: t.version,
      offerId: "cabs-0",
      params: { ...p, category: "cabs" },
    })
  ).status,
  409,
);
pass("Completed orders prevent booking-item mutation");
assert.equal(
  (
    await request("remove", {
      tripId: crypto.randomUUID(),
      itemId: crypto.randomUUID(),
      version: 0,
    })
  ).status,
  404,
);
pass("Unknown or unowned trip fails closed");
let hotel = (await good("new-trip", {})).trip;
hotel = (
  await good("add", {
    tripId: hotel.id,
    version: hotel.version,
    offerId: "hotels-2",
    params: { ...p, category: "hotels", travelers: 3 },
  })
).trip;
assert.equal(hotel.items[0].quantity, 8);
pass("Hotel room-nights account for party size");
const hq = (await good("quote", { tripId: hotel.id, version: hotel.version }))
  .quote;
const ho = await good("checkout", { ...payment, quoteId: hq.id });
assert.equal(ho.order.items.length, 1);
pass("Hotel-only checkout succeeds");
let plan = (await good("plan", { profile: defaultProfile })).trip;
assert.equal(plan.itinerary.days.length, 5);
pass("Detailed profile produces five-day itinerary");
const before = structuredClone(plan.itinerary.days);
r = await good("chat", {
  tripId: plan.id,
  version: plan.version,
  message: "Make it more relaxed",
  day: 2,
  activityIndex: 0,
});
plan = r.trip;
assert.deepEqual(plan.itinerary.days[0], before[0]);
assert.deepEqual(plan.itinerary.days[2], before[2]);
assert.equal(
  plan.itinerary.days[1].activities[1].id,
  before[1].activities[1].id,
);
assert.notEqual(
  plan.itinerary.days[1].activities[0].title,
  before[1].activities[0].title,
);
pass("Chat replaces only the selected activity");
assert.ok(plan.messages.length === 3);
pass("Conversation persists on the server");
const persisted = await good("state");
assert.equal(persisted.trips.find((x) => x.id === plan.id).messages.length, 3);
pass("Reload recovers saved profile and conversation");
for (const d of plan.itinerary.days) {
  for (let i = 1; i < d.activities.length; i++) {
    const minute = (s) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
    assert.ok(
      minute(d.activities[i].time) - minute(d.activities[i - 1].time) >= 135,
    );
  }
}
pass("Activities have duration and transit buffers");
const late = (
  await good("plan", {
    profile: {
      ...defaultProfile,
      arrivalTime: "22:00",
      departureTime: "08:00",
    },
  })
).trip;
assert.equal(late.itinerary.days[0].activities.length, 0);
assert.equal(late.itinerary.days.at(-1).activities.length, 0);
pass("Late arrival and early departure keep travel days free");
console.log("\n" + checks + " acceptance checks passed. Expiry is covered by npm run test:local.");
