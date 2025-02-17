import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "core-js-pure": "core-js-pure",
    },
  },
  build: {
    rollupOptions: {
      external: ["core-js-pure"],
    },
  },
});
