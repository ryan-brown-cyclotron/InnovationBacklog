import React from "react";
import { createRoot } from "react-dom/client";
import { useApp, useHostStyles } from "@modelcontextprotocol/ext-apps/react";
import { App } from "@momentum/ui";
import { MomentumContextProvider, type IService } from "@momentum/sdk";

function Root() {
  const { app, error } = useApp({
    appInfo: { name: "momentum-board", version: "1.0.0" },
    capabilities: {},
  });
  useHostStyles(app, app?.getHostContext());

  if (error) {
    return <div role="alert">Unable to connect to the MCP host: {error.message}</div>;
  }

  if (!app) {
    return <div role="status">Connecting to the MCP host...</div>;
  }

  const service: IService = {
    callTool: (toolName, args) => app.callServerTool({ name: toolName, arguments: args ?? {} }),
  };

  return (
    <MomentumContextProvider service={service}>
      <App />
    </MomentumContextProvider>
  );
}

createRoot(document.getElementById("app")!).render(<Root />);
