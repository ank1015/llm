# @ank1015/llm-research

Browser-based research utilities. Combines the extension package (browser control) with LLM capabilities to extract structured data from web sources.

## Commands

```bash
pnpm build        # Build the package
pnpm dev          # Build in watch mode
pnpm test         # Run all tests
pnpm test:watch   # Run tests in watch mode
pnpm typecheck    # Type-check without emitting
pnpm clean        # Remove build artifacts
```

## Structure

```
src/
  index.ts              # Public exports
  sources/
    index.ts            # Re-exports all sources
    x/                  # Twitter/X source
      index.ts          # Exports: createXSource()
      x.source.ts       # Implementation (uses ChromeClient)
      x.types.ts        # X-specific types (when defined)
    <source>/           # Future sources follow same pattern
```

## Adding a New Source

1. Create `src/sources/<name>/` directory
2. Create `<name>.source.ts` with a `create<Name>Source(opts)` factory
3. Create `index.ts` barrel exporting the factory and types
4. Re-export from `src/sources/index.ts`
5. Each source receives a `ChromeClient` and uses browser automation to extract data

## Dependencies

- Depends on: `@ank1015/llm-extension` (browser control)
- Depended on by: (none yet)
