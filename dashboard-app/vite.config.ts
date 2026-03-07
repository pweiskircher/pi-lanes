import {defineConfig} from "vite";
import preact from "@preact/preset-vite";
import {resolve} from "node:path";

export default defineConfig({
  plugins: [preact()],
  server: {
    port: 4311,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:4310",
        changeOrigin: false,
      },
    },
  },
  build: {
    outDir: resolve(import.meta.dirname, "../dashboard/dist"),
    emptyOutDir: true,
  },
});
