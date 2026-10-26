/**
 * @vitest-environment happy-dom
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import McpAppSourceFooter from './McpAppSourceFooter';

describe('McpAppSourceFooter', () => {
  it('names the MCP App view the message came from', () => {
    render(<McpAppSourceFooter source={{ identifier: 'weather-demo' }} />);

    expect(screen.getByText('mcpApp.message.source')).toBeTruthy();
  });
});
