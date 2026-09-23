# Standalone edition validation

Verified on macOS with Node 24.19.0. Windows/Linux-specific execution has not been performed; source and npm scripts use cross-platform paths and the lockfile includes platform-specific optional build-tool packages.

- TypeScript checks: passed for frontend and backend.
- Production build: passed. The frontend bundle triggers Vite's advisory 500 kB chunk-size warning; this is not a build failure.
- Travel API suite: 30 checks passed through the Vite proxy using same-origin request headers. Covers category searches, pricing, unified and single-item checkout, concurrency/idempotency, profile persistence, targeted revisions and timing constraints.
- Portable backend suite: 20 checks passed against a fresh isolated SQLite database. Covers schema initialization, local registration/login, password rejection, ownership isolation, forged hosting headers, cross-origin protection, body limits, quote expiry, static-file containment, restart persistence and logout revocation.
- Local Ollama adapter suite: 11 checks passed with a mock loopback service. Covers valid structured responses, invalid/malformed output, unknown/repeated activities, missing days, HTTP failure, redirects, remote-URL rejection and no requests in preview mode.
- Source ZIP portability: extracted into a fresh directory whose path contains spaces; `npm ci` installed from the lockfile, TypeScript and production build passed, and both the 20-check backend suite and 11-check AI contract suite passed there. No files from the original application were used at runtime. Installation used a local npm download cache.
- Browser visual verification could not run because the available browser control reported that its admin policy check was unavailable. Build and HTTP/API verification do not establish visual/browser interaction correctness.
- No real Ollama model was downloaded or exercised; local model quality, speed and hardware requirements remain unverified.
- No real supplier or payment integration is included or tested.

The portable package contains no `node_modules`, personal database, `.env`, cloud deployment configuration or original hosted-runtime dependencies. The prior hosted edition is unchanged.
