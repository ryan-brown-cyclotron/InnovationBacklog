import React from "react";
import { createRoot } from "react-dom/client";
import { MomentumContextProvider } from "@momentum/sdk";
import { App } from "@momentum/ui";
import type { IService } from "@momentum/sdk";

const service: IService = {
  callTool: async (name: string, args?: Record<string, unknown>) => {
    const [method, ...routeParts] = name.split(":");
    const route = routeParts.join(":");
    const path = route ? `/api/${route}` : "/api";
    const init: RequestInit = {
      method: method || "GET",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    };
    const body = args?.body;
    if (body !== undefined && method !== "GET") {
      init.body = JSON.stringify(body);
    }
    const response = await fetch(path, init);
    if (!response.ok) {
      throw new Error(await response.text());
    }
    // 204s (remove vote, unlink) carry no body — parsing one would throw.
    if (response.status === 204) return null;
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  },
};

createRoot(document.getElementById("app")!).render(
  <MomentumContextProvider service={service}>
    <App />
  </MomentumContextProvider>,
);
