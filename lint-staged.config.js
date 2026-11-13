// Chạy trước mỗi commit (Husky, .husky/pre-commit), chỉ trên các tệp đã stage.
// - ESLint --fix chạy trong thư mục của từng package (mỗi package có eslint.config.js riêng).
// - Prettier chạy ở thư mục gốc để dùng .prettierignore gốc.
// Kiểm tra toàn bộ (type-check, test, build) để CI làm.
import { relative, sep } from 'node:path';

/** Thư mục package có ESLint -> tên workspace. Thêm package mới thì thêm vào đây. */
const ESLINT_WORKSPACES = {
  'apps/api': '@tps/api',
  'apps/web': '@tps/web',
  'packages/config': '@tps/config',
  'packages/shared': '@tps/shared',
};

const quote = (files) => files.map((file) => `"${file}"`).join(' ');

function eslintCommands(files) {
  const byWorkspace = new Map();
  for (const file of files) {
    const path = relative(process.cwd(), file).split(sep).join('/');
    const dir = Object.keys(ESLINT_WORKSPACES).find((d) => path.startsWith(`${d}/`));
    if (!dir) continue;
    byWorkspace.set(dir, [...(byWorkspace.get(dir) ?? []), file]);
  }
  return [...byWorkspace].flatMap(([dir, list]) => {
    const workspace = ESLINT_WORKSPACES[dir];
    const eslint = `npm exec -w ${workspace} -- eslint --fix --max-warnings=0 --no-warn-ignored ${quote(list)}`;
    // Route của web import kiểu sinh bởi react-router typegen; thiếu thì ESLint báo lỗi kiểu.
    return dir === 'apps/web' ? [`npm run typegen -w ${workspace}`, eslint] : [eslint];
  });
}

const prettier = (files) => `prettier --write --ignore-unknown ${quote(files)}`;

export default {
  // Một glob cho mã nguồn để ESLint và Prettier chạy lần lượt, không song song trên cùng tệp.
  '*.{ts,tsx,js,mjs,cjs}': (files) => [...eslintCommands(files), prettier(files)],
  '!(*.{ts,tsx,js,mjs,cjs})': (files) => prettier(files),
};
