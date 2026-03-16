import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const apiTarget = process.env.VITE_API_URL;

  return {
  server: {
    host: "::",
    port: 8080,
    proxy: apiTarget
      ? {
          "/api": {
            target: apiTarget,
            changeOrigin: true,
            secure: false,
          },
        }
      : undefined,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  };
});
