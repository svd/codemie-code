/**
 * Proxy Env Formatter
 * Outputs shell-specific export commands for ANTHROPIC_BASE_URL and ANTHROPIC_AUTH_TOKEN,
 * so users can `eval $(codemie proxy env)` to configure their shell for external tools.
 */
import chalk from 'chalk';
import { isProxyRunning } from './daemon.js';

export type ShellType = 'bash' | 'zsh' | 'fish';

function detectShell(): ShellType {
  return (process.env.SHELL ?? '').includes('fish') ? 'fish' : 'bash';
}

function formatExports(url: string, shell: ShellType): string {
  if (shell === 'fish') {
    return [
      `set -x ANTHROPIC_BASE_URL ${url}`,
      `set -x ANTHROPIC_AUTH_TOKEN proxy-handled`,
    ].join('\n');
  }
  // bash and zsh use identical export syntax
  return [
    `export ANTHROPIC_BASE_URL=${url}`,
    `export ANTHROPIC_AUTH_TOKEN=proxy-handled`,
  ].join('\n');
}

export async function printProxyEnv(options: {
  shell?: string;
  quiet?: boolean;
}): Promise<void> {
  const { running, info } = await isProxyRunning();

  if (!running || !info) {
    console.error(chalk.red('\n✗ Proxy is not running. Start it first: codemie proxy start\n'));
    process.exit(1);
  }

  const shell = (options.shell as ShellType | undefined) ?? detectShell();
  const output = formatExports(info.url, shell);

  if (options.quiet) {
    // Machine-readable: just the export lines — ideal for eval $(...) usage
    console.log(output);
  } else {
    console.log(chalk.dim('\n# Run this to configure your shell:\n'));
    console.log(output);
    console.log(chalk.dim('\n# Or source it directly: eval $(codemie proxy env)\n'));
  }
}
