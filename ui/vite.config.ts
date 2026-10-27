import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // 정적 자산(아이콘)은 public 대신 assets 에 둔다. 서빙 경로는 루트 그대로다.
  publicDir: "assets",
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
        privacy: "privacy/index.html",
        terms: "terms/index.html",
        recap: "recap/index.html",
        relationship: "recap/channel/index.html",
        shared: "recap/shared/index.html",
        relationshipPrototypes: "prototypes/relationship/index.html",
        me: "me/index.html"
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
