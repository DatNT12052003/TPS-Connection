import { useEffect, useState } from 'react';

/**
 * Đếm ngược theo giây (ví dụ "Gửi lại mã sau 45 giây"). Bắt đầu lại khi `seconds` hoặc `key` đổi.
 * Server render giá trị ban đầu; trình duyệt đếm tiếp sau khi tải JavaScript.
 */
export function useCountdown(seconds: number, key?: unknown): number {
  const [left, setLeft] = useState(Math.max(0, Math.ceil(seconds)));

  useEffect(() => {
    const deadline = Date.now() + Math.max(0, seconds) * 1000;
    const tick = () => setLeft(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [seconds, key]);

  return left;
}
