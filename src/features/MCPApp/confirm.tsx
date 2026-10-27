'use client';

import { Button, createModal, Flexbox, Highlighter, Text } from '@lobehub/ui';
import { t } from 'i18next';
import type { ReactNode } from 'react';

/** Resolves false on Cancel and on any other dismissal (Esc, mask, close). */
const confirm = ({
  cancelText,
  content,
  okText,
  title,
}: {
  cancelText: string;
  content: ReactNode;
  okText: string;
  title: string;
}) =>
  new Promise<boolean>((resolve) => {
    let settled = false;
    const settle = (allowed: boolean) => {
      if (settled) return;
      settled = true;
      resolve(allowed);
      modal.close();
    };
    const modal = createModal({
      content,
      footer: (
        <Flexbox horizontal gap={8} justify={'flex-end'}>
          <Button onClick={() => settle(false)}>{cancelText}</Button>
          <Button type={'primary'} onClick={() => settle(true)}>
            {okText}
          </Button>
        </Flexbox>
      ),
      onOpenChange: (open) => {
        if (!open) settle(false);
      },
      title,
    });
  });

/** Ask before a view runs a tool, showing the app by name and the arguments it passes. */
export const confirmAppToolCall = ({
  appName,
  args,
  tool,
}: {
  appName: string;
  args: Record<string, unknown>;
  tool: string;
}) =>
  confirm({
    cancelText: t('mcpApp.toolCall.confirm.cancel', { ns: 'plugin' }),
    content: (
      <Flexbox gap={12}>
        <Text>{t('mcpApp.toolCall.confirm.content', { app: appName, ns: 'plugin', tool })}</Text>
        <Highlighter actionIconSize={'small'} language={'json'} wrap={true}>
          {JSON.stringify(args, null, 2)}
        </Highlighter>
      </Flexbox>
    ),
    okText: t('mcpApp.toolCall.confirm.ok', { ns: 'plugin' }),
    title: t('mcpApp.toolCall.confirm.title', { ns: 'plugin' }),
  });

/** Ask before a view posts a message the user did not just send from it. */
export const confirmAppMessage = ({ appName, text }: { appName: string; text: string }) =>
  confirm({
    cancelText: t('mcpApp.message.confirm.cancel', { ns: 'plugin' }),
    content: (
      <Flexbox gap={12}>
        <Text>{t('mcpApp.message.confirm.content', { app: appName, ns: 'plugin' })}</Text>
        <Highlighter actionIconSize={'small'} language={'markdown'} wrap={true}>
          {text}
        </Highlighter>
      </Flexbox>
    ),
    okText: t('mcpApp.message.confirm.ok', { ns: 'plugin' }),
    title: t('mcpApp.message.confirm.title', { ns: 'plugin' }),
  });
