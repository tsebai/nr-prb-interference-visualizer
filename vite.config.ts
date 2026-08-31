import { defineConfig } from "vite";

export default defineConfig({
  base: "/tools/nr-prb-interference-visualizer/",
  build: {
    manifest: true,
    modulePreload: { polyfill: false },
    sourcemap: true,
    target: "es2022",
    rollupOptions: {
      input: "index.html",
      output: {
        entryFileNames: "assets/nr-prb-visualizer.js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: (asset) =>
          asset.names.some((name) => name.endsWith(".css"))
            ? "assets/nr-prb-visualizer.css"
            : "assets/[name]-[hash][extname]",
      },
    },
  },
  server: {
    headers: {
      "Cache-Control": "no-store",
    },
  },
});
