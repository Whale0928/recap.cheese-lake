import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
        privacy: "privacy/index.html",
        terms: "terms/index.html",
        prototypeRecap: "prototype/recap.html"
      }
    }
  },
  server: {
    host: "0.0.0.0",
    port: 5273,
    strictPort: true,
    proxy: {
      "/api": "http://localhost:8180",
      "/auth": "http://localhost:8180",
      "/robots.txt": "http://localhost:8180"
    }
  }
});
