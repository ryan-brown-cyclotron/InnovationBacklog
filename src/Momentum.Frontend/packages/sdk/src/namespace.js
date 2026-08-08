/**
 * Central namespace constants for the Momentum SDK.
 */
/** Lower-case slug used in tool names and URIs. */
export var NS_SLUG = "momentum";
/** Display name shown in headers and descriptions. */
export var NS_DISPLAY = "Momentum";
/** Environment variable prefix. */
export var NS_ENV = "MOMENTUM";
/** Prefix a tool name with the namespace slug. */
export function toolName(name) {
    return "".concat(NS_SLUG, "_").concat(name);
}
/** Build a `ui://momentum/{kind}/app.html` resource URI. */
export function appResourceUri(kind) {
    return "ui://".concat(NS_SLUG, "/").concat(kind, "/app.html");
}
/** Azure Storage or Azurite connection string used by Momentum processes. */
export var ENV_STORAGE_CONNECTION_STRING = "".concat(NS_ENV, "_STORAGE_CONNECTION_STRING");
/** Build an MCP URI for a resource. */
export function mcpUri(kind, id) {
    return id ? "".concat(NS_SLUG, "://").concat(kind, "/").concat(id) : "".concat(NS_SLUG, "://").concat(kind);
}
//# sourceMappingURL=namespace.js.map