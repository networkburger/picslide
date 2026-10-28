import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  server: { port: 5173, strictPort: true, allowedHosts: true },
  plugins: [
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/*.png", "icons/*.svg", "starters/*.svg"],
      manifest: {
        name: "PictureSlide",
        short_name: "PictureSlide",
        description: "Turn your photos into puzzles.",
        display: "fullscreen",
        orientation: "any",
        background_color: "#fff4e6",
        theme_color: "#ff7a59",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: { globPatterns: ["**/*.{js,css,html,svg,png,woff2}"] },
    }),
  ],
});
