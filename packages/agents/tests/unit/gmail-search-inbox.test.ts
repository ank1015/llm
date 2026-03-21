import { describe, expect, it } from 'vitest';

import {
  buildGmailInboxSearchUrl,
  buildInboxSearchQuery,
} from '../../src/helpers/web/scripts/gmail/search-inbox.js';

describe('gmail search-inbox helpers', () => {
  it('prepends the inbox operator when it is missing', () => {
    expect(buildInboxSearchQuery('digitalocean billing')).toBe('in:inbox digitalocean billing');
  });

  it('preserves an explicit inbox operator', () => {
    expect(buildInboxSearchQuery('in:inbox npm support')).toBe('in:inbox npm support');
  });

  it('builds a Gmail search hash URL', () => {
    expect(buildGmailInboxSearchUrl('digitalocean')).toBe(
      'https://mail.google.com/mail/u/0/#search/in%3Ainbox+digitalocean'
    );
  });
});
