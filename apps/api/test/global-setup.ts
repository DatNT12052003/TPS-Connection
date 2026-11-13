// Chạy một lần (tiến trình cha của Jest) trước mọi test.
//
// Testcontainers trên Windows chỉ tìm Docker ở pipe //./pipe/docker_engine, và không đọc được DOCKER_HOST
// dạng npipe:////./pipe/<tên> (nó parse bằng new URL(), làm rơi đoạn "/."). Một số bản Docker Desktop
// chỉ mở pipe của context đang dùng (ví dụ //./pipe/dockerDesktopLinuxEngine). Khi đó mở tạm pipe
// docker_engine, chuyển tiếp nguyên vẹn sang pipe thật; đóng lại ở global-teardown.ts.
import { execFileSync } from 'node:child_process';
import net from 'node:net';

const DEFAULT_PIPE = '//./pipe/docker_engine';

declare global {
  var __dockerPipeProxy: net.Server | undefined;
}

const canConnect = (path: string) =>
  new Promise<boolean>((resolve) => {
    const socket = net.connect(path);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
  });

/** Endpoint của Docker context hiện tại, dạng //./pipe/<tên>; undefined nếu không phải named pipe. */
function currentContextPipe(): string | undefined {
  try {
    const host = execFileSync(
      'docker',
      ['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 10_000 },
    ).trim();
    // npipe:////./pipe/<tên>  ->  //./pipe/<tên>
    return host.startsWith('npipe://') ? host.slice('npipe://'.length) : undefined;
  } catch {
    return undefined;
  }
}

export default async function globalSetup(): Promise<void> {
  if (process.platform !== 'win32' || process.env.DOCKER_HOST) return;
  if (await canConnect(DEFAULT_PIPE)) return;

  const target = currentContextPipe();
  if (!target || target === DEFAULT_PIPE || !(await canConnect(target))) return;

  const server = net.createServer((client) => {
    const upstream = net.connect(target);
    client.pipe(upstream).pipe(client);
    client.on('error', () => upstream.destroy());
    upstream.on('error', () => client.destroy());
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(DEFAULT_PIPE, resolve);
  });
  globalThis.__dockerPipeProxy = server;
}
