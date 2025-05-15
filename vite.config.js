import { defineConfig } from "vite";
import glsl from "vite-plugin-glsl";

export default defineConfig({
  plugins: [glsl()],
  server: {
    proxy: {
      "/save": "http://localhost:3000", // Forward /save API requests to Express server
      "/random-pose": "http://localhost:3000", // Forward /random-pose API requests to Express server
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
  },
});
