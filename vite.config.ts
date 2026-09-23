import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  build: { outDir: "dist/client" },
  server: {
    host: "127.0.0.1", port: Number(process.env.DEV_UI_PORT || 5173), strictPort: true,
    proxy: { "/api": { target: `http://127.0.0.1:${process.env.PORT || 3001}`, changeOrigin: false } },
  },
});
