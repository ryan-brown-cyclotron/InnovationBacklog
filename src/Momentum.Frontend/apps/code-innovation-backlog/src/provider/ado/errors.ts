import { AppError } from "@innovation-backlog/logic";

/**
 * Pull the one useful sentence out of an Azure DevOps failure.
 *
 * A rule violation arrives as a JSON envelope wrapping a prose message that itself
 * embeds more JSON, and the actual cause — "The field 'State' contains the value
 * 'Accepted' that is not in the list of supported values" — is repeated four levels
 * down. Rendering the envelope put roughly eighty lines of escaped JSON in front of
 * the user where one sentence belonged.
 *
 * Deliberately tolerant: every step is best-effort and falls back to the layer above,
 * because an error path that throws while formatting an error is strictly worse than
 * an ugly message.
 */

/** The generic wrappers ADO puts on top; none of them say what actually went wrong. */
const UNINFORMATIVE = /^(azure devops rule\(s\) has been violated|see underlying error)/i;

/** "TF401232: Work item 999 does not exist." — the code adds nothing, the rest does. */
const clean = (line: string): string => line.replace(/^TF\d+:\s*/i, "").trim();

/**
 * The first balanced `{...}` in a string.
 *
 * `slice(indexOf("{"))` is not enough: ADO embeds `Details: {json}` mid-sentence and
 * follows it with `clientRequestId: ...`, so parsing to end-of-string always fails and
 * the real message stays buried. Quote and escape aware so a brace inside a string
 * value does not end the scan early.
 */
function firstJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const char = text[i]!;
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === "{") depth++;
    else if (char === "}" && --depth === 0) return text.slice(start, i + 1);
  }
  return null;
}

function parseEmbedded(text: string): unknown {
  const candidate = firstJsonObject(text);
  if (!candidate) return null;
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

function deepest(value: unknown, found: string[] = []): string[] {
  if (typeof value === "string") {
    // Details: is a JSON document embedded in a prose string.
    const embedded = parseEmbedded(value);
    if (embedded) deepest(embedded, found);
    return found;
  }
  if (Array.isArray(value)) {
    value.forEach((entry) => deepest(entry, found));
    return found;
  }
  if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (/^(errorMessage|ErrorMessage|message|Message)$/.test(key) && typeof entry === "string") {
        const line = clean(entry.split(/\r?\n/)[0]!);
        if (line && !UNINFORMATIVE.test(line)) found.push(line);
      }
      deepest(entry, found);
    }
  }
  return found;
}

/**
 * The clearest phrasing of what ADO rejected, or null if nothing better than the
 * raw text could be found.
 */
export function describeAdoFailure(raw: string): string | null {
  const candidates: string[] = [];

  const envelope = parseEmbedded(raw);
  if (envelope) candidates.push(...deepest(envelope));

  // Escaped-unicode quotes survive when the envelope is not parseable as a whole.
  if (candidates.length === 0) {
    const pattern = /(?:errorMessage|ErrorMessage)(?:\\u0022|")\s*:\s*(?:\\u0022|")(.+?)(?:\\u0022|")/g;
    for (const match of raw.matchAll(pattern)) {
      const line = clean(match[1]!);
      if (line && !UNINFORMATIVE.test(line)) candidates.push(line);
    }
  }

  if (candidates.length === 0) {
    const first = clean(raw.split(/\r?\n/)[0]!);
    return first && !UNINFORMATIVE.test(first) && !first.startsWith("{") ? first : null;
  }

  // The most-repeated line is the innermost cause: ADO echoes it up through each
  // wrapping layer, while the generic envelopes appear once.
  const tally = new Map<string, number>();
  for (const line of candidates) tally.set(line, (tally.get(line) ?? 0) + 1);
  return [...tally.entries()].sort((a, b) => b[1] - a[1])[0]![0];
}

/**
 * Re-wrap a failure so the user-facing text is the extracted sentence.
 *
 * Keeps the original category and cause — only the prose a person reads changes.
 */
export function refineAdoError(cause: unknown, description: string): unknown {
  if (!(cause instanceof AppError)) return cause;

  const detail = describeAdoFailure(cause.message);
  if (!detail) return cause;

  return new AppError(`${description}: ${detail}`, {
    category: cause.category,
    cause: cause.cause ?? cause,
    userMessage: detail,
  });
}
