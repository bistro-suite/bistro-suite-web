import { defineConfig } from "vite";

export default defineConfig({
  base: "/",
  build: { outDir: "dist", sourcemap: false },
  server: {
    host: "0.0.0.0",
    proxy: {
      "/api": {
        target: process.env.VITE_API_PROXY_TARGET || "http://127.0.0.1:8000",
        changeOrigin: true,
      },
      "/sanctum": {
        target: process.env.VITE_API_PROXY_TARGET || "http://127.0.0.1:8000",
        changeOrigin: true,
      },
      "/storage": {
        target: process.env.VITE_API_PROXY_TARGET || "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
  },
  preview: { host: "0.0.0.0" },
});
