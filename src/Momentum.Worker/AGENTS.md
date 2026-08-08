# Momentum.Worker

Hosts queue-triggered Azure Functions that dispatch Momentum domain events to the Library application and agent runtime.

## Constraints

- Consume typed event envelopes from the single `momentum-events` queue.
- Claim an event before executing it so duplicate delivery cannot duplicate behavior.
- Delegate workflow and persistence to Application handlers and ports.
- Do not contain domain rules or write Azure Tables directly.
- Do not invoke GitHub catalog projection in the current delivery.