import { useCallback } from "react";
import { useMomentumContext } from "@momentum/sdk";

export function useApi(): <T>(path: string, init?: RequestInit) => Promise<T> {
  type ApiFn = <T>(path: string, init?: RequestInit) => Promise<T>;
  const { service } = useMomentumContext();

  return useCallback<ApiFn>(
    async <T,>(path: string, init?: RequestInit): Promise<T> => {
      const method = (init?.method ?? "GET").toUpperCase();
      const route = stripApiPrefix(path);
      const name = `${method}:${route}`;
      const args: Record<string, unknown> | undefined = init?.body
        ? { body: parseBody(init.body) }
        : undefined;
      return service.callTool(name, args) as Promise<T>;
    },
    [service],
  );
}

function stripApiPrefix(path: string): string {
  if (path.startsWith("/api/")) return path.slice(5);
  if (path.startsWith("api/")) return path.slice(4);
  return path;
}

function parseBody(body: BodyInit | null): unknown {
  if (typeof body === "string") {
    try {
      return JSON.parse(body);
    } catch {
      return body;
    }
  }
  return body;
}
