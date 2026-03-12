/**
 * Proxy Daemon Helpers
 * PID-file-based lifecycle management for the standalone CodeMie proxy.
 */
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import chalk from 'chalk';
import { getCodemiePath } from '../../../utils/paths.js';
import { ConfigLoader } from '../../../utils/config.js';
import { CodeMieProxy } from '../../../providers/plugins/sso/proxy/sso.proxy.js';
import type { ProxyConfig } from '../../../providers/plugins/sso/proxy/proxy-types.js';

// ── PID File ─────────────────────────────────────────────────────────────────

export interface ProxyPidFile {
  pid: number;
  port: number;
  url: string;
  profile: string;
  targetApiUrl: string;
  startedAt: string; // ISO-8601
}

const PID_FILE = (): string => getCodemiePath('proxy.pid');

export async function writePidFile(data: ProxyPidFile): Promise<void> {
  await writeFile(PID_FILE(), JSON.stringify(data, null, 2), 'utf-8');
}

export async function readPidFile(): Promise<ProxyPidFile | null> {
  const p = PID_FILE();
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(await readFile(p, 'utf-8')) as ProxyPidFile;
  } catch {
    return null;
  }
}

export async function clearPidFile(): Promise<void> {
  const p = PID_FILE();
  if (existsSync(p)) await unlink(p);
}

// ── Process liveness ──────────────────────────────────────────────────────────

export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0); // signal 0 = probe only, does not kill
    return true;
  } catch {
    return false; // ESRCH = process not found
  }
}

export async function isProxyRunning(): Promise<{ running: boolean; info: ProxyPidFile | null }> {
  const info = await readPidFile();
  if (!info) return { running: false, info: null };
  const running = isProcessAlive(info.pid);
  if (!running) await clearPidFile(); // stale PID file — clean up
  return { running, info: running ? info : null };
}

// ── Shared config loader ──────────────────────────────────────────────────────

interface ResolvedProxyConfig {
  proxyConfig: ProxyConfig;
  displayBaseUrl: string;
  profileName: string;
}

async function loadProxyConfig(options: {
  port?: number;
  profile?: string;
  provider?: string;
}): Promise<ResolvedProxyConfig> {
  const config = await ConfigLoader.load(process.cwd(), {
    name: options.profile,
    provider: options.provider,
  });

  if (!config.baseUrl) {
    console.error(chalk.red('\n✗ No baseUrl configured. Run: codemie profile login\n'));
    process.exit(1);
  }

  const { CodeMieSSO } = await import('../../../providers/plugins/sso/sso.auth.js');
  const credentials = await new CodeMieSSO().getStoredCredentials(config.baseUrl);
  if (!credentials) {
    console.error(
      chalk.red(`\n✗ No SSO credentials for ${config.baseUrl}. Run: codemie profile login\n`),
    );
    process.exit(1);
  }

  const profileName = config.name ?? 'default';
  return {
    proxyConfig: {
      targetApiUrl: config.baseUrl,
      port: options.port,
      clientType: 'codemie-proxy',
      authMethod: 'sso',
      sessionId: randomUUID(),
      profile: profileName,
      provider: config.provider,
      model: config.model,
      version: process.env.npm_package_version,
      profileConfig: config,
    },
    displayBaseUrl: config.baseUrl,
    profileName,
  };
}

// ── startProxy ────────────────────────────────────────────────────────────────

export interface StartProxyOptions {
  port?: number;
  profile?: string;
  provider?: string;
}

export async function startProxy(options: StartProxyOptions): Promise<void> {
  const { running, info } = await isProxyRunning();
  if (running && info) {
    console.error(chalk.red(`\n✗ Proxy already running on port ${info.port} (PID ${info.pid})`));
    console.error(chalk.dim('  Stop it first: codemie proxy stop\n'));
    process.exit(1);
  }

  const { proxyConfig, displayBaseUrl, profileName } = await loadProxyConfig(options);
  const proxy = new CodeMieProxy(proxyConfig);
  const { port, url } = await proxy.start();

  await writePidFile({
    pid: process.pid,
    port,
    url,
    profile: profileName,
    targetApiUrl: displayBaseUrl,
    startedAt: new Date().toISOString(),
  });

  console.log(chalk.green(`\n✓ CodeMie proxy running at ${url}`));
  console.log(chalk.dim(`  Target:  ${displayBaseUrl}`));
  console.log(chalk.dim(`  Profile: ${profileName}  |  PID: ${process.pid}`));
  console.log(chalk.dim('\n  Configure Cursor / Windsurf:'));
  console.log(chalk.cyan(`    ANTHROPIC_BASE_URL=${url}`));
  console.log(chalk.cyan(`    ANTHROPIC_AUTH_TOKEN=proxy-handled`));
  console.log(chalk.dim('  Or run: eval $(codemie proxy env)'));
  console.log(chalk.dim('  Press Ctrl+C to stop.\n'));

  const shutdown = async (sig: string): Promise<void> => {
    console.log(chalk.dim(`\n  Received ${sig}, stopping proxy...`));
    try {
      await proxy.stop();
    } finally {
      await clearPidFile();
      console.log(chalk.green('  ✓ Proxy stopped.\n'));
      process.exit(0);
    }
  };

  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });

  // Block forever — proxy's HTTP server drives the event loop.
  // Signals above trigger the orderly shutdown.
  await new Promise<void>(() => {});
}

// ── stopProxy ─────────────────────────────────────────────────────────────────

export async function stopProxy(): Promise<void> {
  const { running, info } = await isProxyRunning();
  if (!running || !info) {
    console.log(chalk.yellow('\n  No running proxy found.\n'));
    return;
  }

  try {
    process.kill(info.pid, 'SIGTERM');
    // Wait up to 2 s for the process to exit cleanly
    let i = 0;
    while (i++ < 20 && isProcessAlive(info.pid)) {
      await new Promise((r) => setTimeout(r, 100));
    }
    if (isProcessAlive(info.pid)) process.kill(info.pid, 'SIGKILL');
  } catch {
    // Process may have already exited
  }

  await clearPidFile();
  console.log(chalk.green(`\n✓ Proxy stopped (was on port ${info.port}).\n`));
}

// ── proxyStatus ───────────────────────────────────────────────────────────────

export async function proxyStatus(): Promise<void> {
  const { running, info } = await isProxyRunning();
  if (!running || !info) {
    console.log(chalk.yellow('\n  Proxy is not running.\n'));
    console.log(chalk.dim('  Start with: codemie proxy start\n'));
    return;
  }

  const s = Math.round((Date.now() - new Date(info.startedAt).getTime()) / 1000);
  const uptime =
    s < 60
      ? `${s}s`
      : s < 3600
        ? `${Math.floor(s / 60)}m ${s % 60}s`
        : `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;

  console.log(chalk.green('\n  ✓ Proxy is running\n'));
  console.log(`  URL:     ${chalk.cyan(info.url)}`);
  console.log(`  Port:    ${info.port}`);
  console.log(`  Profile: ${info.profile}`);
  console.log(`  Target:  ${chalk.dim(info.targetApiUrl)}`);
  console.log(`  PID:     ${info.pid}   Uptime: ${uptime}`);
  console.log(chalk.dim('\n  Stop with: codemie proxy stop\n'));
}

// ── wrapWithProxy ─────────────────────────────────────────────────────────────

export interface WrapProxyOptions {
  port?: number;
  profile?: string;
  provider?: string;
  command: string;
  args: string[];
}

export async function wrapWithProxy(options: WrapProxyOptions): Promise<void> {
  const { running, info: existing } = await isProxyRunning();

  if (running && existing) {
    // Re-use a proxy that is already running
    console.log(chalk.dim(`  Re-using proxy at ${existing.url}`));
    await runExternalBinary(options.command, options.args, existing.url);
    return;
  }

  const { proxyConfig, displayBaseUrl, profileName } = await loadProxyConfig(options);
  const proxy = new CodeMieProxy(proxyConfig);
  const { port, url } = await proxy.start();

  await writePidFile({
    pid: process.pid,
    port,
    url,
    profile: profileName,
    targetApiUrl: displayBaseUrl,
    startedAt: new Date().toISOString(),
  });

  console.log(chalk.green(`✓ Proxy at ${url} — launching ${options.command}...`));
  try {
    await runExternalBinary(options.command, options.args, url);
  } finally {
    await proxy.stop();
    await clearPidFile();
    console.log(chalk.dim('  Proxy stopped.'));
  }
}

async function runExternalBinary(cmd: string, args: string[], proxyUrl: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: 'inherit',
      env: {
        ...process.env,
        ANTHROPIC_BASE_URL: proxyUrl,
        ANTHROPIC_AUTH_TOKEN: 'proxy-handled',
      },
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code !== null && code !== 0) process.exitCode = code;
      resolve();
    });

    // Forward signals to the child process
    process.on('SIGINT', () => child.kill('SIGINT'));
    process.on('SIGTERM', () => child.kill('SIGTERM'));
  });
}
