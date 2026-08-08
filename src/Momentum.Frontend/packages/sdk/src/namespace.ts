/**
 * Central namespace constants for the Momentum SDK.
 */

/** Lower-case slug used in tool names and URIs. */
export const NS_SLUG = "momentum";

/** Display name shown in headers and descriptions. */
export const NS_DISPLAY = "Momentum";

/** Environment variable prefix. */
export const NS_ENV = "MOMENTUM";

/** Prefix a tool name with the namespace slug. */
export function toolName(name: string): string {
  return `${NS_SLUG}_${name}`;
}

/** Build a `ui://momentum/{kind}/app.html` resource URI. */
export function appResourceUri(kind: string): string {
  return `ui://${NS_SLUG}/${kind}/app.html`;
}

/** Azure Storage or Azurite connection string used by Momentum processes. */
export const ENV_STORAGE_CONNECTION_STRING = `${NS_ENV}_STORAGE_CONNECTION_STRING`;

/** Build an MCP URI for a resource. */
export function mcpUri(kind: string, id?: string): string {
  return id ? `${NS_SLUG}://${kind}/${id}` : `${NS_SLUG}://${kind}`;
}
