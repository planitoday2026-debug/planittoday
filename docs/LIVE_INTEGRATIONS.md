# Connecting real travel and payments

The demonstration is deliberately runnable without supplier credentials. The live provider adapters and real money flow are **not implemented**. This guide identifies the missing work rather than implying that adding a payment key alone activates a travel business.

## 1. Obtain the commercial connections

Choose and contract with providers for each service category you intend to launch. Capabilities differ by provider: search, repricing, fare holds, ticketing, cancellation, refund and reconciliation are separate operations.

For India-focused operations, verify each supplier's commercial and regulatory access requirements directly. Do not assume a rail or bus search API grants booking or resale rights.

Use the supplier's sandbox before production. Keep credentials server-side in secret environment variables.

## 2. Replace the demo catalog

Replace `offersFor()` with category-specific adapters that normalize supplier responses into a common offer structure:

- Provider and opaque offer ID.
- Currency and amount in minor units.
- Quantity and traveller/room applicability.
- Exact departure/arrival timestamps and time zones.
- Baggage, cancellation and refund terms.
- Offer expiry, live availability and whether a hold is supported.
- Price breakdown, taxes and mandatory fees.

Do not trust prices, availability, or supplier IDs supplied by a browser. Store and revalidate the original supplier offer. Ensure the UI can show no results, a price change, sold-out inventory and provider errors.

## 3. Collect required traveller details at the right time

A supplier may require legal names, birth dates, nationality or document details. Collect only the fields required for the chosen booking and define consent, retention, encryption and deletion rules.

Do not request identity documents in the general planning interview. Do not send passport information to the itinerary model.

The delivered preview stores a contact name and email only for its synthetic order. It does not implement production passenger data collection.

## 4. Implement a real ten-minute quote promise

A database snapshot cannot hold another company's price or inventory.

Choose one of:

- Actual supplier holds lasting at least ten minutes, recording each hold reference and expiry.
- A merchant-funded fare guarantee with explicitly defined commercial rules.
- Revalidation at payment, with the interface explicitly saying prices are subject to confirmation.

The effective lock must expire no later than the earliest required supplier hold. Reprice all items together. Invalidate the quote when dates, passengers, room quantities or selection change.

## 5. Connect a payment service

Use a hosted or tokenized payment flow from the selected provider. Do not collect raw card details in this application.

Create the payment amount from the server's valid quote, not from browser totals. Attach the quote and order reference, and use an idempotency key.

Verify the payment provider's webhook signature against the raw body. Record event IDs with a unique constraint, and reconcile amounts, currency and merchant reference. Do not trust a successful client redirect as proof of payment.

The demo checkout endpoint must remain separate and visibly labeled during this integration.

## 6. Add supplier fulfillment orchestration

External suppliers cannot participate in the SQLite transaction. Use a persisted state machine with retryable jobs and an outbox or durable queue.

Suggested order states:

```text
quoted
  → payment_authorized
  → fulfillment_in_progress
  → confirmed
  → payment_captured
```

Failure and recovery states include:

```text
action_required
partial_confirmation
compensation_in_progress
refund_pending
refunded
failed
```

Persist status per item. Track provider request IDs and ticket/booking confirmation references. Use provider idempotency where supported, and perform lookup/reconciliation before retrying an uncertain response.

The correct authorize/book/capture order depends on the supplier and payment contracts. Some services cannot be cancelled automatically or held before payment. Decide this explicitly before launching.

## 7. Handle partial success

A unified customer payment does not make separate supplier bookings atomic.

Define what happens when the flight succeeds and the hotel fails: an alternative offer requiring confirmation, a void/refund, or customer support. Do not show “trip confirmed” until every required item is confirmed. Show pending and partial states accurately.

Test timeouts after a supplier accepts a booking, repeated webhooks, capture failures, sold-out rooms, expired holds, currency mismatch and compensation failures.

## 8. Improve itinerary intelligence

Connect the implemented local Ollama adapter to a downloaded model, then add grounded destination retrieval and current venue data as needed. Live information sources require separate network connections; the default local planner does not retrieve current data.

- Preserve provenance and the time each fact was checked.
- Use actual booked transport times and local time zones.
- Check accessibility and dietary requirements with operators.
- Calculate routes and transfer times before committing a revision.
- Keep booked items outside the model's authority.
- Validate a proposed revision against arrival/departure windows and reservations.
- Show the cost and timing consequences before accepting disruptive changes.

The delivered curated library has official tourism references but does not fetch live closures or issue reservation changes.

## 9. Prepare customer access and operations

The standalone edition uses local email/password accounts and SQLite sessions. A public consumer launch needs HTTPS, verified customer identities, account recovery, customer support and an access policy. The default server listens only on the local computer.

Add operational alerting, payment/supplier reconciliation, backups, record retention, appropriate privacy/booking terms and support escalation. Review all of these against the actual business and provider agreements.

## 10. Release in stages

1. Keep the public-facing environment in demo mode.
2. Run supplier and payment sandboxes together.
3. Test a complete successful trip and each partial-failure branch.
4. Run a small, controlled production pilot with reconciliation.
5. Enable more categories only after their fulfillment and refund flows work.

Do not remove the demo labels from this code until those connections and checks are complete.
