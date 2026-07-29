import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],

  // Required for the GitHub Pages repository path.
  base: "/EES-Pharma-Process-Twin/",

  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
  },
});
