#!/usr/bin/env node
// Sinh tokens.css từ design-tokens/tokens.json (bản sao của TPS-Connection Design System, D49).
//   node design-tokens/build.mjs          ghi lại tokens.css
//   node design-tokens/build.mjs --check  báo lỗi nếu tokens.css lệch với tokens.json (dùng trong CI)
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = JSON.parse(readFileSync(join(pkgDir, 'design-tokens/tokens.json'), 'utf8'));
const outFile = join(pkgDir, 'tokens.css');

// Ánh xạ biến shadcn/ui -> token TPS, theo bảng "Dùng với Tailwind và shadcn/ui" trong README của hệ thống thiết kế.
const SHADCN = {
  background: 'bg',
  foreground: 'text',
  card: 'surface',
  'card-foreground': 'text',
  popover: 'surface-raised',
  'popover-foreground': 'text',
  primary: 'primary',
  'primary-foreground': 'primary-fg',
  secondary: 'surface-sunken',
  'secondary-foreground': 'text',
  muted: 'surface-sunken',
  'muted-foreground': 'text-muted',
  // "accent" của shadcn là nền khi di chuột, KHÔNG phải màu cam accent của TPS.
  accent: 'primary-subtle',
  'accent-foreground': 'primary-subtle-fg',
  destructive: 'danger-solid',
  'destructive-foreground': 'danger-solid-fg',
  border: 'border',
  input: 'border-strong',
  ring: 'focus-ring',
};
const SHADCN_RADIUS = 'radius-md';

// Cỡ chữ trên điện thoại (dưới bp-md). README: display 36 -> 28, h1 28 -> 24.
// tokens.json không ghi line-height cho cỡ này; dùng bước 8 px như các cỡ khác (28/36, 24/32).
const MOBILE_TYPE = {
  display: { fontSize: '28px', lineHeight: '36px' },
  h1: { fontSize: '24px', lineHeight: '32px' },
};

const fail = (msg) => {
  console.error(`tokens: ${msg}`);
  process.exit(1);
};

const themes = source.color.themes.map((t) => t.id);
if (themes[0] !== 'light' || !themes.includes('dark'))
  fail('cần hai theme "light" (đầu tiên) và "dark"');

const colorNames = new Set(source.color.tokens.map((t) => t.name));
const themed = (value, theme) =>
  typeof value === 'string' ? value : (value[theme] ?? value[themes[0]]);
const resolveColor = (value) => {
  const alias = /^\{(.+)\}$/.exec(value);
  if (!alias) return value;
  if (!colorNames.has(alias[1])) fail(`alias tới token không tồn tại: ${value}`);
  return `var(--tps-${alias[1]})`;
};

const decl = (name, value) => `  --tps-${name}: ${value};`;
const block = (selector, lines) => `${selector} {\n${lines.join('\n')}\n}`;
const indent = (text) => text.replace(/^/gm, '  ');

function themeLines(theme) {
  const lines = [`  color-scheme: ${theme};`];
  for (const t of source.color.tokens)
    lines.push(decl(t.name, resolveColor(themed(t.value, theme))));
  for (const t of source.shadow?.tokens ?? []) lines.push(decl(t.name, themed(t.value, theme)));
  return lines;
}

function staticLines() {
  const lines = [];
  for (const [key, family] of Object.entries(source.type.families))
    lines.push(decl(`font-${key}`, family));
  for (const group of source.type.groups) {
    for (const s of group.styles) {
      lines.push(decl(`text-${s.name}-size`, s.fontSize));
      lines.push(decl(`text-${s.name}-line-height`, s.lineHeight));
      lines.push(decl(`text-${s.name}-weight`, String(s.fontWeight)));
      lines.push(decl(`text-${s.name}-letter-spacing`, s.letterSpacing ?? 'normal'));
    }
  }
  for (const family of ['spacing', 'radius', 'size', 'breakpoint']) {
    for (const t of source[family]?.tokens ?? []) lines.push(decl(t.name, t.value));
  }
  return lines;
}

function shadcnLines() {
  const lines = [];
  for (const [shadcn, tps] of Object.entries(SHADCN)) {
    if (!colorNames.has(tps))
      fail(`ánh xạ shadcn --${shadcn} trỏ tới token màu không tồn tại: ${tps}`);
    lines.push(`  --${shadcn}: var(--tps-${tps});`);
  }
  if (!source.radius.tokens.some((t) => t.name === SHADCN_RADIUS))
    fail(`không có token ${SHADCN_RADIUS}`);
  lines.push(`  --radius: var(--tps-${SHADCN_RADIUS});`);
  return lines;
}

const styleNames = new Set(source.type.groups.flatMap((g) => g.styles.map((s) => s.name)));
const mobileLines = Object.entries(MOBILE_TYPE).flatMap(([name, s]) => {
  if (!styleNames.has(name)) fail(`MOBILE_TYPE nhắc tới kiểu chữ không tồn tại: ${name}`);
  return [decl(`text-${name}-size`, s.fontSize), decl(`text-${name}-line-height`, s.lineHeight)];
});
const bpMd = source.breakpoint.tokens.find((t) => t.name === 'bp-md')?.value;
if (!bpMd) fail('không có token bp-md');

const css = `/* ${source.name} — sinh từ design-tokens/tokens.json. KHÔNG sửa tay: sửa tokens.json rồi chạy \`npm run tokens -w @tps/config\`. */

/* Chế độ sáng (mặc định) và các token không phụ thuộc chế độ. */
${block(':root', [...themeLines('light'), '', ...staticLines(), '', '  /* shadcn/ui */', ...shadcnLines()])}

/* Chế độ tối: theo hệ điều hành khi người dùng chưa chọn, hoặc khi <html data-theme="dark">. */
@media (prefers-color-scheme: dark) {
${indent(block(':root:not([data-theme="light"])', themeLines('dark')))}
}

${block(':root[data-theme="dark"]', themeLines('dark'))}

/* Điện thoại (dưới bp-md = ${bpMd}): tiêu đề nhỏ lại. */
@media (max-width: ${parseFloat(bpMd) - 0.02}px) {
${indent(block(':root', mobileLines))}
}
`;

if (process.argv.includes('--check')) {
  let current = '';
  try {
    current = readFileSync(outFile, 'utf8');
  } catch {
    // chưa có tệp: coi như lệch
  }
  if (current !== css)
    fail('tokens.css lệch với tokens.json. Chạy `npm run tokens -w @tps/config`.');
  console.log('tokens: tokens.css khớp với tokens.json');
} else {
  writeFileSync(outFile, css);
  console.log(`tokens: đã ghi ${outFile}`);
}
