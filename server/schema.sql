CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS trips (
  id TEXT PRIMARY KEY, owner TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 0,
  data TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_trips_owner_updated ON trips(owner, updated_at);
CREATE TABLE IF NOT EXISTS quotes (
  id TEXT PRIMARY KEY, trip_id TEXT NOT NULL, owner TEXT NOT NULL,
  trip_version INTEGER NOT NULL, data TEXT NOT NULL, total INTEGER NOT NULL,
  expires_at INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'open'
);
CREATE INDEX IF NOT EXISTS idx_quotes_owner_trip ON quotes(owner, trip_id);
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY, quote_id TEXT UNIQUE NOT NULL, trip_id TEXT UNIQUE NOT NULL,
  owner TEXT NOT NULL, data TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_orders_owner ON orders(owner);
CREATE TABLE IF NOT EXISTS usage (key TEXT PRIMARY KEY, count INTEGER NOT NULL);
