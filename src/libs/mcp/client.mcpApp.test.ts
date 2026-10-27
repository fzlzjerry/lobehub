import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MCPClient } from './client';
import { MCP_APP_CLIENT_CAPABILITIES } from './mcpApp';

const { clientOptions, listTools } = vi.hoisted(() => ({
  clientOptions: [] as unknown[],
  listTools: vi.fn(),
}));

vi.mock('@modelcontextprotocol/client', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  Client: class {
    listTools = listTools;
    constructor(_info: unknown, options?: unknown) {
      clientOptions.push(options);
    }
  },
}));

const params = { name: 'weather', type: 'http' as const, url: 'https://mcp.example.com/mcp' };

beforeEach(() => {
  clientOptions.length = 0;
  listTools.mockReset();
});

describe('MCPClient MCP Apps capability', () => {
  it('announces the MCP Apps extension only when asked to', () => {
    new MCPClient(params);
    new MCPClient(params, { mcpApp: false });
    new MCPClient(params, { mcpApp: true });

    expect(clientOptions).toEqual([
      undefined,
      undefined,
      { capabilities: MCP_APP_CLIENT_CAPABILITIES },
    ]);
  });
});

describe('MCPClient.getToolUiResourceUri', () => {
  it('lists tools once and reads the view from the cached map', async () => {
    listTools.mockResolvedValue({
      tools: [
        { _meta: { ui: { resourceUri: 'ui://weather/view' } }, name: 'forecast' },
        { name: 'search' },
      ],
    });
    const client = new MCPClient(params, { mcpApp: true });

    await expect(client.getToolUiResourceUri('forecast')).resolves.toBe('ui://weather/view');
    await expect(client.getToolUiResourceUri('search')).resolves.toBeUndefined();
    expect(listTools).toHaveBeenCalledTimes(1);
  });

  it('does not list tools again on every call after a failed listing', async () => {
    listTools.mockRejectedValue(new Error('upstream 500'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const client = new MCPClient(params, { mcpApp: true });

    await expect(client.getToolUiResourceUri('forecast')).resolves.toBeUndefined();
    await expect(client.getToolUiResourceUri('forecast')).resolves.toBeUndefined();
    await expect(client.getToolUiResourceUri('forecast')).resolves.toBeUndefined();

    expect(listTools).toHaveBeenCalledTimes(1);
    consoleError.mockRestore();
  });

  it('picks views up again once a later listing succeeds', async () => {
    listTools.mockRejectedValueOnce(new Error('upstream 500'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const client = new MCPClient(params, { mcpApp: true });
    await client.getToolUiResourceUri('forecast');

    // e.g. a manifest refresh on the same session
    listTools.mockResolvedValue({
      tools: [{ _meta: { ui: { resourceUri: 'ui://weather/view' } }, name: 'forecast' }],
    });
    await client.listTools();

    await expect(client.getToolUiResourceUri('forecast')).resolves.toBe('ui://weather/view');
    consoleError.mockRestore();
  });
});
