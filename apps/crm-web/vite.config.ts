import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(() => ({
  plugins: [react()],
  resolve: {
    extensions: [".tsx", ".ts", ".jsx", ".js", ".json"],
  },
  server: {
    host: "127.0.0.1",
    proxy: {
      "/api": {
        target: process.env.VITE_DEV_API_TARGET ?? "http://127.0.0.1:3000",
        changeOrigin: true,
      },
    },
  },
}));
