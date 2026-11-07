import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/ESMO-/",
  plugins: [react()],
  // The canonical CS simulation imports presentation modules. Worker bundles
  // must not execute Vite's CSS-to-document injector; the page still owns CSS.
  worker: {
    plugins: () => [{
      name: "worker-presentation-css-boundary",
      enforce: "pre",
      resolveId(id) {
        if (/\.css(?:\?|$)/.test(id)) return "\0worker-presentation-css";
        return null;
      },
      load(id) {
        return id === "\0worker-presentation-css" ? "export {};" : null;
      },
    }],
  },
  server: { host: true },
});
