import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 2000,
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: process.env.VITE_API_URL?.replace(/\/api\/?$/, "") || "http://localhost:5000",
        changeOrigin: true,
        secure: true,
      },
    },
  },
});
