# Architecture

`@ank1015/llm-extension` is a Chrome RPC bridge, not a browser-agent framework.

## Layers

1. `src/chrome/background.ts`
   Receives RPC messages from the native host and maps them to Chrome APIs.
2. `src/native/host.ts`
   Runs as the native messaging host Chrome launches.
3. `src/native/server.ts`
   Re-exposes the native messaging channel as a local TCP server.
4. `src/sdk/client.ts` and `src/sdk/connect.ts`
   Provide a Node-facing `ChromeClient` and connection helper.

## Message model

The wire protocol uses six message types:

- host to Chrome: `call`, `subscribe`, `unsubscribe`
- Chrome to host: `result`, `error`, `event`

Messages are length-prefixed JSON and correlated by `id`.

## Generic RPC behavior

- `chrome.call('tabs.query', {...})` maps to `chrome.tabs.query(...)`
- `chrome.subscribe('tabs.onUpdated', callback)` registers an event listener
- `ChromeServer` multiplexes multiple TCP clients onto one Chrome bridge

## Special methods

Some methods are implemented explicitly in the background worker rather than through generic dot-path lookup:

- `debugger.evaluate`
- `debugger.attach`
- `debugger.sendCommand`
- `debugger.getEvents`
- `debugger.detach`
- `scripting.executeScript` when called with a `code` string

These are part of the supported RPC surface.

## Optional helper

`ChromeClient.getPageMarkdown(tabId, opts?)` is a convenience helper layered on top of:

1. `tabs.get` polling for load completion
2. `debugger.evaluate` to read full page HTML
3. an external HTML-to-markdown converter service

It is intentionally kept separate from the core RPC contract. Converter failures throw explicit errors.
