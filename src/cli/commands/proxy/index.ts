/**
 * Proxy Command — expose CodeMie's SSO proxy as a standalone HTTP server
 * so external tools (Cursor, Windsurf, etc.) can be manually configured to use it.
 *
 * Subcommands:
 *   codemie proxy start [--port N] [--profile P] [--provider X]
 *   codemie proxy stop
 *   codemie proxy status
 *   codemie proxy env [--shell fish|bash|zsh] [-q]
 *   codemie proxy wrap <command> [args...]
 */
import { Command } from 'commander';
import chalk from 'chalk';
import { logger } from '../../../utils/logger.js';
import { startProxy, stopProxy, proxyStatus, wrapWithProxy } from './daemon.js';
import { printProxyEnv } from './env.js';

export function createProxyCommand(): Command {
  const command = new Command('proxy');

  command
    .description(
      'Run a standalone CodeMie SSO proxy for external tools (Cursor, Windsurf, etc.)',
    )
    .action(async () => {
      // Default action when no subcommand is given: show status
      try {
        await proxyStatus();
      } catch (error) {
        logger.error('Proxy status failed:', error);
        console.error(
          chalk.red(`\n✗ ${error instanceof Error ? error.message : String(error)}\n`),
        );
        process.exit(1);
      }
    });

  // ── start ───────────────────────────────────────────────────────────────────
  command.addCommand(
    new Command('start')
      .description('Start the proxy in the foreground (Ctrl+C to stop)')
      .option('--port <number>', 'Port to listen on (default: OS-assigned)', parseInt)
      .option('--profile <name>', 'Provider profile to use')
      .option('--provider <name>', 'Override provider')
      .action(async (opts: { port?: number; profile?: string; provider?: string }) => {
        try {
          await startProxy(opts);
        } catch (error) {
          logger.error('Proxy start failed:', error);
          console.error(
            chalk.red(`\n✗ ${error instanceof Error ? error.message : String(error)}\n`),
          );
          process.exit(1);
        }
      }),
  );

  // ── stop ────────────────────────────────────────────────────────────────────
  command.addCommand(
    new Command('stop').description('Stop the running proxy').action(async () => {
      try {
        await stopProxy();
      } catch (error) {
        logger.error('Proxy stop failed:', error);
        console.error(
          chalk.red(`\n✗ ${error instanceof Error ? error.message : String(error)}\n`),
        );
        process.exit(1);
      }
    }),
  );

  // ── status ──────────────────────────────────────────────────────────────────
  command.addCommand(
    new Command('status')
      .description('Show proxy status (running/stopped, port, uptime)')
      .action(async () => {
        try {
          await proxyStatus();
        } catch (error) {
          logger.error('Proxy status failed:', error);
          console.error(
            chalk.red(`\n✗ ${error instanceof Error ? error.message : String(error)}\n`),
          );
          process.exit(1);
        }
      }),
  );

  // ── env ─────────────────────────────────────────────────────────────────────
  command.addCommand(
    new Command('env')
      .description('Print ANTHROPIC_BASE_URL export commands (eval-friendly)')
      .option('--shell <type>', 'Shell type: bash, zsh, fish (default: auto-detected)')
      .option('-q, --quiet', 'Machine-readable output only — ideal for eval $(codemie proxy env)')
      .action(async (opts: { shell?: string; quiet?: boolean }) => {
        try {
          await printProxyEnv(opts);
        } catch (error) {
          logger.error('Proxy env failed:', error);
          console.error(
            chalk.red(`\n✗ ${error instanceof Error ? error.message : String(error)}\n`),
          );
          process.exit(1);
        }
      }),
  );

  // ── wrap ────────────────────────────────────────────────────────────────────
  command.addCommand(
    new Command('wrap')
      .description(
        'Start proxy, run external command with ANTHROPIC_BASE_URL set, stop proxy on exit',
      )
      .option('--port <number>', 'Port to listen on (default: OS-assigned)', parseInt)
      .option('--profile <name>', 'Provider profile to use')
      .option('--provider <name>', 'Override provider')
      .argument('<command>', 'External binary to run (e.g. cursor, windsurf)')
      .argument('[args...]', 'Arguments to pass to the binary')
      .action(
        async (
          externalCommand: string,
          args: string[],
          opts: { port?: number; profile?: string; provider?: string },
        ) => {
          try {
            await wrapWithProxy({ ...opts, command: externalCommand, args });
          } catch (error) {
            logger.error('Proxy wrap failed:', error);
            console.error(
              chalk.red(`\n✗ ${error instanceof Error ? error.message : String(error)}\n`),
            );
            process.exit(1);
          }
        },
      ),
  );

  return command;
}
