import { AppError, categorizeStatus } from "@innovation-backlog/logic";
import type { ErrorCategory } from "@innovation-backlog/logic";

/**
 * Failure classification at the adapter boundary.
 *
 * The SDK reports failures three different ways and only one of them is a throw:
 * a rejected promise, an `{ success: false, error }` result, and an OData error
 * envelope inside `error.message`. A connector call in particular *resolves*
 * `{ success: false }` — an unchecked one looks exactly like success, which is the
 * single easiest way to ship a silent data-loss bug here.
 */

interface OperationResult<T> {
  success: boolean;
  data: T;
  error?: Error | { message?: string; status?: number };
  skipToken?: string;
}

function statusOf(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const candidate = error as { status?: unknown; statusCode?: unknown };
  const raw = candidate.status ?? candidate.statusCode;
  return typeof raw === "number" ? raw : undefined;
}

function messageOf(error: unknown): string {
  if (!error) return "The operation failed.";
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

/** Status first, then message keywords — the SDK is not consistent about either. */
function categorize(error: unknown): ErrorCategory {
  const status = statusOf(error);
  if (status !== undefined) return categorizeStatus(status);

  const text = messageOf(error).toLowerCase();
  if (/forbidden|unauthor|privilege|access denied|principal/.test(text)) return "permission";
  if (/not found|does not exist|0x80040217/.test(text)) return "notFound";
  if (/duplicate|already exists|0x80040237/.test(text)) return "conflict";
  if (/precondition|etag|was modified/.test(text)) return "conflict";
  if (/throttl|too many requests|rate limit|0x80072321/.test(text)) return "throttle";
  if (/timeout|failed to fetch|offline|econnreset|network/.test(text)) return "network";
  return "unknown";
}

export function classify(error: unknown, category?: ErrorCategory): AppError {
  if (error instanceof AppError) return error;
  return new AppError(messageOf(error), { category: category ?? categorize(error), cause: error });
}

/**
 * Take the payload from an SDK result, or raise a classified error.
 *
 * Every call goes through this. `context` is prepended to the technical message so
 * a failure names the operation that produced it rather than only the transport.
 */
export function unwrap<T>(result: OperationResult<T>, context: string): T {
  if (!result.success) {
    const error = classify(result.error ?? new Error(`${context} failed`));
    throw new AppError(`${context}: ${error.message}`, {
      category: error.category,
      cause: result.error,
      userMessage: error.userMessage,
    });
  }
  return result.data;
}

export type { OperationResult };
