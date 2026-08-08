# Momentum — Instrumentation & Metrics

## Purpose
Define the participation funnels and lifecycle movement that the momentum experience tracks. Before introducing more elaborate game mechanics, measure whether the current ones create useful participation. These measurements should eventually influence Momentum.

## Participation Funnels

Track conversion through meaningful actions:

- `search → item opened`
- `need viewed → vote`
- `need viewed → follow`
- `need viewed → contribution started`
- `need viewed → implementation started`

- `solution viewed → implementation started`
- `solution viewed → adoption recorded`
- `solution viewed → contribution started`

- `momentum impression → item opened`
- `activity event impression → item opened`

## Lifecycle Movement

Track progression across the innovation lifecycle:

```
need → exploration
exploration → implementation
implementation → published solution
solution → adoption
adoption → repeat adoption
```

## Influence on Momentum
Funnel and lifecycle measurements should eventually feed back into the Momentum projection weighting — for example, weighting signals that demonstrably drive implementation or adoption over signals that only drive views. The exact weighting can change without migrating domain data because Momentum is a projection.

## Invariants
- Instrumentation measures useful participation, not noise (no page-view vanity metrics as activity).
- Lifecycle movement is derived from domain events, not manually recorded.
- Measurement results may influence Momentum weighting but never mutate source-of-truth records.

## Related Design
- `docs/design/capabilities/momentum/index.md`
- `docs/design/capabilities/momentum/projections.md`
- `docs/design/cross-cutting/observability`
