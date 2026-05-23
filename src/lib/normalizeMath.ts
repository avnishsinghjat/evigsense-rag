// Normalize various math delimiter styles emitted by LLMs into KaTeX-friendly $/$$ form.
export function normalizeMathDelimiters(src: string): string {
  if (!src) return src;
  let out = src;
  // \[ ... \] -> $$ ... $$
  out = out.replace(/\\\[([\s\S]+?)\\\]/g, (_, m) => `\n$$\n${m.trim()}\n$$\n`);
  // \( ... \) -> $ ... $
  out = out.replace(/\\\(([\s\S]+?)\\\)/g, (_, m) => `$${m.trim()}$`);
  // Bare [ ... ] (possibly multi-line) containing LaTeX commands -> $$ ... $$
  out = out.replace(/(^|[\s>])\[\s+([\s\S]*?\\[a-zA-Z]+[\s\S]*?)\s+\](?=$|[\s.,;:)])/g,
    (_, pre, m) => `${pre}\n$$\n${m.trim()}\n$$\n`);
  // Bare ( ... ) containing LaTeX commands -> $ ... $
  out = out.replace(/\(\s*((?:[^()\n]|\\[a-zA-Z]+)*\\[a-zA-Z]+(?:[^()\n]|\\[a-zA-Z]+)*)\s*\)/g,
    (full, m) => /\\[a-zA-Z]/.test(m) ? `$${m.trim()}$` : full);
  return out;
}
