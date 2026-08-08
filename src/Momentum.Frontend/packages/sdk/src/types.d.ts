/**
 * Minimal UI-specific types for the Momentum SDK.
 */
/** Service interface for talking to the server. */
export interface IService {
    callTool(name: string, args?: Record<string, unknown>): Promise<unknown>;
}
//# sourceMappingURL=types.d.ts.map