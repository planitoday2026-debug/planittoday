import { z } from "zod";
import { getUser } from "./auth.js";
import { db, HttpError } from "../lib/database.js";
import {
  searchSchema,
  profileSchema,
  offersFor,
  recommendations,
  type Trip,
  type Item,
  type Quote,
  type Order,
} from "../lib/travel.js";
import { generatePlan, revisePlan, aiConfigured } from "../lib/planner.js";
type Row = {
  id: string;
  owner: string;
  version: number;
  data: string;
  booked?: number;
};
const idSchema = z.string().uuid();
function send(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
async function owner() {
  const u = await getUser();
  if (!u) throw new HttpError(401, "Sign in to save your trip and continue.");
  return u;
}
async function loadTrip(id: string, user: string): Promise<Trip> {
  idSchema.parse(id);
  const row = await db()
    .prepare(
      "SELECT t.*, EXISTS(SELECT 1 FROM orders o WHERE o.trip_id = t.id) AS booked FROM trips t WHERE t.id = ? AND t.owner = ?",
    )
    .bind(id, user)
    .first<Row>();
  if (!row) throw new HttpError(404, "This trip was not found.");
  return {
    ...JSON.parse(row.data),
    id: row.id,
    version: row.version,
    status: row.booked ? "demo_confirmed" : "draft",
  };
}
async function saveTrip(t: Trip, user: string, expected: number) {
  const result = await db()
    .prepare(
      "UPDATE trips SET data = ?, version = version + 1, updated_at = ? WHERE id = ? AND owner = ? AND version = ? AND NOT EXISTS (SELECT 1 FROM orders WHERE trip_id = ?)",
    )
    .bind(JSON.stringify(t), Date.now(), t.id, user, expected, t.id)
    .run();
  if (result.meta.changes !== 1)
    throw new HttpError(
      409,
      "Your trip changed in another tab or was checked out. Refresh your trip and try again.",
    );
  t.version = expected + 1;
  return t;
}
async function newTrip(user: string, title = "My next escape"): Promise<Trip> {
  const t: Trip = {
    id: crypto.randomUUID(),
    version: 0,
    title,
    items: [],
    profile: null,
    itinerary: null,
    messages: [],
    status: "draft",
    createdAt: Date.now(),
  };
  await db()
    .prepare(
      "INSERT INTO trips (id, owner, version, data, created_at, updated_at) VALUES (?, ?, 0, ?, ?, ?)",
    )
    .bind(t.id, user, JSON.stringify(t), t.createdAt, t.createdAt)
    .run();
  return t;
}
async function editable(id: string | undefined, user: string) {
  const t = id ? await loadTrip(id, user) : await newTrip(user);
  if (t.status !== "draft")
    throw new HttpError(
      409,
      "This trip has a completed demo order. Start a new trip to book more.",
    );
  return t;
}
async function rate(user: string, bucket: string, limit: number) {
  const key = user + ":" + bucket + ":" + new Date().toISOString().slice(0, 10);
  const row = await db()
    .prepare(
      "INSERT INTO usage (key, count) VALUES (?, 1) ON CONFLICT(key) DO UPDATE SET count = count + 1 WHERE count < ? RETURNING count",
    )
    .bind(key, limit)
    .first();
  if (!row)
    throw new HttpError(
      429,
      "You’ve reached today's preview limit. Please try again tomorrow.",
    );
}
function failure(e: unknown) {
  if (e instanceof z.ZodError)
    return send({ error: e.issues.map((x) => x.message).join(". ") }, 400);
  if (e instanceof HttpError) return send({ error: e.message }, e.status);
  console.error("Trip request failed", e instanceof Error ? e.name : "unknown");
  return send(
    {
      error:
        "We couldn't finish that request. Your saved trip is safe. Please try again.",
    },
    503,
  );
}
export async function GET(
  req: Request,
  ctx: { params: Promise<{ action: string }> },
) {
  try {
    const { action } = await ctx.params;
    if (action === "health")
      return send({
        ok: true,
        edition: "standalone-local",
        bookingMode: "demo",
        plannerMode: aiConfigured() ? "ai" : "preview",
      });
    if (action === "state") {
      const user = await getUser();
      if (!user)
        return send({
          user: null,
          trips: [],
          orders: [],
          plannerMode: aiConfigured() ? "ai" : "preview",
        });
      const rows = await db()
        .prepare(
          "SELECT t.*, EXISTS(SELECT 1 FROM orders o WHERE o.trip_id = t.id) AS booked FROM trips t WHERE owner = ? ORDER BY updated_at DESC LIMIT 50",
        )
        .bind(user.userId)
        .all<Row>();
      const orders = await db()
        .prepare(
          "SELECT data FROM orders WHERE owner = ? ORDER BY created_at DESC LIMIT 50",
        )
        .bind(user.userId)
        .all<{ data: string }>();
      return send({
        user: { name: user.displayName, email: user.email },
        trips: rows.results.map((r) => ({
          ...JSON.parse(r.data),
          id: r.id,
          version: r.version,
          status: r.booked ? "demo_confirmed" : "draft",
        })),
        orders: orders.results.map((r) => JSON.parse(r.data)),
        plannerMode: aiConfigured() ? "ai" : "preview",
      });
    }
    if (action === "export") {
      const u = await owner(),
        t = await loadTrip(
          new URL(req.url).searchParams.get("tripId") || "",
          u.userId,
        );
      const lines = [
        "PLANITODAY — " + t.title,
        "Status: " + t.status,
        "Exported: " + new Date().toISOString(),
        "Demo only: no real tickets, reservations or charges.",
        "",
        ...(t.itinerary
          ? [
              t.itinerary.summary,
              "",
              ...t.itinerary.days.flatMap((d) => [
                "DAY " + d.day + " · " + d.date + " · " + d.title,
                ...d.activities.map(
                  (a) => a.time + " — " + a.title + "\n" + a.description,
                ),
                "",
              ]),
              ...t.itinerary.notices,
              "Source: " + t.itinerary.source,
            ]
          : []),
        "TRIP ITEMS",
        ...t.items.map(
          (i) =>
            i.name +
            " · " +
            i.subtitle +
            " · INR " +
            (i.total / 100).toFixed(2),
        ),
      ];
      return new Response(lines.join("\n"), {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Content-Disposition":
            'attachment; filename="planitoday-itinerary.txt"',
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
    return send({ error: "Not found" }, 404);
  } catch (e) {
    return failure(e);
  }
}
export async function POST(
  req: Request,
  ctx: { params: Promise<{ action: string }> },
) {
  try {
    const origin = req.headers.get("origin");
    if (origin && origin !== new URL(req.url).origin)
      throw new HttpError(403, "This request must come from the website.");
    if (!req.headers.get("content-type")?.includes("application/json"))
      throw new HttpError(415, "Use JSON for this request.");
    const text = await req.text();
    if (text.length > 40000)
      throw new HttpError(413, "The request is too large.");
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      throw new HttpError(400, "Invalid request.");
    }
    const { action } = await ctx.params;
    if (action === "search") {
      const p = searchSchema.parse(body);
      return send({ offers: offersFor(p), mode: "demo" });
    }
    const u = await owner(),
      user = u.userId;
    await rate(user, "requests", 1000);
    if (action === "new-trip") return send({ trip: await newTrip(user) });
    if (action === "add") {
      const b = z
        .object({
          tripId: idSchema.optional(),
          offerId: z.string().max(30),
          params: searchSchema,
          version: z.number().int().optional(),
        })
        .parse(body);
      const o = offersFor(b.params).find((x) => x.id === b.offerId);
      if (!o) throw new HttpError(400, "This offer is unavailable.");
      const t = await editable(b.tripId, user);
      if (b.version !== undefined && b.version !== t.version)
        throw new HttpError(409, "Your trip changed. Refresh and try again.");
      if (t.items.length >= 20)
        throw new HttpError(400, "A trip can contain up to 20 items.");
      const same = t.items.find(
        (i) =>
          i.id === o.id &&
          JSON.stringify(i.params) === JSON.stringify(o.params),
      );
      if (same) return send({ trip: t });
      const item: Item = { ...o, itemId: crypto.randomUUID() };
      t.items.push(item);
      if (t.items.length === 1 && !t.profile) t.title = b.params.to + " escape";
      return send({ trip: await saveTrip(t, user, t.version) });
    }
    if (action === "remove") {
      const b = z
          .object({
            tripId: idSchema,
            itemId: idSchema,
            version: z.number().int(),
          })
          .parse(body),
        t = await editable(b.tripId, user);
      t.items = t.items.filter((i) => i.itemId !== b.itemId);
      return send({ trip: await saveTrip(t, user, b.version) });
    }
    if (action === "plan") {
      const b = z
        .object({
          tripId: idSchema.optional(),
          version: z.number().int().optional(),
          profile: profileSchema,
        })
        .parse(body);
      await rate(user, "plans", 30);
      const t = await editable(b.tripId, user);
      if (b.tripId && b.version !== t.version)
        throw new HttpError(
          409,
          "Your trip changed. Refresh before regenerating it.",
        );
      if (t.items.length)
        throw new HttpError(
          409,
          "Start a new trip before changing the travel profile of a trip with items.",
        );
      const itinerary = await generatePlan(b.profile);
      t.profile = b.profile;
      t.itinerary = itinerary;
      t.title = b.profile.destination + " · Your personal escape";
      t.messages = [
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: aiConfigured()
            ? "Your itinerary is ready. Select a day and an activity, then tell me what you’d like to change."
            : "Your preview itinerary is ready. Select a day and an activity to try a change. The full AI conversation becomes available when an AI provider is connected.",
        },
      ];
      return send({
        trip: await saveTrip(t, user, t.version),
        recommendations: recommendations(b.profile),
      });
    }
    if (action === "recommend") {
      const b = z.object({ tripId: idSchema }).parse(body),
        t = await loadTrip(b.tripId, user);
      if (!t.profile) throw new HttpError(400, "Build an itinerary first.");
      return send({ offers: recommendations(t.profile) });
    }
    if (action === "chat") {
      const b = z
        .object({
          tripId: idSchema,
          message: z.string().trim().min(1).max(1500),
          day: z.number().int().min(1).max(14),
          activityIndex: z.number().int().min(0).max(3),
          version: z.number().int(),
        })
        .parse(body);
      await rate(user, "chat", 100);
      const t = await loadTrip(b.tripId, user);
      if (!t.profile || !t.itinerary)
        throw new HttpError(400, "Create an itinerary first.");
      if (t.version !== b.version)
        throw new HttpError(
          409,
          "Your plan changed. Reload it before making another edit.",
        );
      const result = await revisePlan(
        t.profile,
        t.itinerary,
        b.message,
        b.day,
        b.activityIndex,
        t.messages,
      );
      t.itinerary = result.itinerary;
      t.messages = [
        ...t.messages,
        { id: crypto.randomUUID(), role: "user" as const, text: b.message },
        {
          id: crypto.randomUUID(),
          role: "assistant" as const,
          text: result.reply,
        },
      ].slice(-60);
      const saved = await db()
        .prepare(
          "UPDATE trips SET data = ?, version = version + 1, updated_at = ? WHERE id = ? AND owner = ? AND version = ?",
        )
        .bind(JSON.stringify(t), Date.now(), t.id, user, b.version)
        .run();
      if (saved.meta.changes !== 1)
        throw new HttpError(
          409,
          "Your plan changed. Refresh to see the latest version.",
        );
      t.version++;
      return send({ trip: t, changed: result.changed });
    }
    if (action === "quote") {
      const b = z
          .object({ tripId: idSchema, version: z.number().int() })
          .parse(body),
        t = await editable(b.tripId, user);
      if (t.version !== b.version)
        throw new HttpError(
          409,
          "Your trip changed. Review it before checkout.",
        );
      if (!t.items.length)
        throw new HttpError(400, "Add at least one item to your trip.");
      const items = t.items.map((i) => {
        const offer = offersFor(searchSchema.parse(i.params)).find(
          (o) => o.id === i.id,
        );
        if (!offer)
          throw new HttpError(
            409,
            "An item is no longer available. Remove it to continue.",
          );
        return { ...offer, itemId: i.itemId };
      });
      const subtotal = items.reduce((s, i) => s + i.total, 0),
        fee = Math.round(subtotal * 0.02);
      const q: Quote = {
        id: crypto.randomUUID(),
        tripId: t.id,
        expiresAt: Date.now() + 600000,
        subtotal,
        fee,
        total: subtotal + fee,
        items,
        status: "open",
      };
      const saved = await db()
        .prepare(
          "INSERT INTO quotes (id, trip_id, owner, trip_version, data, total, expires_at, status) SELECT ?, ?, ?, ?, ?, ?, ?, 'open' FROM trips WHERE id = ? AND owner = ? AND version = ?",
        )
        .bind(
          q.id,
          t.id,
          user,
          t.version,
          JSON.stringify(q),
          q.total,
          q.expiresAt,
          t.id,
          user,
          t.version,
        )
        .run();
      if (saved.meta.changes !== 1)
        throw new HttpError(409, "Your trip changed. Refresh and try again.");
      return send({ quote: q, serverNow: Date.now() });
    }
    if (action === "checkout") {
      const b = z
        .object({
          quoteId: idSchema,
          name: z.string().trim().min(2).max(100),
          email: z.string().email().max(254),
          acknowledged: z.literal(true),
        })
        .parse(body);
      const existing = await db()
        .prepare("SELECT data FROM orders WHERE quote_id = ? AND owner = ?")
        .bind(b.quoteId, user)
        .first<{ data: string }>();
      if (existing) return send({ order: JSON.parse(existing.data) });
      const row = await db()
        .prepare("SELECT * FROM quotes WHERE id = ? AND owner = ?")
        .bind(b.quoteId, user)
        .first<any>();
      if (!row) throw new HttpError(404, "Quote not found.");
      if (row.expires_at <= Date.now())
        throw new HttpError(
          410,
          "This quote expired. Refresh prices to continue.",
        );
      const q: Quote = JSON.parse(row.data),
        t = await loadTrip(q.tripId, user);
      if (t.version !== row.trip_version || t.status !== "draft")
        throw new HttpError(
          409,
          "The trip changed after this quote was made. Refresh prices.",
        );
      const o: Order = {
        id: crypto.randomUUID(),
        tripId: t.id,
        quoteId: q.id,
        total: row.total,
        items: q.items,
        createdAt: Date.now(),
        status: "demo_confirmed",
        name: b.name,
        email: b.email,
      };
      await db().batch([
        db()
          .prepare(
            "INSERT OR IGNORE INTO orders (id, quote_id, trip_id, owner, data, created_at) SELECT ?, q.id, q.trip_id, q.owner, ?, ? FROM quotes q JOIN trips t ON t.id = q.trip_id WHERE q.id = ? AND q.owner = ? AND q.status = 'open' AND q.expires_at > ? AND t.version = q.trip_version AND NOT EXISTS (SELECT 1 FROM orders WHERE trip_id = q.trip_id)",
          )
          .bind(o.id, JSON.stringify(o), o.createdAt, q.id, user, Date.now()),
        db()
          .prepare(
            "UPDATE trips SET version = version + 1, updated_at = ? WHERE id = ? AND owner = ? AND EXISTS (SELECT 1 FROM orders WHERE id = ?)",
          )
          .bind(Date.now(), t.id, user, o.id),
        db()
          .prepare(
            "UPDATE quotes SET status = 'completed' WHERE id = ? AND owner = ? AND EXISTS (SELECT 1 FROM orders WHERE quote_id = ?)",
          )
          .bind(q.id, user, q.id),
      ]);
      const done = await db()
        .prepare("SELECT data FROM orders WHERE quote_id = ? AND owner = ?")
        .bind(q.id, user)
        .first<{ data: string }>();
      if (!done)
        throw new HttpError(
          409,
          "Checkout could not complete because your quote expired or your trip changed. Refresh prices.",
        );
      return send({ order: JSON.parse(done.data) });
    }
    if (action === "forget-profile") {
      const b = z
          .object({ tripId: idSchema, version: z.number().int() })
          .parse(body),
        t = await loadTrip(b.tripId, user);
      t.profile = null;
      t.itinerary = null;
      t.messages = [];
      const saved = await db()
        .prepare(
          "UPDATE trips SET data = ?, version = version + 1, updated_at = ? WHERE id = ? AND owner = ? AND version = ?",
        )
        .bind(JSON.stringify(t), Date.now(), t.id, user, b.version)
        .run();
      if (saved.meta.changes !== 1)
        throw new HttpError(409, "Your trip changed. Refresh first.");
      t.version++;
      return send({ trip: t });
    }
    return send({ error: "Not found" }, 404);
  } catch (e) {
    return failure(e);
  }
}
