'use client';

import type { MessageMcpAppSource } from '@lobechat/types';
import { cssVar, Flexbox, Icon, Text } from '@lobehub/ui';
import { AppWindowIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { useToolStore } from '@/store/tool';
import { toolSelectors } from '@/store/tool/selectors';
import { connectorSelectors } from '@/store/tool/slices/connector';

/**
 * Quiet line under a user bubble an MCP App view posted. It marks the message
 * as a follow-up sent from that view inside this conversation, not a fresh
 * question the user typed. The app is named the way its tool cards name it,
 * falling back to the identifier once the plugin or connector is gone.
 */
const McpAppSourceFooter = ({ source }: { source: MessageMcpAppSource }) => {
  const { t } = useTranslation('plugin');
  const appName = useToolStore(
    (s) =>
      toolSelectors.getMetaById(source.identifier)(s)?.title ||
      connectorSelectors.connectorByIdentifier(source.identifier)(s)?.name ||
      source.identifier,
  );

  return (
    <Flexbox horizontal align={'center'} gap={4} justify={'flex-end'} paddingBlock={4}>
      <Icon icon={AppWindowIcon} size={14} style={{ color: cssVar.colorTextQuaternary }} />
      <Text style={{ fontSize: 12 }} type={'secondary'}>
        {t('mcpApp.message.source', { app: appName })}
      </Text>
    </Flexbox>
  );
};

export default McpAppSourceFooter;
