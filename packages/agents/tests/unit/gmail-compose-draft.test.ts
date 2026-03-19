import { describe, expect, it } from 'vitest';

import {
  buildGmailComposeUrl,
  normalizeGmailAddressList,
} from '../../src/helpers/web/scripts/gmail/compose-draft.js';

describe('gmail compose draft helpers', () => {
  it('normalizes recipient lists from strings', () => {
    expect(
      normalizeGmailAddressList(
        'alice@example.com, bob@example.com;\ncarol@example.com, alice@example.com'
      )
    ).toEqual(['alice@example.com', 'bob@example.com', 'carol@example.com']);
  });

  it('normalizes recipient lists from arrays', () => {
    expect(
      normalizeGmailAddressList([
        'alice@example.com, bob@example.com',
        'carol@example.com',
        'bob@example.com',
      ])
    ).toEqual(['alice@example.com', 'bob@example.com', 'carol@example.com']);
  });

  it('builds a Gmail compose URL with prefilled fields', () => {
    expect(
      buildGmailComposeUrl({
        to: ['alice@example.com', 'bob@example.com'],
        cc: ['cc@example.com'],
        bcc: ['bcc@example.com'],
        subject: 'Hello World',
        body: 'Line 1\nLine 2',
      })
    ).toBe(
      'https://mail.google.com/mail/u/0/?view=cm&fs=1&tf=1&to=alice%40example.com%2Cbob%40example.com&cc=cc%40example.com&bcc=bcc%40example.com&su=Hello+World&body=Line+1%0ALine+2'
    );
  });
});
