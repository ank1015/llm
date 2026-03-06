# Embedded Site Guides

Site-specific guides for browser work live inside this skill.

## Current Site Guide Files

- Google: `skills/browser-use/sites/google/INDEX.md`
- X: `skills/browser-use/sites/x/INDEX.md`

Current bundled task docs:

- Google search: `skills/browser-use/sites/google/tasks/getSearch.md`

## Runtime Paths

When this skill is copied into the generated workspace, site guides live under:

```text
skills/browser-use/sites/<site>/
```

The main site index file should be:

```text
skills/browser-use/sites/<site>/INDEX.md
```

## Read Order

When a task targets a specific site or domain:

1. Read `skills/browser-use/SKILL.md`
2. Read `skills/browser-use/sites/<site>/INDEX.md`
3. Read any matching task docs under `skills/browser-use/sites/<site>/tasks/`
4. If the task doc points to a bundled script, run that script with the documented CLI options before writing a new browser script

## Standard Site Layout

Each site folder should follow this shape:

```text
sites/<site>/
  INDEX.md
  tasks/
    <task>.md
  scripts/
    ...
```

`scripts/` is optional. Use it only when the site needs stable reusable helpers.

## What `INDEX.md` Should Contain

- site purpose and trigger conditions
- supported task docs
- auth or session caveats
- stable URL patterns and navigation notes
- output normalization expectations for that site

## What Each Task Doc Should Contain

- task title
- bundled script path
- run command and option map
- scope or URL coverage
- required inputs
- expected output shape
- stable extraction or action patterns
- validation and stop conditions

Keep site task docs script-oriented. They should help the agent run the right bundled script first and only write new TypeScript when the bundled task does not fit.
