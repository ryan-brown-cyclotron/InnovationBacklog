/**
 * Central namespace constants for the Momentum SDK.
 */
/** Lower-case slug used in tool names and URIs. */
export declare const NS_SLUG = "momentum";
/** Display name shown in headers and descriptions. */
export declare const NS_DISPLAY = "Momentum";
/** Environment variable prefix. */
export declare const NS_ENV = "MOMENTUM";
/** Prefix a tool name with the namespace slug. */
export declare function toolName(name: string): string;
/** Build a `ui://momentum/{kind}/app.html` resource URI. */
export declare function appResourceUri(kind: string): string;
/** Azure Storage or Azurite connection string used by Momentum processes. */
export declare const ENV_STORAGE_CONNECTION_STRING: string;
/** Build an MCP URI for a resource. */
export declare function mcpUri(kind: string, id?: string): string;
//# sourceMappingURL=namespace.d.ts.map