import { reactRouter } from '@react-router/dev/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [tailwindcss(), reactRouter()],
  resolve: { tsconfigPaths: true },
  server: {
    // localhost (không phải 127.0.0.1): khớp CORS_ORIGINS mặc định của API.
    host: 'localhost',
    port: 5173,
    strictPort: true,
    // Realtime (G5): trình duyệt kết nối Socket.IO cùng origin với web để gửi kèm cookie phiên; dev server chuyển
    // tiếp tới API, giữ nguyên header Origin (API kiểm tra Origin). Khi triển khai, reverse proxy làm việc này.
    proxy: {
      '/socket.io': { target: process.env.API_URL ?? 'http://127.0.0.1:3000', ws: true },
    },
  },
});
