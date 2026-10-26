'use client';

import type { MessageMcpAppSource } from '@lobechat/types';
import { cssVar, Flexbox, Icon, Text } from '@lobehub/ui';
import { AppWindowIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/**
 * Quiet line under a user bubble an MCP App view posted. Naming the view shows
 * the message continues this conversation from that view, not a fresh question
 * the user typed.
 */
const McpAppSourceFooter = ({ source }: { source: MessageMcpAppSource }) => {
  const { t } = useTranslation('plugin');

  return (
    <Flexbox horizontal align={'center'} gap={4} justify={'flex-end'} paddingBlock={4}>
      <Icon icon={AppWindowIcon} size={14} style={{ color: cssVar.colorTextQuaternary }} />
      <Text style={{ fontSize: 12 }} type={'secondary'}>
        {t('mcpApp.message.source', { app: source.identifier })}
      </Text>
    </Flexbox>
  );
};

export default McpAppSourceFooter;
