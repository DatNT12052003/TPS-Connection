import type { Config } from '@react-router/dev/config';

export default {
  // Public pages must reach search engines as complete HTML (D12).
  ssr: true,
} satisfies Config;
