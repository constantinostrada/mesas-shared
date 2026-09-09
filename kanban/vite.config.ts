import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// Fixed port: the Supabase magic-link redirect URLs are allow-listed per
// origin (see supabase/config.toml).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5273, strictPort: true },
})
