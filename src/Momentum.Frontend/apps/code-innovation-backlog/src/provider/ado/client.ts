import { AppError } from "@innovation-backlog/logic";
import { AzureDevOpsService } from "../../generated/services/AzureDevOpsService.js";
import { classify, unwrap } from "../errors.js";
import { refineAdoError } from "./errors.js";
import { requireAdoContext } from "../environment.js";
import type { EnvVars } from "../environment.js";

/**
 * A thin REST client over the Azure DevOps connector.
 *
 * Everything goes through the connector's `HttpRequest` operation rather than its
 * typed operations. Three reasons:
 *
 *  - There is no ad-hoc WIQL operation at all. `GetQueryResults` runs a *saved*
 *    query, so any dynamic search needs the escape hatch regardless.
 *  - There is no add-attachment operation either.
 *  - Mixing typed calls and raw ones would mean two error shapes, two paging
 *    stories and two places to get the api-version wrong.
 *
 * The typed operations that do earn their place — comments and links — are called
 * directly from the modules that need them.
 */

export interface AdoContext {
  organization: string;
  project: string;
}

export interface AdoClient {
  context(): Promise<AdoContext>;
  get<T>(path: string, description: string, apiVersion?: string): Promise<T>;
  /**
   * A POST that is really a read — WIQL and `workitemsbatch`, both of which take a
   * body and change nothing. Separate from `post` because only this one is cached;
   * see the note on the cache below.
   */
  read<T>(path: string, body: unknown, description: string, apiVersion?: string): Promise<T>;
  post<T>(path: string, body: unknown, description: string, apiVersion?: string): Promise<T>;
  patch<T>(path: string, body: unknown, description: string, contentType?: string): Promise<T>;
  /**
   * A raw octet-stream POST, for the attachment upload — the one call in this app
   * whose body is bytes rather than JSON.
   *
   * The connector expresses this itself: `VstsHttpRequestBodyParameters` carries an
   * `IsBase64` flag, and the payload the UI already holds is base64, so the bytes
   * travel unchanged and are never JSON-stringified.
   */
  upload<T>(path: string, contentBase64: string, description: string): Promise<T>;
}

const API_VERSION = "7.1";

/**
 * Endpoints that are still preview-versioned and reject a plain "7.1" with
 * VssInvalidPreviewVersionException. Work item comments are the one this app hits.
 */
export const PREVIEW = "7.1-preview";

/**
 * How long a settled read stays answerable from memory.
 *
 * Sized for one panel open and nothing longer. Opening a solution asks for
 * `workitems/{id}?$expand=relations` three times — `getSolution`, `listLinkedIdeas`
 * and the comment attachment lookup, none of which know about each other — and the
 * whole sequence completes inside a second. Five seconds covers that with room to
 * spare and is far too short to serve a stale record to somebody who navigates away
 * and comes back. Any mutation clears the cache outright, so a read-after-write
 * never sees the value it just replaced.
 */
const READ_WINDOW_MS = 5000;

export function createAdoClient(readEnv: () => Promise<EnvVars>): AdoClient {
  const context = () => requireAdoContext(readEnv);

  /*
    Reads in flight or recently settled, keyed on method + uri + body.

    Two effects, and both are wanted: concurrent identical requests share one round
    trip, and a request repeated a moment later is answered from the entry the first
    one left behind. A rejection is never retained — the entry is dropped as soon as
    the promise settles unfulfilled, so one transient failure is not replayed for
    five seconds.
  */
  const reads = new Map<string, { at: number; value: Promise<unknown> }>();

  function cached<T>(key: string, run: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const hit = reads.get(key);
    if (hit && now - hit.at < READ_WINDOW_MS) return hit.value as Promise<T>;

    // A miss is the natural moment to drop what has aged out. Without this the map
    // is a leak: nothing else evicts, and a long session browsing a large catalogue
    // would hold every response it ever read.
    for (const [old, entry] of reads) {
      if (now - entry.at >= READ_WINDOW_MS) reads.delete(old);
    }

    const value = run();
    reads.set(key, { at: now, value });
    value.catch(() => {
      // Only if this entry is still the one that failed: a later read may already
      // have replaced it.
      if (reads.get(key)?.value === value) reads.delete(key);
    });
    return value;
  }

  async function send<T>(
    method: "GET" | "POST" | "PATCH",
    path: string,
    description: string,
    body?: unknown,
    contentType = "application/json",
    apiVersion = API_VERSION,
    // Bytes, already base64. The connector decodes them and sends the raw content,
    // so the body must NOT be stringified on the way out.
    isBase64 = false,
  ): Promise<T> {
    const { organization, project } = await context();

    // The connector takes a project-relative URI; `_apis/...` paths that are
    // org-scoped rather than project-scoped start with a leading slash.
    const uri = path.startsWith("/")
      ? `${path}${path.includes("?") ? "&" : "?"}api-version=${apiVersion}`
      : `${project}/${path}${path.includes("?") ? "&" : "?"}api-version=${apiVersion}`;

    let result;
    try {
      result = await AzureDevOpsService.HttpRequest(organization, {
        Method: method as never,
        Uri: uri,
        Headers: { "Content-Type": contentType },
        Body: body === undefined ? undefined : isBase64 ? String(body) : JSON.stringify(body),
        ...(isBase64 ? { IsBase64: true } : {}),
      });
    } catch (cause) {
      throw classify(cause);
    }

    // Connector operations RESOLVE on failure rather than rejecting, so an
    // unchecked call looks exactly like success.
    try {
      return unwrap(result, description) as T;
    } catch (cause) {
      // ADO buries the real reason inside a nested JSON envelope; lift it out so the
      // message a person reads is one sentence rather than the whole payload.
      throw refineAdoError(cause, description);
    }
  }

  /**
   * A write invalidates every retained read.
   *
   * Coarse on purpose. A patch to a work item changes what its own read returns, but
   * it also changes the WIQL results it appears in, the batch projections that
   * hydrate it and the relations on the item at the other end of a link — so
   * evicting one key would leave the interesting staleness behind. There are at most
   * a handful of entries and they cost one round trip each to refill.
   */
  function mutate<T>(run: () => Promise<T>): Promise<T> {
    reads.clear();
    return run();
  }

  return {
    context,
    get<T>(path: string, description: string, apiVersion = API_VERSION): Promise<T> {
      return cached<T>(`GET ${apiVersion} ${path}`, () =>
        send<T>("GET", path, description, undefined, "application/json", apiVersion),
      );
    },
    read<T>(path: string, body: unknown, description: string, apiVersion = API_VERSION): Promise<T> {
      return cached<T>(`POST ${apiVersion} ${path} ${JSON.stringify(body)}`, () =>
        send<T>("POST", path, description, body, "application/json", apiVersion),
      );
    },
    post: (path, body, description, apiVersion) =>
      mutate(() => send("POST", path, description, body, "application/json", apiVersion)),
    // Work item create/update is JSON Patch, which needs its own content type;
    // sending plain application/json is accepted and then silently ignored.
    patch: (path, body, description, contentType = "application/json-patch+json") =>
      mutate(() => send("PATCH", path, description, body, contentType)),
    upload: (path, contentBase64, description) =>
      mutate(() =>
        send(
          "POST",
          path,
          description,
          contentBase64,
          "application/octet-stream",
          API_VERSION,
          true,
        ),
      ),
  };
}

/** A JSON Patch operation, as the work item API expects. */
export function addField(field: string, value: unknown) {
  return { op: "add", path: `/fields/${field}`, value };
}

export function assertConfigured(vars: EnvVars): void {
  if (!vars.adoOrganization || !vars.adoProject) {
    throw new AppError("Azure DevOps is not configured for this environment.", {
      category: "notFound",
    });
  }
}
