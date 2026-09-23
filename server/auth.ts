import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { z } from "zod";
import { db, HttpError } from "../lib/database.js";

export const requestContext = new AsyncLocalStorage<Request>();
const derive = promisify(scrypt);
const cookieName = "planitoday_session";
const lifetime = 7 * 24 * 60 * 60;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
export type User = { userId: string; displayName: string; email: string };
function tokenFor(req: Request) {
  const value = req.headers.get("cookie")?.split(";").map(s => s.trim()).find(s => s.startsWith(cookieName + "="))?.slice(cookieName.length + 1);
  return value && /^[a-f0-9]{64}$/.test(value) ? value : null;
}
export async function getUser(): Promise<User | null> {
  const req = requestContext.getStore();
  const token = req && tokenFor(req);
  if (!token) return null;
  return db().prepare("SELECT u.id AS userId, u.name AS displayName, u.email FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?")
    .bind(hash(token), Date.now()).first<User>();
}
function cookie(token: string, age = lifetime) {
  const secure = process.env.COOKIE_SECURE === "true" ? "; Secure" : "";
  return `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${secure}`;
}
function createSession(user: User, status = 200) {
  const token = randomBytes(32).toString("hex");
  db().prepare("DELETE FROM sessions WHERE expires_at <= ?").bind(Date.now()).run();
  db().prepare("INSERT INTO sessions VALUES (?, ?, ?)").bind(hash(token), user.userId, Date.now() + lifetime * 1000).run();
  return Response.json({ user: { name: user.displayName, email: user.email } }, { status, headers: { "Set-Cookie": cookie(token), "Cache-Control": "no-store" } });
}
const credentials = z.object({ email: z.string().trim().email().max(254).transform(s => s.toLowerCase()), password: z.string().min(12, "Use at least 12 characters for your password.").max(128) });
export async function authenticate(action: string, req: Request, address: string) {
  if (action === "logout") {
    const token = tokenFor(req);
    if (token) db().prepare("DELETE FROM sessions WHERE token_hash = ?").bind(hash(token)).run();
    return Response.json({ ok: true }, { headers: { "Set-Cookie": cookie("", 0), "Cache-Control": "no-store" } });
  }
  const bucket = "auth:" + hash(address) + ":" + Math.floor(Date.now() / 600000);
  if (!db().prepare("INSERT INTO usage VALUES (?, 1) ON CONFLICT(key) DO UPDATE SET count = count + 1 WHERE count < 60 RETURNING count").bind(bucket).first())
    throw new HttpError(429, "Too many sign-in attempts. Try again in ten minutes.");
  const body = await req.json().catch(() => { throw new HttpError(400, "Invalid JSON."); });
  if (action === "register") {
    const input = credentials.extend({ name: z.string().trim().min(2).max(80) }).parse(body);
    if (db().prepare("SELECT id FROM users WHERE email = ?").bind(input.email).first())
      throw new HttpError(409, "An account with this email already exists on this installation.");
    const salt = randomBytes(16).toString("hex");
    const key = await derive(input.password, salt, 64) as Buffer;
    const user: User = { userId: randomUUID(), displayName: input.name, email: input.email };
    try {
      db().prepare("INSERT INTO users VALUES (?, ?, ?, ?, ?)").bind(user.userId, input.name, input.email, salt + ":" + key.toString("hex"), Date.now()).run();
    } catch (error) {
      if (db().prepare("SELECT id FROM users WHERE email = ?").bind(input.email).first())
        throw new HttpError(409, "An account with this email already exists on this installation.");
      throw error;
    }
    return createSession(user, 201);
  }
  const input = credentials.parse(body);
  const user = db().prepare("SELECT id AS userId, name AS displayName, email, password_hash FROM users WHERE email = ?").bind(input.email).first<User & { password_hash: string }>();
  const [salt, stored] = user?.password_hash.split(":") || ["00000000000000000000000000000000", "00".repeat(64)];
  const key = await derive(input.password, salt, 64) as Buffer;
  if (!user || !timingSafeEqual(key, Buffer.from(stored, "hex"))) throw new HttpError(401, "Email or password is incorrect.");
  return createSession(user);
}
