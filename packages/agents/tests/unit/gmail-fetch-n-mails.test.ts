import { describe, expect, it } from 'vitest';

import {
  buildGmailThreadOpenUrl,
  renderFetchNMailsMarkdown,
} from '../../src/helpers/web/scripts/gmail/fetch-n-mails.js';

import type { FetchNMailsResult } from '../../src/helpers/web/scripts/gmail/fetch-n-mails.js';

describe('gmail fetch-n-mails helpers', () => {
  it('builds an inbox thread URL from a legacy thread id', () => {
    expect(
      buildGmailThreadOpenUrl('https://mail.google.com/mail/u/0/#inbox', '19d06c3e16dfc2fe')
    ).toBe('https://mail.google.com/mail/u/0/#inbox/19d06c3e16dfc2fe');
  });

  it('renders a readable markdown summary with the saved JSON path', () => {
    const result: FetchNMailsResult = {
      status: 'ok',
      page: {
        title: 'Inbox - Gmail',
        url: 'https://mail.google.com/mail/u/0/#inbox',
        route: 'inbox',
      },
      rowSelector: 'tr.zA',
      visibleRowCount: 50,
      mails: [
        {
          index: 0,
          rowId: ':2d',
          legacyThreadId: '19d06c3e16dfc2fe',
          threadId: '#thread-f:1860105660031550206',
          openUrl: 'https://mail.google.com/mail/u/0/#inbox/19d06c3e16dfc2fe',
          sender: 'bigbasket',
          senderEmail: 'alert@info.bigbasket.com',
          subject: "Eid's Menu Recipe Contest & More",
          snippet: 'Promo email about Eid recipes and a recipe contest.',
          time: '9:13 PM',
          unread: false,
          selected: false,
          starred: true,
          textSnippet: "bigbasket Eid's Menu Recipe Contest & More",
        },
      ],
    };

    const markdown = renderFetchNMailsMarkdown(result, '/tmp/fetch-n-mails.json');

    expect(markdown).toContain('# Gmail Inbox Overview');
    expect(markdown).toContain('Raw JSON saved to: `/tmp/fetch-n-mails.json`');
    expect(markdown).toContain('**bigbasket**');
    expect(markdown).toContain('Open: https://mail.google.com/mail/u/0/#inbox/19d06c3e16dfc2fe');
    expect(markdown).toContain('State: read, starred');
  });
});
