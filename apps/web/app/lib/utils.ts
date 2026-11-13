import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * Cỡ chữ riêng của TPS (preset @tps/config/tailwind.css). Phải khai báo cho tailwind-merge,
 * nếu không nó coi `text-h1` là màu chữ và xóa mất khi gặp `text-primary`.
 */
const TPS_TEXT_STYLES = [
  'display',
  'h1',
  'h2',
  'h3',
  'body-lg',
  'body',
  'body-strong',
  'small',
  'label',
  'overline',
];

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: TPS_TEXT_STYLES }],
    },
  },
});

/** Ghép class Tailwind, lớp sau thắng lớp trước khi xung đột (quy ước của shadcn/ui). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
