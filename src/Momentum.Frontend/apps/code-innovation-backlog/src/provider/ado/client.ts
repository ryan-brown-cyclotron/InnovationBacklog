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

export function createAdoClient(readEnv: () => Promise<EnvVars>): AdoClient {
  const context = () => requireAdoContext(readEnv);

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

  return {
    context,
    get: (path, description, apiVersion) =>
      send("GET", path, description, undefined, "application/json", apiVersion),
    post: (path, body, description, apiVersion) =>
      send("POST", path, description, body, "application/json", apiVersion),
    // Work item create/update is JSON Patch, which needs its own content type;
    // sending plain application/json is accepted and then silently ignored.
    patch: (path, body, description, contentType = "application/json-patch+json") =>
      send("PATCH", path, description, body, contentType),
    upload: (path, contentBase64, description) =>
      send(
        "POST",
        path,
        description,
        contentBase64,
        "application/octet-stream",
        API_VERSION,
        true,
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
