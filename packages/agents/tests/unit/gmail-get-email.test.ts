import { describe, expect, it } from 'vitest';

import {
  buildThreadContentText,
  normalizeAttachmentDownloadPath,
  normalizeGmailAttachmentDownloadUrl,
  normalizeGmailThreadUrl,
} from '../../src/helpers/web/scripts/gmail/get-email.js';

describe('gmail get-email helpers', () => {
  it('normalizes Gmail thread URLs', () => {
    expect(
      normalizeGmailThreadUrl(' https://mail.google.com/mail/u/0/#inbox/19d09010e9d7747f ')
    ).toBe('https://mail.google.com/mail/u/0/#inbox/19d09010e9d7747f');
  });

  it('rejects non-Gmail URLs', () => {
    expect(() => normalizeGmailThreadUrl('https://example.com/thread/123')).toThrow(
      'Expected a Gmail thread URL on mail.google.com.'
    );
  });

  it('normalizes attachment download paths to absolute paths', () => {
    expect(normalizeAttachmentDownloadPath('./tmp-downloads')).toMatch(/tmp-downloads$/);
  });

  it('normalizes Gmail attachment download metadata URLs', () => {
    expect(
      normalizeGmailAttachmentDownloadUrl(
        'application/pdf:2540036270.pdf:https://mail.google.com/mail/u/0/https://mail.google.com/mail/u/0?ui=2&ik=abc&view=att'
      )
    ).toBe('https://mail.google.com/mail/u/0?ui=2&ik=abc&view=att');
  });

  it('builds thread content text from expanded messages', () => {
    expect(
      buildThreadContentText([
        {
          index: 0,
          messageId: '#msg-f:1',
          legacyMessageId: 'legacy-1',
          expanded: true,
          from: {
            name: 'Alice',
            email: 'alice@example.com',
          },
          toText: 'me',
          timeText: 'Mar 20, 2026, 8:25 AM',
          attachmentNames: ['invoice.pdf'],
          attachments: [],
          bodyText: 'Hello there',
          bodyTextPreview: 'Hello there',
          textSnippet: 'Hello there',
        },
        {
          index: 1,
          messageId: '#msg-f:2',
          legacyMessageId: 'legacy-2',
          expanded: false,
          from: {
            name: 'Bob',
            email: 'bob@example.com',
          },
          toText: 'me',
          timeText: 'Mar 20, 2026, 9:00 AM',
          attachmentNames: [],
          attachments: [],
          bodyText: '',
          bodyTextPreview: '',
          textSnippet: '',
        },
      ])
    ).toBe(
      [
        'Message 1',
        'From: Alice <alice@example.com>',
        'To: me',
        'Time: Mar 20, 2026, 8:25 AM',
        'Attachments: invoice.pdf',
        '',
        'Hello there',
      ].join('\n')
    );
  });
});
