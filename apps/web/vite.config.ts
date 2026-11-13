import { reactRouter } from '@react-router/dev/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [tailwindcss(), reactRouter()],
  resolve: { tsconfigPaths: true },
  // localhost (không phải 127.0.0.1): khớp CORS_ORIGINS mặc định của API.
  server: { host: 'localhost', port: 5173, strictPort: true },
});
