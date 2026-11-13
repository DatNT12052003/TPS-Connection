// Biến môi trường đưa vào mã chạy trên trình duyệt (tiền tố VITE_). Không đặt bí mật ở đây.
interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
