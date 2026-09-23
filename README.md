# Planitoday — standalone local edition

The frontend, backend, sign-in and database run on your own computer. No OpenAI, ChatGPT, Cloudflare, Sites account or hosting subscription is required. You can ZIP this source, send it to another PC, install dependencies there, and run it independently.

This remains a travel **demonstration MVP**. Inventory, fares, ratings, checkout and booking confirmations are simulated. The ten-minute quote expiry works in the backend; it does not hold a real airline fare. There is no payment collection, ticket issuance, room reservation or email delivery.

## Quick start in VS Code

1. Install **Node.js 24 LTS**, which includes npm, and VS Code. Node 24 is required for the bundled SQLite backend. No Python, Docker, Git, compiler or separate database installation is needed.
2. Extract `Planitoday-local.zip`.
3. In VS Code select **File → Open Folder** and open the inner `planitoday-local` directory. You should see `package.json` directly in the Explorer.
4. Open **Terminal → New Terminal** and check `node -v` and `npm -v`.
5. Run:

```sh
npm ci
npm run dev
```

6. Open **http://127.0.0.1:5173**. The frontend and backend start together. The database initializes automatically; no SQL command is required.
7. Open the account button, choose **New here? Create an account**, and enter your name, email and a password of at least 12 characters. The account is stored only in this installation. No verification email is sent.

These npm commands work in macOS/Linux terminals and Windows PowerShell or Command Prompt. If PowerShell blocks npm's script, use `npm.cmd ci` and `npm.cmd run dev`, or switch the VS Code terminal to Command Prompt.

After the first installation, just run `npm run dev`. Press Ctrl+C to stop. Frontend and backend source edits reload during development. Keep the terminal open while using the site.

## Run a built version

```sh
npm ci
npm run build
npm start
```

Open **http://127.0.0.1:3001**. One local Node process serves the compiled frontend and backend. Local accounts work in both development and built modes.

## What is inside

| Layer | Technology | Main files |
| --- | --- | --- |
| Frontend | React 19 + TypeScript, Vite | `main.tsx`, `app/page.tsx` |
| Design | Tailwind CSS, custom CSS, Radix/shadcn primitives, Lucide | `app/globals.css`, `components/` |
| Backend | Node.js HTTP server + TypeScript | `server/index.ts`, `server/api.ts` |
| Database | Node's built-in SQLite, local file | `lib/database.ts`, `server/schema.sql` |
| Accounts | Local scrypt password hashes + revocable sessions | `server/auth.ts` |
| Travel logic | Validated demo inventory and recommendations | `lib/travel.ts` |
| Planner | Curated offline rules; optional local Ollama AI | `lib/planner.ts` |
| Configuration | Optional environment file | `.env.example` |

The application has no Next.js, Vinext, Cloudflare, D1, Wrangler, hosted authentication or OpenAI runtime dependency. All installed JavaScript libraries are in the project's `node_modules` directory after `npm ci`. Both images are included locally; fonts use system fallbacks and do not request Google Fonts.

The frontend calls relative `/api/*` URLs. During development Vite proxies them to Node on port 3001. In the built version Node serves everything directly. The backend validates requests, checks the local session, uses prepared SQL statements and returns JSON.

`server/schema.sql` creates users, sessions, trips, quotes, orders and usage tables. Startup records migration version 1 and does not recreate or erase existing data. Future schema changes should use new transactional migration versions; editing this initial SQL will not migrate an existing database.

Checkout recalculates each selected item on the server, adds the 2% demo fee, and stores a quote valid for ten minutes. Its transaction rejects expired/stale quotes and prevents duplicate orders. A single item can be checked out independently.

## Where your data lives

The database is **`data/planitoday.sqlite`**. SQLite can also create `-wal` and `-shm` files beside it while the server is running. Your accounts, hashed passwords, sessions, trips, itinerary profiles, chat and demo orders stay there. Each installation is independent; computers do not synchronize.

To move your existing local data to your own other computer, stop the server first, copy the entire `data` folder, and place it into the new installation before starting it. Treat a database backup as private: it contains personal information and session records. The previous hosted edition's database is not automatically migrated into this separate local edition.

To give someone a fresh copy of the app, use the source ZIP below. Do not include your `data` folder or `.env`.

## Create a ZIP to share

```sh
npm run package
```

This creates **`releases/Planitoday-local.zip`** with source, a dependency lockfile, local images, SQL initialization and instructions. The script is cross-platform and needs no separate ZIP utility.

It excludes `node_modules`, build output, local accounts/data, environment secrets, logs, caches and platform-specific files. The recipient extracts it and runs `npm ci` followed by `npm run dev`.

Do not copy `node_modules` between Windows, macOS and Linux. Some build tools contain operating-system-specific binaries; installing from the included lockfile downloads the appropriate versions on the receiving PC. Internet access is needed for this initial installation. The default preview runs without an internet connection afterward. Optional tourism reference links open external websites only when clicked.

## Optional: fully local AI with Ollama

The default `AI_PROVIDER=preview` uses a curated planner and a small set of chat intentions. It requires no model or internet connection but cannot understand every free-text constraint. Supported itinerary destinations are Goa, Jaipur, Kochi/Kerala and Kyoto.

To use a local language model:

1. Install [Ollama](https://ollama.com/download) on the computer running the backend.
2. Download a model suitable for that computer using `ollama pull MODEL_NAME`. Choose the model yourself; large models need more RAM and time. Models are separate, often large downloads and are not included in this ZIP.
3. Make sure Ollama is running locally; `ollama list` shows installed models.
4. Copy `.env.example` to `.env` using VS Code and set:

```dotenv
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=YOUR_DOWNLOADED_MODEL_NAME
```

5. Restart Planitoday and generate an itinerary. The backend sends the profile and curated activities only to the configured local Ollama service. The adapter accepts only loopback HTTP URLs. Do not choose an Ollama cloud model if you want inference to remain on the computer.

The adapter uses Ollama's [structured output API](https://docs.ollama.com/capabilities/structured-outputs), then validates activity IDs and constraints with Zod. It does not browse the web or check venue hours/closures live. `/api/health` reports configuration mode, not a model's health. A model must be installed separately to test real local inference; no model was downloaded as part of this delivery.

## Checks

```sh
npm run typecheck
npm run build
npm run test:local
npm run test:ai
```

`test:local` starts an isolated built server and temporary SQLite database, checks local accounts, ownership, checkout, expiry and persistence after restart, then cleans up its own temporary data.

`test:ai` uses a mock local Ollama server to check request/response contracts and validation. It does not download a model or test actual model quality.

With `npm run dev` running on port 5173, open another terminal:

```sh
npm run test:api
```

This exercises the travel flows and creates synthetic test accounts/trips in the local development database. For a different URL set `TEST_ORIGIN` in your shell. The script only accepts loopback targets.

## Troubleshooting

- **`node`/`npm` not found:** install Node 24 and restart VS Code.
- **Cannot find `package.json`:** open the inner extracted folder, not its parent.
- **Unsupported Node version or SQLite error:** check `node -v`; use Node 24.
- **Port already in use:** stop the other instance, or copy `.env.example` to `.env` and change `PORT`/`DEV_UI_PORT`. Restart the server. API tests use port 5173 by default.
- **Cannot sign in:** accounts are local to each database; create an account on a fresh installation. This MVP has no email-based password reset.
- **Local AI unavailable:** confirm Ollama is running and the exact model from `ollama list` is configured. Use `AI_PROVIDER=preview` to return to the rules-based planner.
- **Changed database path:** setting `DB_PATH` selects a different database and may show a fresh empty account list. It does not move the old file.
- **Experimental SQLite warning:** some Node 24 releases label `node:sqlite` experimental; a warning alone is not a failed startup.

The server binds to this computer (`127.0.0.1`) by default. This package is for local use. A public production service additionally needs HTTPS, account recovery/verification, operational backups, supplier fulfillment, real payment integration and further deployment hardening. See `docs/LIVE_INTEGRATIONS.md`.
