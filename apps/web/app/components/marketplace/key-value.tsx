// Danh sách nhãn – giá trị (canvas: `.kv`): nhãn bên trái (trên điện thoại thì ở trên), giá trị bên phải.
import type { ReactNode } from 'react';

export function KeyValueList({ children }: { children: ReactNode }) {
  return <dl className="flex flex-col divide-y divide-border">{children}</dl>;
}

export function KeyValue({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="grid gap-1 py-3 first:pt-0 last:pb-0 sm:grid-cols-[200px_minmax(0,1fr)] sm:gap-4">
      <dt className="text-small text-muted-foreground">{label}</dt>
      <dd className="min-w-0 whitespace-pre-line">{children}</dd>
    </div>
  );
}
