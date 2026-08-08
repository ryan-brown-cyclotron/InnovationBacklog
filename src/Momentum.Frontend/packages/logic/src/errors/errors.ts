/**
 * One error type for every backend, classified at the adapter boundary.
 *
 * Adapters see failures three different ways — a thrown Error with an HTTP-ish
 * message, an OData `{ error: { code, message } }` envelope, or a bare
 * `{ success: false }` from a Power Platform connector. Normalizing them here means
 * surfaces branch on a category rather than sniffing message text, and raw backend
 * prose never reaches a user.
 */

export type ErrorCategory =
  | "init"
  | "permission"
  | "notFound"
  | "conflict"
  | "throttle"
  | "network"
  | "validation"
  | "unknown";

export type ErrorSeverity = "info" | "warn" | "error";

const USER_MESSAGE: Record<ErrorCategory, string> = {
  init: "The app couldn't start. Refresh to try again.",
  permission: "You don't have access to do that.",
  notFound: "That item no longer exists.",
  conflict: "Someone else changed this. Reload and try again.",
  throttle: "Too many requests — try again in a moment.",
  network: "Connection problem. Check your network and retry.",
  validation: "That doesn't look right. Check the form and try again.",
  unknown: "Something went wrong.",
};

/** Throttle and conflict are recoverable by retrying, so they warn rather than error. */
const WARN_CATEGORIES: readonly ErrorCategory[] = ["throttle", "conflict"];

export class AppError extends Error {
  readonly category: ErrorCategory;
  readonly userMessage: string;
  readonly severity: ErrorSeverity;

  constructor(
    message: string,
    options: { category: ErrorCategory; cause?: unknown; userMessage?: string },
  ) {
    super(message, { cause: options.cause });
    this.name = "AppError";
    this.category = options.category;
    this.userMessage = options.userMessage ?? USER_MESSAGE[options.category];
    this.severity = WARN_CATEGORIES.includes(options.category) ? "warn" : "error";
  }
}

/** Thrown when a hook is used outside LogicProvider — always a wiring mistake. */
export class ProviderNotConfiguredError extends AppError {
  constructor() {
    super("LogicProvider is missing above this component.", { category: "init" });
    this.name = "ProviderNotConfiguredError";
  }
}

/** Default message for a category, for adapters composing their own AppError. */
export function defaultUserMessage(category: ErrorCategory): string {
  return USER_MESSAGE[category];
}

/**
 * Best-effort classification from an HTTP status.
 * Adapters that know more should pass an explicit category instead.
 */
export function categorizeStatus(status: number): ErrorCategory {
  if (status === 401 || status === 403) return "permission";
  if (status === 404) return "notFound";
  if (status === 409 || status === 412) return "conflict";
  if (status === 429) return "throttle";
  if (status === 400 || status === 422) return "validation";
  if (status >= 500) return "network";
  return "unknown";
}

/** Idempotent: an AppError passes through unchanged so wrapping twice is safe. */
export function toAppError(raw: unknown, category: ErrorCategory = "unknown"): AppError {
  if (raw instanceof AppError) return raw;
  const message = raw instanceof Error ? raw.message : String(raw);
  return new AppError(message, { category, cause: raw });
}
