import {
  clearKaTeXWorker,
  clearMermaidWorker,
  enableKatex,
  enableMermaid,
  setKaTeXWorker,
  setMermaidWorker,
} from 'markstream-vue';
import * as katexWorkerModule from 'markstream-vue/workers/katexRenderer.worker?worker&type=module';
import * as mermaidWorkerModule from 'markstream-vue/workers/mermaidParser.worker?worker&type=module';

let katexEnabled = false;
let mermaidEnabled = false;
let katexWorkerReady = false;
let mermaidWorkerReady = false;

/** Register heavy renderers lazily so ordinary chat never starts unused workers. */
export function ensureMarkdownFeatures(text: string): void {
  const hasDisplayMath = /(^|\n)\s*\$\$[\s\S]*?\$\$/m.test(text);
  const hasMermaid = /```\s*mermaid\b/i.test(text);
  if (hasDisplayMath && !katexEnabled) {
    enableKatex();
    katexEnabled = true;
  }
  if (hasMermaid && !mermaidEnabled) {
    enableMermaid();
    mermaidEnabled = true;
  }
  if (!katexWorkerReady && hasDisplayMath) {
    clearKaTeXWorker();
    setKaTeXWorker(new katexWorkerModule.default());
    katexWorkerReady = true;
  }
  if (!mermaidWorkerReady && hasMermaid) {
    clearMermaidWorker();
    setMermaidWorker(new mermaidWorkerModule.default());
    mermaidWorkerReady = true;
  }
}
