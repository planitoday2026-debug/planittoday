# Backend API

All responses use JSON except the itinerary download. Requests with a body require `Content-Type: application/json`. Writes with an Origin header must be same-origin. Amounts are integer INR paise, not floating-point rupees.

Signed-in identities come from local accounts and a revocable `planitoday_session` cookie. Every persisted trip, quote and order read or write is scoped to that owner. Passwords use salted scrypt hashes; session tokens are random and stored as SHA-256 hashes. No external identity headers are trusted.

Account routes (JSON POST): `/api/auth/register` accepts `{name,email,password}` and returns 201; `/api/auth/login` accepts `{email,password}` and returns 200; `/api/auth/logout` revokes the current session and returns 200. Passwords require 12–128 characters. Sessions expire after seven days. Accounts are local to this installation, with no email verification or recovery flow.

## Routes

| Method | Route                | Input                                        | Result                                                |
| ------ | -------------------- | -------------------------------------------- | ----------------------------------------------------- |
| GET    | /api/health          | None                                         | Booking mode and planner mode                         |
| GET    | /api/state           | None                                         | Current user, owned trips, owned orders               |
| POST   | /api/search          | Search                                       | Demo offers                                           |
| POST   | /api/new-trip        | Empty object                                 | New empty owned trip                                  |
| POST   | /api/add             | tripId?, version?, offerId, params           | Updated trip                                          |
| POST   | /api/remove          | tripId, version, itemId                      | Updated trip                                          |
| POST   | /api/plan            | profile; tripId? and version?                | Trip with itinerary and recommended offers            |
| POST   | /api/recommend       | tripId                                       | Recommended offers from saved profile                 |
| POST   | /api/chat            | tripId, version, day, activityIndex, message | Updated trip and changed flag                         |
| POST   | /api/quote           | tripId, version                              | Immutable quote and serverNow                         |
| POST   | /api/checkout        | quoteId, name, email, acknowledged:true      | Persisted demo order                                  |
| POST   | /api/forget-profile  | tripId, version                              | Trip with profile, itinerary and conversation cleared |
| GET    | /api/export?tripId=… | Owned trip ID                                | Downloadable text itinerary                           |

Anonymous users can search and inspect the health endpoint. State returns no private records when signed out. All mutation and export paths require authentication.

## Search request

```json
{
  "category": "flights",
  "from": "Mumbai",
  "to": "Goa",
  "start": "2026-11-12",
  "end": "2026-11-16",
  "travelers": 2,
  "rooms": 1,
  "cabin": "Economy",
  "direction": "outbound",
  "roundtrip": true
}
```

Use future dates. Categories are flights, hotels, trains, buses, packages and cabs. Supported cities are in `lib/travel.ts`.

Search is non-authoritative display data. The add endpoint reconstructs an offer from the validated category, offer ID and parameters. It does not accept the displayed total as the price authority. Duplicate identical offers are deduplicated. A changed date or quantity is a different offer; remove the old item when replacing it.

## Trip concurrency

Trips have an integer version. Item changes, itinerary changes and profile removal increase it. Updates use SQL predicates that match the owner, trip ID and expected version. A stale request returns 409.

For regeneration of an existing trip, send its version. Regeneration with booking items is rejected; start a new plan instead. Chat is allowed after demo checkout, because it changes only itinerary information. It never modifies the immutable order snapshot.

## Quote lifecycle

1. Revalidate each item server-side.
2. Rebuild current item prices.
3. Calculate the subtotal and explicit 2% demo service fee.
4. Store the item snapshot, total, current trip version and server timestamp plus 600,000 ms.
5. Return a quote ID and serverNow for the display countdown.

Quotes are invalid after trip edits or expiry. The frontend clock is informational; checkout uses the server clock.

## Checkout transaction

The demo flow inserts an order only when the quote is owned, open, unexpired, matches the trip version and the trip has no order. The insert, trip-version increment and quote-status update run in one local SQLite transaction. Both quote ID and trip ID have unique constraints in the orders table.

Replaying the same quote returns the previously created order. Concurrent attempts against one or multiple quotes cannot create more than one successful demo order for the trip. No external charge happens.

Do not repurpose this endpoint as a live payment integration. Real supplier fulfillment needs a separate persisted state machine and compensation workflow.

## AI contract

The optional local Ollama adapter receives only the saved profile, curated place catalog, selected itinerary context and recent conversation. It requests JSON-schema output, validates the result again with Zod, rejects unknown/repeated activity IDs and validates restricted-mobility constraints. It connects only to a loopback HTTP address, rejects redirects, and must use a downloaded local model. The default preview planner makes no AI requests.

The planner maps accepted place IDs back to server-owned descriptions and prices. Day geography is derived from actual activities. Day timing uses arrival/departure windows, activity durations and transfer buffers.

Chat can replace only the selected activity. Its ID and time remain stable, other days remain unchanged, and the response includes the estimated cost difference. Venue closures are treated as user reports, not verified facts.

## Errors and limits

- 400: invalid request or unsupported parameters.
- 401: sign-in required.
- 403: cross-origin write.
- 404: missing or unowned record.
- 409: concurrent edit, completed trip or invalidated quote.
- 410: expired quote.
- 413: body exceeds the bounded request size.
- 415: incorrect content type.
- 429: daily preview limit reached.
- 503: storage or provider operation failed.

Daily per-user limits are 1,000 authenticated requests, 30 plans and 100 chat turns. For public production traffic, add edge rate limits, account verification and scheduled retention/cleanup.
