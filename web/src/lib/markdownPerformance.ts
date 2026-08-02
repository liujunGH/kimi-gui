export type MarkdownCodeRenderer = 'pre' | 'shiki';

export interface MarkdownRenderPlan {
  codeRenderer: MarkdownCodeRenderer;
  codeFenceCount: number;
  codeChars: number;
}

const HEAVY_TEXT_CHARS = 120_000;
const HEAVY_CODE_CHARS = 60_000;
const HEAVY_CODE_FENCES = 32;
const HEAVY_SINGLE_FENCE_CHARS = 30_000;

const CODE_FENCE_RE = /(^|\n)(`{3,}|~{3,})[^\n]*\n([\s\S]*?)(?:\n)?\2(?=\n|$)/g;

const RICH_BLOCK_RE = /(^|\n)\s{0,3}(?:#{1,6}\s|>|[-+*]\s|\d+[.)]\s|```|~~~|(?:-{3,}|_{3,}|\*{3,})\s*(?=\n|$))/m;
const RICH_INLINE_RE = /`|!\[|\[[^\]]*\]\(|<\/?[a-z][^>]*>|\*\*|__|~~|\$\$|https?:\/\/|(^|\n)[^\n]*\|[^\n]*(?=\n|$)/i;
const FILE_PATH_RE = /(^|[\s(])(?:\.{0,2}\/|\/)[^\s)]+\.[a-z0-9]{1,12}(?::\d+)?/i;

/**
 * Plain historical replies do not need the 600+ kB rich-markdown runtime.
 * This detector is intentionally conservative: any recognizable Markdown,
 * URL, table, or clickable file path keeps the full renderer.
 */
export function needsRichMarkdown(text: string): boolean {
  return RICH_BLOCK_RE.test(text) || RICH_INLINE_RE.test(text) || FILE_PATH_RE.test(text);
}

export function markdownRenderPlan(text: string): MarkdownRenderPlan {
  let codeFenceCount = 0;
  let codeChars = 0;
  let longestFence = 0;
  CODE_FENCE_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = CODE_FENCE_RE.exec(text)) !== null) {
    const code = match[3] ?? '';
    codeFenceCount += 1;
    codeChars += code.length;
    longestFence = Math.max(longestFence, code.length);
  }

  const heavy =
    text.length >= HEAVY_TEXT_CHARS ||
    codeChars >= HEAVY_CODE_CHARS ||
    codeFenceCount >= HEAVY_CODE_FENCES ||
    longestFence >= HEAVY_SINGLE_FENCE_CHARS;

  return {
    codeRenderer: heavy ? 'pre' : 'shiki',
    codeFenceCount,
    codeChars,
  };
}
