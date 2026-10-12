import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    host: "0.0.0.0",
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
      "/chat": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
      "/health": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
      "/sessions": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
      "/session": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
});
