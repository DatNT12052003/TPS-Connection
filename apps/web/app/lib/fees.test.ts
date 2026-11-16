import type { FeeStatement } from '@tps/shared';
import { describe, expect, it } from 'vitest';
import { currentMonth, monthFromUrl, shiftMonth, shortMonth, statementBadge } from './fees';

const statement = (overrides: Partial<FeeStatement> = {}): FeeStatement => ({
  id: '0193a1b2-0000-7000-8000-0000000000f2',
  month: '2026-10',
  status: 'issued',
  billableSessions: 3,
  totalAmountVnd: 800_000,
  paidAmountVnd: 0,
  pendingAmountVnd: 0,
  balanceVnd: 800_000,
  dueDate: '2026-11-05',
  overdue: false,
  issuedAt: '2026-11-01T00:00:00.000Z',
  voidedAt: null,
  voidReason: null,
  awaitingMe: false,
  ...overrides,
});

describe('fee months', () => {
  it('uses Vietnam time for the current month', () => {
    // 31/10 18:00 UTC là 01/11 01:00 giờ Việt Nam.
    expect(currentMonth(Date.parse('2026-10-31T18:00:00Z'))).toBe('2026-11');
  });

  it('moves across years', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-05', 0)).toBe('2026-05');
    expect(shortMonth('2026-10')).toBe('10/2026');
  });

  it('falls back to the current month for a bad URL value', () => {
    const now = Date.parse('2026-11-16T03:00:00Z');
    expect(monthFromUrl(new URL('http://x/app/fees?month=2026-13'), now)).toBe('2026-11');
    expect(monthFromUrl(new URL('http://x/app/fees?month=2026-02'), now)).toBe('2026-02');
  });
});

describe('statement badge', () => {
  it('puts what the viewer must do first, then overdue, then the status', () => {
    expect(statementBadge(null).variant).toBe('neutral');
    expect(statementBadge(statement({ awaitingMe: true, overdue: true })).label).toEqual({
      key: 'fees.badgeAwaitingMe',
    });
    expect(statementBadge(statement({ overdue: true })).variant).toBe('danger');
    expect(statementBadge(statement({ status: 'paid' })).label).toEqual({ status: 'paid' });
  });
});
