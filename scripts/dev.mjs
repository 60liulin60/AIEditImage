import { spawn } from 'node:child_process';
import net from 'node:net';

const mysqlPort = Number(process.env.AIEDITIMAGE_MYSQL_PORT ?? 3307);
const backendOnly = process.argv.includes('--backend-only');
const children = [];

function createEnv() {
  // 统一把临时目录放到仓库内，规避 Windows 用户目录权限问题。
  return {
    ...process.env,
    TEMP: process.env.TEMP || 'E:\\otherObeject\\AIEditImage\\.tmp',
    TMP: process.env.TMP || 'E:\\otherObeject\\AIEditImage\\.tmp',
  };
}

function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    socket.once('connect', () => {
      socket.end();
      resolve(true);
    });
    socket.once('error', () => {
      socket.destroy();
      resolve(false);
    });
  });
}

function spawnProcess(name, command, args) {
  const child = spawn(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: createEnv(),
  });

  children.push(child);

  child.on('exit', (code) => {
    if (code && code !== 0) {
      console.error(`${name} 已退出，退出码：${code}`);
      shutdown(code);
    }
  });

  return child;
}

function runCommand(name, command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env: createEnv(),
    });

    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${name} 执行失败，退出码：${code}`));
    });
  });
}

function waitForPort(port, timeoutMs = 240_000) {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const tryConnect = () => {
      const socket = net.createConnection({ host: '127.0.0.1', port });
      socket.once('connect', () => {
        socket.end();
        resolve();
      });
      socket.once('error', () => {
        socket.destroy();
        if (Date.now() - startedAt > timeoutMs) {
          reject(new Error(`等待 MySQL 端口 ${port} 超时，请查看上方 MySQL 日志。`));
          return;
        }
        setTimeout(tryConnect, 1000);
      });
    };

    tryConnect();
  });
}

async function prepareBackendDatabase() {
  console.log('同步 Prisma 表结构...');
  await runCommand('Prisma db push', 'pnpm', ['--filter', '@aieditimage/backend', 'db:sync']);
  console.log('初始化管理员账号...');
  await runCommand('seed admin', 'pnpm', ['seed:admin']);
}

function shutdown(code = 0) {
  // 开发命令退出时同步停止 MySQL、后端和前端子进程。
  for (const child of children) {
    if (!child.killed) {
      child.kill('SIGINT');
    }
  }
  process.exit(code);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

if (await isPortOpen(mysqlPort)) {
  console.log(`检测到 MySQL 已在 localhost:${mysqlPort} 运行，直接复用。`);
} else {
  console.log('启动 pnpm 管理的本地 MySQL，首次运行可能需要下载 MySQL 二进制...');
  spawnProcess('mysql', 'pnpm', ['mysql']);
}

try {
  await waitForPort(mysqlPort);
  console.log(`MySQL 已就绪：localhost:${mysqlPort}`);
  await prepareBackendDatabase();
  spawnProcess('backend', 'pnpm', ['dev:backend:nest']);
  if (!backendOnly) {
    spawnProcess('frontend', 'pnpm', ['dev:frontend']);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  shutdown(1);
}
