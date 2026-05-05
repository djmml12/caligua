import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  base: "./",

  plugins: [react()],

  resolve: {
    alias: {
      "@pos/ui-kit":     path.resolve(__dirname, "../../packages/ui-kit/src"),
      "@pos/types":      path.resolve(__dirname, "../../packages/types/src"),
      "@pos/api-client": path.resolve(__dirname, "../../packages/api-client/src"),
      "@pos/auth":       path.resolve(__dirname, "../../packages/auth/src"),
      "@pos/pos-core":   path.resolve(__dirname, "../../packages/pos-core/src"),
    },
  },

  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3000",
        changeOrigin: true,
      },
    },
  },

  preview: {
    host: "0.0.0.0",
    port: 4173,
  },

  build: {
    // jspdf + jspdf-autotable + xlsx suman ~1 MB minificado (generación
    // de reportes PDF/Excel en el cliente). Elevamos el límite para
    // evitar el warning de chunk durante el build de producción.
    chunkSizeWarningLimit: 1600,
  },
});
