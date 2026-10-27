/**
 * @vitest-environment happy-dom
 */
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import McpAppView from './McpAppView';

const { confirmAppMessage, confirmAppToolCall, gesture, invokeMcpToolCall, sendMessage } =
  vi.hoisted(() => ({
    confirmAppMessage: vi.fn(),
    confirmAppToolCall: vi.fn(),
    gesture: { value: false },
    invokeMcpToolCall: vi.fn(),
    sendMessage: vi.fn(),
  }));

vi.mock('react-i18next', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/libs/swr', () => ({
  useClientDataSWR: () => ({
    data: {
      contents: [
        {
          _meta: { ui: { permissions: { camera: {}, clipboardWrite: {}, microphone: {} } } },
          mimeType: 'text/html;profile=mcp-app',
          text: '<p>weather</p>',
          uri: 'ui://weather/view',
        },
      ],
    },
    isLoading: false,
  }),
}));

vi.mock('@/features/Conversation/store', () => ({
  useConversationStore: (selector: (s: unknown) => unknown) =>
    selector({ context: { agentId: 'agt_1' }, sendMessage }),
}));

vi.mock('@/hooks/useIsDark', () => ({ useIsDark: () => false }));

vi.mock('@/services/mcp', () => ({ mcpService: { invokeMcpToolCall } }));

vi.mock('@/store/tool', () => ({ getToolStoreState: () => ({}) }));

vi.mock('./appName', () => ({ mcpAppNameSelector: () => () => 'Weather Demo' }));

vi.mock('./confirm', () => ({ confirmAppMessage, confirmAppToolCall }));

vi.mock('./toolCallPolicy', () => ({ getAppToolCallPolicy: () => 'confirm' }));

vi.mock('./userGesture', () => ({
  createViewGestureGate: () => ({ dispose: vi.fn(), takeGestureIn: () => gesture.value }),
}));

const setup = () => {
  const { container } = render(
    <McpAppView
      apiName={'get_weather'}
      arguments={'{"city":"Paris"}'}
      fallback={<div>fallback</div>}
      identifier={'weather-demo'}
      resourceUri={'ui://weather/view'}
      result={{ content: 'sunny' }}
      toolCallId={'call_1'}
    />,
  );
  const iframe = container.querySelector('iframe')!;
  const target = iframe.contentWindow!;
  const posted = vi.spyOn(target, 'postMessage');

  /** Deliver a JSON-RPC message as if the view posted it. */
  const fromView = async (data: Record<string, unknown>) => {
    window.dispatchEvent(
      new MessageEvent('message', { data: { jsonrpc: '2.0', ...data }, source: target }),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
  };
  const response = (id: number) =>
    posted.mock.calls.map(([message]) => message as any).find((message) => message.id === id);
  const message = (id: number, text: string) =>
    fromView({
      id,
      method: 'ui/message',
      params: { content: [{ text, type: 'text' }], role: 'user' },
    });

  return { fromView, iframe, message, response };
};

describe('McpAppView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    gesture.value = false;
  });

  afterEach(() => {
    cleanup();
  });

  it('keeps powerful features off whatever permissions the view declares', () => {
    const { iframe } = setup();
    const allow = iframe.getAttribute('allow')!;

    for (const feature of ['camera', 'microphone', 'geolocation', 'clipboard-write']) {
      expect(allow).toContain(`${feature} 'none'`);
    }
    expect(iframe.getAttribute('sandbox')).toBe('allow-scripts allow-forms');
  });

  it('sends a message the user just sent from the view', async () => {
    gesture.value = true;
    const { message, response } = setup();

    await message(1, 'What should I wear?');

    expect(confirmAppMessage).not.toHaveBeenCalled();
    expect(sendMessage).toHaveBeenCalledWith({
      message: 'What should I wear?',
      metadata: { mcpAppSource: { identifier: 'weather-demo' } },
    });
    expect(response(1)?.result).toEqual({});
  });

  it('asks before sending a message posted without a gesture, and drops it when declined', async () => {
    confirmAppMessage.mockResolvedValue(false);
    const { message, response } = setup();

    await message(1, 'Posted on load');

    expect(confirmAppMessage).toHaveBeenCalledWith({
      appName: 'Weather Demo',
      text: 'Posted on load',
    });
    expect(sendMessage).not.toHaveBeenCalled();
    expect(response(1)?.result).toEqual({ isError: true });
  });

  it('refuses a second message while one is still pending', async () => {
    let confirmMessage!: (allowed: boolean) => void;
    confirmAppMessage.mockReturnValue(new Promise((resolve) => (confirmMessage = resolve)));
    const { message, response } = setup();

    await message(1, 'first');
    await message(2, 'second');
    expect(response(2)?.result).toEqual({ isError: true });
    expect(confirmAppMessage).toHaveBeenCalledTimes(1);

    confirmMessage(true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(response(1)?.result).toEqual({});
  });

  it('shows the app by name and the arguments before a tool call that needs approval', async () => {
    confirmAppToolCall.mockResolvedValue(false);
    const { fromView, response } = setup();

    await fromView({
      id: 1,
      method: 'tools/call',
      params: { arguments: { city: 'Rome' }, name: 'get_forecast' },
    });

    expect(confirmAppToolCall).toHaveBeenCalledWith({
      appName: 'Weather Demo',
      args: { city: 'Rome' },
      tool: 'get_forecast',
    });
    expect(invokeMcpToolCall).not.toHaveBeenCalled();
    expect(response(1)?.result.isError).toBe(true);
  });

  it('refuses a second tool call that needs approval while one is still waiting', async () => {
    let approveFirst!: (allowed: boolean) => void;
    confirmAppToolCall.mockReturnValueOnce(new Promise((resolve) => (approveFirst = resolve)));
    invokeMcpToolCall.mockResolvedValue({ content: 'rainy', success: true });
    const { fromView, response } = setup();
    const call = (id: number, city: string) =>
      fromView({
        id,
        method: 'tools/call',
        params: { arguments: { city }, name: 'get_forecast' },
      });

    await call(1, 'Rome');
    await call(2, 'Oslo');
    // No second modal on top of the first one
    expect(confirmAppToolCall).toHaveBeenCalledTimes(1);
    expect(response(2)?.result.isError).toBe(true);

    approveFirst(true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(invokeMcpToolCall).toHaveBeenCalledTimes(1);
    expect(response(1)?.result.isError).toBeFalsy();

    // Once answered, the next call asks again
    confirmAppToolCall.mockResolvedValueOnce(false);
    await call(3, 'Lima');
    expect(confirmAppToolCall).toHaveBeenCalledTimes(2);
  });

  it('runs an approved view tool call on this machine for local servers', async () => {
    confirmAppToolCall.mockResolvedValue(true);
    invokeMcpToolCall.mockResolvedValue({ content: 'rainy', success: true });
    const { fromView } = setup();

    await fromView({
      id: 1,
      method: 'tools/call',
      params: { arguments: { city: 'Rome' }, name: 'get_forecast' },
    });

    expect(invokeMcpToolCall).toHaveBeenCalledWith(
      expect.objectContaining({ apiName: 'get_forecast', identifier: 'weather-demo' }),
      { agentId: 'agt_1', localHttpOverIpc: true },
    );
  });
});
