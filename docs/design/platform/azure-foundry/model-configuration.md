# Azure Foundry — Model Configuration

## Purpose
Document how Momentum configures Foundry model deployments so the agent execution environment is reproducible and clean across local and production.

## Purpose
Make model deployment configuration centralized and owned by the platform layer.

## Configuration Items
- Project endpoint — supplied through Aspire parameter wiring.
- Model deployment name — supplied through Aspire parameter wiring.
- Agent identity — supplied through Aspire parameter wiring; never hardcoded.
- Tool exposure — registered through Agent Framework, including MCP-connected tools.

## Invariants
- Model configuration changes require an architectural decision.
- A change in model deployment does not change the structured output contract; output contract changes are an architectural decision.
- The same composition works for local and production; values differ but ownership is consistent.

## Contracts
- Configuration is provided via Aspire to `Momentum.Service` and resolved at agent runtime.

## Related Design
- `docs/design/platform/azure-foundry/agent-registration.md`
- `docs/design/platform/aspire/composition.md`

## Related Decisions
- (none — pending requirement acceptance for model choices.)
