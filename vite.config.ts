import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // Relative base so the build works under github.io/<repo>/ and at a custom domain root.
  base: './',
  plugins: [react()],
})
