// Danh sách entity TypeORM. Thêm entity mới vào đây (G2 trở đi).
// Quy ước: mọi @Column ghi rõ `type` (không dựa vào emitDecoratorMetadata, xem tsconfig.json).
export const ENTITIES: (abstract new (...args: never[]) => unknown)[] = [];
