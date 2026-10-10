import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  // Local dev reads the live data, as the deployed site does through vercel.json's rewrite.
  server: { proxy: { "/data": { target: "https://rofnqrehqsduqz7m.public.blob.vercel-storage.com", changeOrigin: true } } },
});
