import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { powerApps } from "@microsoft/power-apps-vite/plugin";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig({
  // powerApps() injects the bootstrap the Power Platform host expects.
  // viteSingleFile() inlines everything into one index.html, which is the simplest
  // thing to host as a code app — at the cost of no code splitting, so watch the
  // bundle size and deep-import from packages rather than pulling whole barrels.
  plugins: [react(), powerApps(), viteSingleFile()],

  resolve: {
    alias: [
      // ORDER MATTERS: the subpath rule must precede the bare specifier, or the
      // bare rule swallows deep imports.
      {
        find: /^@innovation-backlog\/logic\/(.+)/,
        replacement: path.resolve(__dirname, "../../packages/logic/src/$1"),
      },
      {
        find: "@innovation-backlog/logic",
        replacement: path.resolve(__dirname, "../../packages/logic/src/index.ts"),
      },
      {
        find: /^@momentum\/ui\/(.+)/,
        replacement: path.resolve(__dirname, "../../packages/ui/src/$1"),
      },
      {
        find: "@momentum/ui",
        replacement: path.resolve(__dirname, "../../packages/ui/src/index.ts"),
      },
      {
        find: "@momentum/sdk",
        replacement: path.resolve(__dirname, "../../packages/sdk/src/index.ts"),
      },
      {
        find: "@momentum/contracts",
        replacement: path.resolve(__dirname, "../../packages/contracts/src/index.ts"),
      },
    ],
  },

  build: {
    outDir: "dist",
    emptyOutDir: true,
  },

  server: {
    host: "localhost",
    // Must stay in lockstep with localAppUrl in power.config.json, or
    // `pac code run` loads nothing and says nothing about why.
    port: 3002,
  },
});
