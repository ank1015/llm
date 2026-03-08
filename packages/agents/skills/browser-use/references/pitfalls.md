# Pitfalls

Read this file when browser work behaves unexpectedly.

It is the compact warning list for expensive mistakes that recur across many
sites and tasks. Each entry tells you how to recognize the problem and what to
do next.

## 1) Wrong JS Execution Path On Strict-CSP Pages

Symptom:

- page JavaScript execution fails unexpectedly even though the code looks fine

Likely cause:

- using `scripting.executeScript` where page CSP blocks that path

Fix:

- prefer `debugger.evaluate` for page execution on strict-CSP pages

Preferred fallback:

- move to the low-level debugger workflow in
  [state-and-debugging.md](state-and-debugging.md)

## 2) Stale Observe Snapshot Or Acting Without Observe

Symptom:

- `You must observe before act`
- actions stop matching what is visibly on the page

Likely cause:

- acting before `observe()`
- reusing old `E*` ids after the page changed

Fix:

- observe first
- re-observe after meaningful UI changes, navigation, modal opens, or SPA
  transitions

Preferred fallback:

- return to the normal `Window` loop in [webapp-flows.md](webapp-flows.md)

## 3) Missing Target Caused By Observation Limits

Symptom:

- a target seems missing even though it is on the page

Likely cause:

- hidden or offscreen filtering
- truncation in the observation output
- iframe contents are not expanded in the snapshot

Fix:

- scroll or change the page state, then observe again
- read the notes and warnings in the observation output before assuming the
  target is truly absent

Preferred fallback:

- use a lower-level inspection path if the target is outside
  `Window.observe()` coverage

## 4) Focus-Sensitive Failures

Symptom:

- copy, menu, or keyboard-sensitive actions behave inconsistently

Likely cause:

- the tab or window is not actually frontmost or focused

Fix:

- re-apply focus stabilization
- verify focus in page context before retrying

Preferred fallback:

- slow down and re-run as a focused single-item probe

## 5) Timing And SPA Assumptions

Symptom:

- the click seemed to work but the page state is wrong, partial, or stale

Likely cause:

- assuming navigation, rendering, or SPA transitions completed immediately

Fix:

- wait for the relevant state change
- re-observe or re-check page state before continuing

Preferred fallback:

- switch to a more explicit state or debugging workflow if timing remains
  ambiguous

## 6) Debugger Session Lifecycle Mistakes

Symptom:

- attach or command behavior becomes confusing across repeated runs

Likely cause:

- forgetting `debugger.detach`
- misunderstanding `alreadyAttached`
- reusing stale collected events

Fix:

- treat detach as mandatory
- clear events when reusing a debugger session
- treat `alreadyAttached` as an existing session, not a fresh failure

Preferred fallback:

- restart from a clean debugger session and reduce the probe scope

## 7) Wrong Abstraction For The Task

Symptom:

- the task feels brittle even though the individual calls seem to work

Likely cause:

- using the wrong mode too long
- for example, using `Window` for state-heavy work or low-level calls for a
  straightforward interactive flow

Fix:

- switch to the correct mode earlier instead of forcing the current approach

Preferred fallback:

- re-read [modes.md](modes.md) and then move to the appropriate deeper
  reference

## Where To Go Next

If a pitfall points to the wrong mode or wrong tool, go back to:

- [modes.md](modes.md)
- [webapp-flows.md](webapp-flows.md)
- [state-and-debugging.md](state-and-debugging.md)
- [research-and-reading.md](research-and-reading.md)
