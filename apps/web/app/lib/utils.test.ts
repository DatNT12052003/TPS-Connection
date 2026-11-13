import { describe, expect, it } from 'vitest';
import { cn } from './utils';

describe('cn', () => {
  it('keeps a TPS text style next to a text colour', () => {
    expect(cn('text-h1', 'text-primary')).toBe('text-h1 text-primary');
  });

  it('lets the later text style win', () => {
    expect(cn('text-lg', 'text-body-lg')).toBe('text-body-lg');
  });

  it('lets the later border colour win', () => {
    expect(cn('border-transparent', 'border-border-strong')).toBe('border-border-strong');
  });
});
