// Đóng pipe chuyển tiếp Docker mà global-setup.ts có thể đã mở.
export default async function globalTeardown(): Promise<void> {
  const server = globalThis.__dockerPipeProxy;
  if (!server) return;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  globalThis.__dockerPipeProxy = undefined;
}
