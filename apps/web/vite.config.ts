import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Bind every interface so a phone on the same Wi-Fi can open the dev
    // server. Vite then prints a "Network:" URL to use from the handset.
    // Note this is HTTP, so the service worker and the install prompt stay
    // off — those need HTTPS (or localhost). Deploy the static build to test
    // installed-PWA behaviour.
    host: true,
  },
  build: {
    target: "es2022",
    outDir: "dist",
    sourcemap: true,
  },
});
