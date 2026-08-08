/**
 * @innovation-backlog/logic
 *
 * Domain types, provider contracts, hooks and the in-memory provider.
 *
 * This package must never learn about a backend. No Dataverse column name, no
 * OData string, no Azure DevOps field reference, no Power Apps SDK import. If
 * something here needs one of those, it belongs in the app's provider layer behind
 * a contract instead.
 */

export * from "./domain/index.js";
export * from "./contracts/index.js";

export {
  AppError,
  ProviderNotConfiguredError,
  categorizeStatus,
  defaultUserMessage,
  toAppError,
} from "./errors/errors.js";
export type { ErrorCategory, ErrorSeverity } from "./errors/errors.js";

export { emitError, subscribeToErrors, reportSwallowed } from "./errors/error-bus.js";
export type { ErrorBusListener } from "./errors/error-bus.js";

export {
  LogicProvider,
  useProvider,
  useDataVersion,
  useInvalidate,
  useCapability,
} from "./components/LogicProvider.js";
export type { DataFamily, LogicProviderProps } from "./components/LogicProvider.js";

export * from "./hooks/index.js";

export { createMemoryProvider } from "./providers/memory/memory-provider.js";
export type { MemoryProviderOptions } from "./providers/memory/memory-provider.js";
export { defaultSeed } from "./providers/memory/seed.js";
export type { MemorySeed, MemoryVote } from "./providers/memory/seed.js";
