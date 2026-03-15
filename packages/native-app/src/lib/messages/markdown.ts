const BLOCK_MATH_PATTERN = /\$\$[\s\S]+?\$\$/;
const LATEX_DELIMITER_PATTERN = /\\\(|\\\[|\\begin\{[a-zA-Z*]+\}/;
const KATEX_HTML_PATTERN = /class=["'][^"']*katex[^"']*["']/i;
const INLINE_FILE_PATH_PATTERN =
  /^(?:~?[\\/])?(?:[A-Za-z0-9._-]+[\\/])+[A-Za-z0-9._-]+(?:\.[A-Za-z0-9._-]+)?$/;
const INLINE_FILE_NAME_PATTERN = /^(?!\d+$)[A-Za-z0-9._-]+\.[A-Za-z0-9._-]+$/;

export function shouldUseDomFallback(markdown: string): boolean {
  if (markdown.trim().length === 0) {
    return false;
  }

  return (
    BLOCK_MATH_PATTERN.test(markdown) ||
    LATEX_DELIMITER_PATTERN.test(markdown) ||
    KATEX_HTML_PATTERN.test(markdown)
  );
}

export function isInlineFilePath(markdown: string): boolean {
  const value = markdown.trim();

  if (value.length === 0 || value.includes('\n') || /\s/.test(value)) {
    return false;
  }

  return INLINE_FILE_PATH_PATTERN.test(value) || INLINE_FILE_NAME_PATTERN.test(value);
}
