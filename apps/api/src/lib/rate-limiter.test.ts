import { describe, expect, it } from '@jest/globals';
import { createMemoryRateLimiter } from './rate-limiter.js';

describe('memory rate limiter', () => {
  it('allows up to the limit within a window, then reports when to retry', async () => {
    let now = 0;
    const limiter = createMemoryRateLimiter(() => now);
    for (let i = 0; i < 3; i += 1) {
      expect((await limiter.hit('k', 3, 60)).allowed).toBe(true);
    }
    const blocked = await limiter.hit('k', 3, 60);
    expect(blocked).toEqual({ allowed: false, count: 4, retryAfterSeconds: 60 });

    now = 30_000;
    expect(await limiter.peek('k')).toEqual({ count: 4, retryAfterSeconds: 30 });

    now = 60_001;
    expect((await limiter.hit('k', 3, 60)).allowed).toBe(true);
  });

  it('counts keys separately and can be reset', async () => {
    const limiter = createMemoryRateLimiter();
    await limiter.hit('a', 1, 60);
    expect((await limiter.hit('b', 1, 60)).allowed).toBe(true);
    expect((await limiter.hit('a', 1, 60)).allowed).toBe(false);
    await limiter.reset('a');
    expect((await limiter.peek('a')).count).toBe(0);
  });
});
