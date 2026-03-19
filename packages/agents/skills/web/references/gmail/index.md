# Gmail Script Index

Use this reference when the task is specifically about Gmail and may match one of the built-in
website scripts.

## When To Use

Read this file before using the generic Gmail browser flow when the user asks for a common Gmail
task that we already support with a script.

Use the built-in Gmail script when:

- the user wants a quick overview of the top visible inbox messages
- the task is read-only and matches a supported Gmail action exactly

Use the generic web workflow instead when:

- the task is not listed below
- the task needs a custom label, filter, or page flow that the built-in action does not support yet
- the built-in action fails because Gmail changed enough that you need to re-explore the page

## Available Actions

- Top N mail overview
  - read [fetchNPosts.md](fetchNPosts.md)
  - script: `scripts/gmail/fetch-n-mails.mjs`

## How To Choose

- If the user says things like "show me the top 5 mails", "summarize the first few Gmail
  messages", or "get an inbox overview", use the built-in mail-overview script first.
- If the user asks to draft, send, search, label, archive, or inspect a specific thread, use the
  generic browser workflow for now.
- If the script returns `login-required` or `inbox-unavailable`, fall back to direct browser
  inspection and verify the current Gmail state.
