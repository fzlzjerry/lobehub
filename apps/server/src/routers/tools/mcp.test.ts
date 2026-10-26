// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { mcpRouter } from './mcp';

const mockReadUiResource = vi.hoisted(() => vi.fn());

vi.mock('@/libs/trpc/lambda/middleware', () => ({
  serverDatabase: vi.fn(function (opts: any) {
    return opts.next({ ctx: opts.ctx });
  }),
  telemetry: vi.fn(function (opts: any) {
    return opts.next({ ctx: opts.ctx });
  }),
}));

vi.mock('@/server/services/file', () => ({
  FileService: vi.fn(function () {
    return {};
  }),
}));

vi.mock('@/server/services/mcp', () => ({
  mcpService: { readUiResource: mockReadUiResource },
}));

describe('tools mcpRouter.readUiResource', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reads the view through the MCP service, credentials in the mutation input', async () => {
    const caller = mcpRouter.createCaller({ serverDB: {}, userId: 'user-1' } as any);
    const view = { contents: [{ text: '<html />', uri: 'ui://weather/view.html' }] };
    mockReadUiResource.mockResolvedValue(view);
    const params = {
      auth: { token: 'secret', type: 'bearer' as const },
      name: 'weather-demo',
      type: 'http' as const,
      url: 'https://mcp.example.com/mcp',
    };

    await expect(caller.readUiResource({ params, uri: 'ui://weather/view.html' })).resolves.toEqual(
      view,
    );

    expect(mockReadUiResource).toHaveBeenCalledWith(params, 'ui://weather/view.html');
  });
});
