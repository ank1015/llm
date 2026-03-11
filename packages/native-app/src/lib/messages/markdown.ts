const BLOCK_MATH_PATTERN = /\$\$[\s\S]+?\$\$/;
const LATEX_DELIMITER_PATTERN = /\\\(|\\\[|\\begin\{[a-zA-Z*]+\}/;
const KATEX_HTML_PATTERN = /class=["'][^"']*katex[^"']*["']/i;

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
