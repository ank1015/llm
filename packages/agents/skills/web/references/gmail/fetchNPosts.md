# Gmail Top N Mail Overview

Use this reference for the built-in Gmail inbox overview script.

## What It Does

This action fetches the top `N` visible Gmail inbox rows and returns a structured JSON summary.

It is useful for requests like:

- "show me the top 5 emails"
- "summarize the first few Gmail messages"
- "get a quick inbox overview"

## Script To Run

Run the installed skill wrapper script:

```bash
node <absolute-path-to-installed-web-skill>/scripts/gmail/fetch-n-mails.mjs --count 5
```

The wrapper delegates to the package CLI and uses the helper-backed Gmail implementation.

Relative script path inside the installed web skill:

```text
scripts/gmail/fetch-n-mails.mjs
```

## Options

- `--count <n>`
  - number of visible inbox rows to return
  - default: `5`
- `--no-launch`
  - do not try to launch Chrome automatically if the browser bridge is unavailable

## Returned Shape

The script returns JSON with this high-level shape:

```json
{
  "status": "ok",
  "page": {
    "title": "Inbox (...) - ... - Gmail",
    "url": "https://mail.google.com/mail/u/0/#inbox",
    "route": "inbox"
  },
  "rowSelector": "tr.zA",
  "visibleRowCount": 50,
  "mails": [
    {
      "index": 0,
      "rowId": ":2d",
      "threadId": null,
      "sender": "bigbasket",
      "senderEmail": "alert@info.bigbasket.com",
      "subject": "Eid's Menu Recipe Contest & More",
      "snippet": "...",
      "time": "9:13 PM",
      "unread": true,
      "selected": false,
      "starred": true,
      "textSnippet": "..."
    }
  ]
}
```

## Status Values

- `ok`
  - inbox rows were found and returned
- `login-required`
  - Gmail appears to be at a sign-in gate instead of an inbox view
- `inbox-unavailable`
  - Gmail loaded, but the expected inbox rows were not found

## Behavior Notes

- The script reuses an existing Gmail tab when possible.
- If no Gmail tab exists, it opens `https://mail.google.com/mail/u/0/#inbox`.
- It waits for browser load, waits for Gmail to expose either inbox content or a login gate, then
  extracts the first visible rows.
- The current observed inbox row selector is `tr.zA`, but the script also tries a few Gmail-specific
  fallbacks before giving up.

## When To Fall Back

Do not keep retrying the built-in script if the task is no longer a simple inbox overview.

Fall back to the generic browser flow when:

- the user needs a different Gmail view
- the user needs thread-level reading
- the inbox DOM changed enough that the returned data is clearly wrong
- the task becomes interactive or mutating
