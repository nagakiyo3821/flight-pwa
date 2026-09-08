import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: './',
  server: {
    // Cloudflare Quick Tunnel host changes every start
    allowedHosts: ['.trycloudflare.com'],
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: '飛行記録',
        short_name: '飛行記録',
        description: 'ドローン飛行点検・離着陸記録（ショートカット互換 JSON）',
        theme_color: '#1e5a78',
        background_color: '#f4f7f9',
        display: 'standalone',
        lang: 'ja',
        start_url: './',
        icons: [
          {
            src: 'pwa-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}'],
      },
    }),
  ],
})
