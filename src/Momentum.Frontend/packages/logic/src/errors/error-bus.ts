import { AppError, toAppError } from "./errors.js";

/**
 * A pub/sub channel for errors that no component is positioned to report.
 *
 * The case that motivates it: an adapter swallows a failure to keep the page
 * rendering — a reference table it cannot read, so display names stay unresolved.
 * The list renders, which is right, but a silently empty or half-populated list is
 * indistinguishable from "no data". The adapter has no access to a toast and
 * shouldn't; it publishes here, and one bridge component at the app root turns
 * whatever arrives into a notification.
 */

export type ErrorBusListener = (error: AppError) => void;

const listeners = new Set<ErrorBusListener>();

/** A listener that throws must not stop the others, or one bad subscriber mutes the bus. */
export function emitError(error: unknown): void {
  const appError = toAppError(error);
  for (const listener of listeners) {
    try {
      listener(appError);
    } catch (listenerFailure) {
      console.error("[error-bus] listener threw:", listenerFailure);
    }
  }
}

export function subscribeToErrors(listener: ErrorBusListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Report a failure that was recovered from.
 *
 * Use when the UI carried on regardless: the user still needs to know the result is
 * incomplete. Do NOT use for display-name enrichment, which is expected to fail in
 * providers that never registered the reference table — log those and move on.
 */
export function reportSwallowed(context: string, error: unknown): void {
  console.warn(`[innovation-backlog] ${context} failed:`, error);
  emitError(error);
}
