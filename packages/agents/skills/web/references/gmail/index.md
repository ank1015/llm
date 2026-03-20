# Gmail Script Index

Use this reference when the task is specifically about Gmail and may match one of the built-in
website scripts.

## When To Use

Read this file before using the generic Gmail browser flow when the user asks for a common Gmail
task that we already support with a script.

Use the built-in Gmail script when:

- the user wants a quick overview of the top visible inbox messages
- the user wants to search the inbox for words and get matching messages back
- the user wants to open a Gmail thread URL and read the email content or download its attachments
- the user wants to compose a new Gmail draft, optionally attach local files, or send a well-scoped email
- the task matches a supported Gmail action exactly

Use the generic web workflow instead when:

- the task is not listed below
- the task needs a custom label, filter, or page flow that the built-in action does not support yet
- the built-in action fails because Gmail changed enough that you need to re-explore the page

## Available Actions

- Top N mail overview
  - read [fetchNPosts.md](fetchNPosts.md)
  - script: `scripts/gmail/fetch-n-mails.mjs`
  - behavior: prints Markdown, saves raw JSON to temp, and paginates with Gmail's `Older` button when needed
- Search inbox
  - read [searchInbox.md](searchInbox.md)
  - script: `scripts/gmail/search-inbox.mjs`
  - behavior: searches Gmail with an inbox-scoped query, prints Markdown, saves raw JSON to temp, and paginates with Gmail's `Next results` control when needed
- Get email
  - read [getEmail.md](getEmail.md)
  - script: `scripts/gmail/get-email.mjs`
  - behavior: opens a Gmail thread URL, extracts thread content, optionally downloads attachments to a local directory, and saves raw JSON to temp
- Compose email
  - read [composeEmail.md](composeEmail.md)
  - script: `scripts/gmail/compose-email.mjs`
  - behavior: creates a Gmail draft by default, can send with `--send`, accepts local attachment paths, and saves raw JSON to temp

## How To Choose

- If the user says things like "show me the top 5 mails", "summarize the first few Gmail
  messages", "get an inbox overview", or "show me the top 80 Gmail mails", use the built-in
  mail-overview script first.
- If the user says things like "search Gmail for digitalocean", "find inbox mails about invoices",
  "show the top 10 Gmail results for support", or "search my inbox for <words>", use the inbox
  search script first.
- If the user says things like "open this Gmail thread", "read this email", "summarize this Gmail
  message", "get the contents of this thread", or "download this email's attachments", use the
  get-email script first.
- If the user says things like "draft an email to...", "compose a Gmail message", "attach this file
  and prepare an email", or "send this Gmail message", use the compose email script first.
- If the user asks to label, archive, or reply inside an existing thread, use the generic browser
  workflow for now.
- If the script returns `login-required` or another `*-unavailable` status, fall back to direct
  browser inspection and verify the current Gmail state.
