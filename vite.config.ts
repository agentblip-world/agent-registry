import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
  define: {
    "process.env": {},
    global: "globalThis",
  },
  resolve: {
    alias: {
      buffer: "buffer",
    },
  },
  build: {
    sourcemap: true,
  },
  css: {
    devSourcemap: true,
  },
  optimizeDeps: {
    esbuildOptions: {
      sourcemap: false,
    },
  },
});
