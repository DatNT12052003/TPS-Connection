import { createConfig } from './eslint/index.js';

export default createConfig({
  tsconfigRootDir: import.meta.dirname,
  // Script CLI: in kết quả ra terminal là chủ ý.
  extra: [{ files: ['design-tokens/**'], rules: { 'no-console': 'off' } }],
});
