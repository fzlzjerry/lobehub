'use client';

import { safeParseJSON } from '@lobechat/utils';
import { Skeleton } from '@lobehub/ui';
import { cssVar } from '@lobehub/ui/stylex/cssVar.stylex';
import { type AppBridge } from '@modelcontextprotocol/ext-apps/app-bridge';
import * as stylex from '@stylexjs/stylex';
import { useLatest } from 'ahooks';
import { memo, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useConversationStore } from '@/features/Conversation/store';
import { useIsDark } from '@/hooks/useIsDark';
import { useClientDataSWR } from '@/libs/swr';
import { mcpAppKeys } from '@/libs/swr/keys';
import { mcpService } from '@/services/mcp';
import { getToolStoreState } from '@/store/tool';

import { mcpAppNameSelector } from './appName';
import { buildHostContext, connectMcpAppBridge } from './bridge';
import { confirmAppMessage, confirmAppToolCall } from './confirm';
import { getAppToolCallPolicy } from './toolCallPolicy';
import { createViewGestureGate } from './userGesture';
import {
  APP_IFRAME_ALLOW,
  buildAppCsp,
  injectCsp,
  pickAppResource,
  toAppMessage,
  toCallToolResult,
} from './utils';

const DEFAULT_HEIGHT = 320;
const MAX_HEIGHT = 2000;

const styles = stylex.create({
  bordered: {
    overflow: 'hidden',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: cssVar.colorBorderSecondary,
    borderRadius: cssVar.borderRadiusLG,
    backgroundColor: cssVar.colorBgContainer,
    backgroundImage: 'none',
  },
  iframe: {
    display: 'block',
    width: '100%',
    borderWidth: '0',
    borderStyle: 'none',
    backgroundColor: 'transparent',
    backgroundImage: 'none',
  },
  iframeHeight: (height: string) => ({ height }),
});

export interface McpAppViewProps {
  apiName: string;
  /** Raw JSON arguments of the tool call. */
  arguments?: string;
  /** Rendered instead when the view can't be loaded. */
  fallback: ReactNode;
  identifier: string;
  resourceUri: string;
  /** Tool call result envelope (`{ content, state, success }`). */
  result: { content: string; state?: any };
  toolCallId: string;
}

const getAppName = (identifier: string, agentId?: string) =>
  mcpAppNameSelector(identifier, agentId)(getToolStoreState());

/**
 * Renders an MCP Apps (SEP-1865) view: the `ui://` HTML a tool declares, in a
 * sandboxed iframe that talks to LobeHub over the MCP Apps postMessage protocol.
 */
const McpAppView = memo<McpAppViewProps>(
  ({ apiName, arguments: args, fallback, identifier, resourceUri, result, toolCallId }) => {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const [height, setHeight] = useState(DEFAULT_HEIGHT);
    const isDark = useIsDark();
    const sendMessage = useConversationStore((s) => s.sendMessage);
    const agentId = useConversationStore((s) => s.context.agentId) || undefined;
    const { t } = useTranslation('plugin');

    const { data, error, isLoading } = useClientDataSWR(
      mcpAppKeys.resource(identifier, resourceUri, agentId),
      () => mcpService.readMcpAppResource(identifier, resourceUri, agentId),
      { revalidateOnFocus: false, revalidateOnReconnect: false },
    );

    const resource = useMemo(() => pickAppResource(data, resourceUri), [data, resourceUri]);
    const srcDoc = useMemo(
      () => resource && injectCsp(resource.html, buildAppCsp(resource.meta?.csp)),
      [resource],
    );

    // Everything the bridge reads after mount goes through a ref, so the
    // iframe session is created once per document instead of per render.
    const latest = useLatest({ agentId, args, identifier, isDark, result, sendMessage, t });
    const bridgeRef = useRef<AppBridge>(undefined);

    useEffect(() => {
      const iframe = iframeRef.current;
      const target = iframe?.contentWindow;
      if (!srcDoc || !iframe || !target) return;

      const gestures = createViewGestureGate();
      // One message at a time, so a view can't line up runs behind a pending one
      let sending = false;

      const { bridge, dispose } = connectMcpAppBridge(target, {
        // Views may only call tools on the server that rendered them, and
        // under the same approval rules as the conversation.
        callTool: async (name, toolArgs) => {
          const { agentId: currentAgentId, identifier: currentIdentifier, t: tr } = latest.current;
          const policy = getAppToolCallPolicy(currentIdentifier, name, {
            agentId: currentAgentId,
            toolArgs,
          });
          const allowed =
            policy === 'allow' ||
            (policy === 'confirm' &&
              (await confirmAppToolCall({
                appName: getAppName(currentIdentifier, currentAgentId),
                args: toolArgs,
                tool: name,
              })));

          if (!allowed) {
            return {
              content: [{ text: tr('mcpApp.toolCall.rejected', { tool: name }), type: 'text' }],
              isError: true,
            };
          }

          return toCallToolResult(
            await mcpService.invokeMcpToolCall(
              {
                apiName: name,
                arguments: JSON.stringify(toolArgs),
                id: `${toolCallId}:${name}`,
                identifier: currentIdentifier,
                type: 'mcp',
              },
              // The view's HTML came from this machine for a local server, so its calls do too
              { agentId: currentAgentId, localHttpOverIpc: true },
            ),
          );
        },
        hostContext: buildHostContext(latest.current.isDark),
        onSizeChange: (nextHeight) => setHeight(Math.min(nextHeight, MAX_HEIGHT)),
        // A message starts a billed run, and a view can post one on load (every
        // time the topic reopens). Without a gesture in the view just before,
        // the user confirms it first.
        sendMessage: async (text) => {
          if (sending) return false;
          // Read before anything async: the activation expires
          const fromUser = gestures.hasGestureIn(iframe);
          sending = true;
          try {
            const { agentId: currentAgentId, identifier: currentIdentifier } = latest.current;
            if (
              !fromUser &&
              !(await confirmAppMessage({
                appName: getAppName(currentIdentifier, currentAgentId),
                text,
              }))
            ) {
              return false;
            }

            await latest.current.sendMessage(toAppMessage(text, currentIdentifier));
            return true;
          } finally {
            sending = false;
          }
        },
        toolInput: () => safeParseJSON(latest.current.args || '{}') ?? {},
        toolResult: () => {
          const { result: toolResult } = latest.current;
          return toCallToolResult({ ...toolResult, success: !toolResult.state?.isError });
        },
      });
      bridgeRef.current = bridge;

      return () => {
        bridgeRef.current = undefined;
        gestures.dispose();
        dispose();
      };
    }, [latest, srcDoc, toolCallId]);

    useEffect(() => {
      bridgeRef.current?.setHostContext(buildHostContext(isDark));
    }, [isDark]);

    if (isLoading) return <Skeleton height={DEFAULT_HEIGHT} width={'100%'} />;

    if (error || !srcDoc) {
      if (error) console.warn(`[MCPApp] failed to load ${resourceUri}:`, error);
      return fallback;
    }

    return (
      <div {...stylex.props(resource?.meta?.prefersBorder !== false && styles.bordered)}>
        <iframe
          allow={APP_IFRAME_ALLOW}
          ref={iframeRef}
          // No `allow-same-origin`: the view runs on an opaque origin and can
          // reach LobeHub only through the postMessage bridge.
          sandbox="allow-scripts allow-forms"
          srcDoc={srcDoc}
          title={`${identifier} / ${apiName}`}
          {...stylex.props(styles.iframe, styles.iframeHeight(`${height}px`))}
        />
      </div>
    );
  },
);

McpAppView.displayName = 'McpAppView';

export default McpAppView;
