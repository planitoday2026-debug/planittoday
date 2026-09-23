import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export const databasePath = resolve(process.env.DB_PATH || "data/planitoday.sqlite");
mkdirSync(dirname(databasePath), { recursive: true });
const connection = new DatabaseSync(databasePath);
connection.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
connection.exec("BEGIN IMMEDIATE");
try {
  connection.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)");
  if (!connection.prepare("SELECT version FROM schema_migrations WHERE version = 1").get()) {
    connection.exec(readFileSync(resolve("server/schema.sql"), "utf8"));
    connection.prepare("INSERT INTO schema_migrations VALUES (1, ?)").run(Date.now());
  }
  connection.exec("COMMIT");
} catch (error) { connection.exec("ROLLBACK"); throw error; }

// Prepared-query adapter; every query runs locally and batches are atomic.
class Statement {
  constructor(private sql: string, private values: SQLInputValue[] = []) {}
  bind(...values: SQLInputValue[]) { return new Statement(this.sql, values); }
  first<T = Record<string, unknown>>(): T | null {
    return (connection.prepare(this.sql).get(...this.values) as T | undefined) ?? null;
  }
  all<T = Record<string, unknown>>() {
    return { results: connection.prepare(this.sql).all(...this.values) as T[] };
  }
  run() {
    const result = connection.prepare(this.sql).run(...this.values);
    return { meta: { changes: Number(result.changes) } };
  }
}
const database = {
  prepare(sql: string) { return new Statement(sql); },
  batch(statements: Statement[]) {
    connection.exec("BEGIN IMMEDIATE");
    try {
      const results = statements.map((s) => s.run());
      connection.exec("COMMIT"); return results;
    } catch (error) { connection.exec("ROLLBACK"); throw error; }
  },
};
export function db() { return database; }
export function closeDatabase() { connection.close(); }
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
