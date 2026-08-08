# Azure Storage — Queue Storage

## Purpose
Document the Azure Queue Storage conventions used for asynchronous application events so transport and durable execution remain separable.

## Purpose
State the queue message contract, correlation rules, and poison-message handling.

## Message Contract
- Envelope: `DomainEventEnvelope` carrying event type, stable ids, correlation id, causation id, and timestamp.
- Body: serialized event payload.

## Correlation and Causation
- Every emitted event carries a stable id so duplicate queue delivery does not duplicate behavior.
- Causation captures the origin of the chain; correlation captures the operation across capabilities.

## Poison Messages
- Messages exceeding a bounded retry count are quarantined and do not silently retry.
- A quarantined message is recorded as audit evidence for operator or successor iteration handling.

## Invariants
- Azure Queue Storage transports asynchronous application events.
- A single broad retry policy does not exist; idempotency is enforced by stable ids.
- Queue messages do not include free-form agent output.

## Contracts
- Out: `AzureQueueEventPublisher` implementing `IEventPublisher`.
- In: `Momentum.Worker` consumes envelopes and invokes the agent runtime.

## Related Design
- `docs/design/cross-cutting/eventing`
- `docs/design/cross-cutting/idempotency`
- `src/Momentum.Worker/AGENTS.md`

## Related Decisions
- `0009-azure-queue-storage-transports-events`
