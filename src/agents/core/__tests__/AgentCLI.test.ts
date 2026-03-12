/**
 * Unit tests for AgentCLI double dash delimiter functionality
 */

import { describe, it, expect, vi } from 'vitest';
import { AgentCLI } from '../AgentCLI.js';

// Mock adapter for testing
const mockAdapter = {
  name: 'test-agent',
  displayName: 'Test Agent',
  description: 'Test agent for unit tests',
  isInstalled: vi.fn().mockResolvedValue(true),
  getVersion: vi.fn().mockResolvedValue('1.0.0'),
  run: vi.fn().mockResolvedValue(undefined),
  ownedSubcommands: [],
};

describe('AgentCLI - splitOnDoubleDash', () => {
  // We need to test the private method via reflection
  const getSplitOnDoubleDash = (cli: AgentCLI) => {
    return (cli as any).splitOnDoubleDash.bind(cli);
  };

  it('should return all args when no -- delimiter is present', () => {
    const cli = new AgentCLI(mockAdapter);
    const splitOnDoubleDash = getSplitOnDoubleDash(cli);

    const argv = ['node', '/path/to/cli', '--profile', 'work', 'task', 'arg1'];
    const result = splitOnDoubleDash(argv);

    expect(result.cliArgs).toEqual(argv);
    expect(result.passThroughArgs).toEqual([]);
  });

  it('should split args when -- delimiter is present', () => {
    const cli = new AgentCLI(mockAdapter);
    const splitOnDoubleDash = getSplitOnDoubleDash(cli);

    const argv = ['node', '/path/to/cli', '--', 'mcp', 'add', '--transport', 'http', 'grep'];
    const result = splitOnDoubleDash(argv);

    expect(result.cliArgs).toEqual(['node', '/path/to/cli']);
    expect(result.passThroughArgs).toEqual(['mcp', 'add', '--transport', 'http', 'grep']);
  });

  it('should handle mixed CodeMie flags and agent flags', () => {
    const cli = new AgentCLI(mockAdapter);
    const splitOnDoubleDash = getSplitOnDoubleDash(cli);

    const argv = ['node', '/path/to/cli', '--profile', 'work', '--', 'mcp', 'add', '--transport', 'http'];
    const result = splitOnDoubleDash(argv);

    expect(result.cliArgs).toEqual(['node', '/path/to/cli', '--profile', 'work']);
    expect(result.passThroughArgs).toEqual(['mcp', 'add', '--transport', 'http']);
  });

  it('should handle -- as the first argument', () => {
    const cli = new AgentCLI(mockAdapter);
    const splitOnDoubleDash = getSplitOnDoubleDash(cli);

    const argv = ['node', '/path/to/cli', '--', 'all', 'args', '--pass-through'];
    const result = splitOnDoubleDash(argv);

    expect(result.cliArgs).toEqual(['node', '/path/to/cli']);
    expect(result.passThroughArgs).toEqual(['all', 'args', '--pass-through']);
  });

  it('should handle empty arguments after --', () => {
    const cli = new AgentCLI(mockAdapter);
    const splitOnDoubleDash = getSplitOnDoubleDash(cli);

    const argv = ['node', '/path/to/cli', '--profile', 'work', '--'];
    const result = splitOnDoubleDash(argv);

    expect(result.cliArgs).toEqual(['node', '/path/to/cli', '--profile', 'work']);
    expect(result.passThroughArgs).toEqual([]);
  });

  it('should only use first -- when multiple are present', () => {
    const cli = new AgentCLI(mockAdapter);
    const splitOnDoubleDash = getSplitOnDoubleDash(cli);

    const argv = ['node', '/path/to/cli', '--', 'first', '--', 'second'];
    const result = splitOnDoubleDash(argv);

    expect(result.cliArgs).toEqual(['node', '/path/to/cli']);
    expect(result.passThroughArgs).toEqual(['first', '--', 'second']);
  });

  it('should not treat --- as delimiter', () => {
    const cli = new AgentCLI(mockAdapter);
    const splitOnDoubleDash = getSplitOnDoubleDash(cli);

    const argv = ['node', '/path/to/cli', '---triple', 'dash', 'arg'];
    const result = splitOnDoubleDash(argv);

    expect(result.cliArgs).toEqual(argv);
    expect(result.passThroughArgs).toEqual([]);
  });

  it('should handle task flag before -- delimiter', () => {
    const cli = new AgentCLI(mockAdapter);
    const splitOnDoubleDash = getSplitOnDoubleDash(cli);

    const argv = ['node', '/path/to/cli', '--task', 'hello world', '--', 'extra', 'args'];
    const result = splitOnDoubleDash(argv);

    expect(result.cliArgs).toEqual(['node', '/path/to/cli', '--task', 'hello world']);
    expect(result.passThroughArgs).toEqual(['extra', 'args']);
  });

  it('should handle multiple CodeMie flags before -- delimiter', () => {
    const cli = new AgentCLI(mockAdapter);
    const splitOnDoubleDash = getSplitOnDoubleDash(cli);

    const argv = [
      'node', '/path/to/cli',
      '--profile', 'work',
      '--model', 'claude-3-5-sonnet-20241022',
      '--status',
      '--',
      'mcp', 'list'
    ];
    const result = splitOnDoubleDash(argv);

    expect(result.cliArgs).toEqual([
      'node', '/path/to/cli',
      '--profile', 'work',
      '--model', 'claude-3-5-sonnet-20241022',
      '--status'
    ]);
    expect(result.passThroughArgs).toEqual(['mcp', 'list']);
  });

  it('should preserve pass-through arguments with special characters', () => {
    const cli = new AgentCLI(mockAdapter);
    const splitOnDoubleDash = getSplitOnDoubleDash(cli);

    const argv = ['node', '/path/to/cli', '--', 'https://example.com', '--flag=value', 'arg-with-dash'];
    const result = splitOnDoubleDash(argv);

    expect(result.cliArgs).toEqual(['node', '/path/to/cli']);
    expect(result.passThroughArgs).toEqual(['https://example.com', '--flag=value', 'arg-with-dash']);
  });
});
