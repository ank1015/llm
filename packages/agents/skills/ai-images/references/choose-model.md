# Choose An Image Model

Use this reference when the task needs model-selection help before you call `createImage()` or
`editImage()`.

## Model Priority

- If the user explicitly names a model, use that model.
- If the task is serious, high-stakes, detail-sensitive, or likely to need the best typography,
  precise edits, or careful composition, prefer `gemini-3-pro-image-preview`.
- If the task is normal or exploratory, `gpt-5.4` and `gemini-3.1-flash-image-preview` are both
  good defaults.
- `gemini-3-pro-image-preview` is the strongest overall model of the three, but it is a bit more
  expensive than the other two.

## When To Prefer `gemini-3-pro-image-preview`

Prefer `gemini-3-pro-image-preview` when the task needs:

- precise text rendering inside the image
- small visual details to survive edits
- careful local changes or cleaner instruction-following
- a serious deliverable where quality matters more than cost

This is the safest “best quality” choice when the user cares about polish.

## When `gpt-5.4` Or `gemini-3.1-flash-image-preview` Are Good

Use `gpt-5.4` or `gemini-3.1-flash-image-preview` when:

- the task is normal importance
- you want a faster or cheaper first pass
- the required provider-specific image options line up better with one of those models
- you want to try multiple candidates before spending more on the final pass

Neither is far behind for typical work.

## Option Matching Matters

Model choice is not only about raw quality. Also look at `provider.imageOptions`.

- If the desired size, aspect ratio, fidelity, background, or other image controls fit a Google
  model better, choose the Google model that matches the task.
- If the desired controls fit `gpt-5.4` better, choose `gpt-5.4`.
- When the user’s constraints clearly match one provider’s options better than another, prefer the
  better fit even if another model is stronger in the abstract.

## Iteration Strategy

- For important work, it is valid to try more than one model and keep the best result.
- A common pattern is to start with `gpt-5.4` or `gemini-3.1-flash-image-preview`, then rerun with
  `gemini-3-pro-image-preview` if the result needs more polish.
- If the first result misses on text, precision, or edit fidelity, switch to
  `gemini-3-pro-image-preview`.
