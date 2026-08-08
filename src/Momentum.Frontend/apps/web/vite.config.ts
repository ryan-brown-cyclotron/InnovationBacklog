import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import react from "@vitejs/plugin-react";
import path from "node:path";

const isDev = process.env.NODE_ENV === "development";

export default defineConfig({
  plugins: [react(), viteSingleFile()],
  resolve: {
    alias: {
      "@momentum/contracts": path.resolve(__dirname, "../../packages/contracts/src/index.ts"),
      // @momentum/ui reads the solution-kind specs from logic, so anything that
      // bundles ui from source needs this alias too.
      "@innovation-backlog/logic": path.resolve(__dirname, "../../packages/logic/src/index.ts"),
      "@momentum/sdk": path.resolve(__dirname, "../../packages/sdk/src/index.ts"),
      "@momentum/ui": path.resolve(__dirname, "../../packages/ui/src/index.ts"),
      "@momentum/ui/*": path.resolve(__dirname, "../../packages/ui/src/*"),
    },
  },
  build: {
    sourcemap: isDev ? "inline" : undefined,
    cssMinify: !isDev,
    minify: !isDev,
    rollupOptions: {
      input: path.resolve(__dirname, "index.html"),
    },
    outDir: path.resolve(__dirname, "../../../Momentum.Service/wwwroot/apps/web"),
    emptyOutDir: true,
  },
});
