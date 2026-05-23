/**
 * Splits a Markdown document into top-level blocks while preserving
 * fenced code blocks and ::: directive blocks (e.g. ::: image_description).
 *
 * The goal is structural alignment for the side-by-side viewer:
 * if the OCR Markdown has N blocks, the translation should have ~N
 * blocks in the same order. Indexing them lets us render parallel rows.
 */

export type MdBlockKind =
  | "heading"
  | "paragraph"
  | "list"
  | "table"
  | "code"
  | "image"
  | "visual_description"
  | "hr"
  | "blockquote"
  | "math"
  | "empty";

/**
 * Variants of `:::<name>` directives we treat as "visual description" blocks.
 * Anything ending in _description / _desc, plus a few common bare names.
 */
export const VISUAL_DIRECTIVE_NAMES = [
  "image_description",
  "chart_description",
  "diagram_description",
  "flowchart_description",
  "figure_description",
  "screenshot_description",
  "table_description",
  "graph_description",
  "equation_description",
  "code_description",
  "image_desc",
  "chart_desc",
  "diagram_desc",
  "flowchart_desc",
  "figure_desc",
  "screenshot_desc",
  "image",
  "chart",
  "diagram",
  "flowchart",
  "figure",
  "screenshot",
] as const;

export type VisualVariant =
  | "image"
  | "chart"
  | "diagram"
  | "flowchart"
  | "figure"
  | "screenshot"
  | "table"
  | "graph"
  | "equation"
  | "code"
  | "generic";

export function isVisualDirective(name: string): boolean {
  const n = name.toLowerCase();
  if (VISUAL_DIRECTIVE_NAMES.includes(n as (typeof VISUAL_DIRECTIVE_NAMES)[number])) return true;
  return /_(description|desc)$/.test(n);
}

export function visualVariantFromDirective(name: string): VisualVariant {
  const n = name.toLowerCase().replace(/_(description|desc)$/, "");
  switch (n) {
    case "image":
    case "chart":
    case "diagram":
    case "flowchart":
    case "figure":
    case "screenshot":
    case "table":
    case "graph":
    case "equation":
    case "code":
      return n;
    default:
      return "generic";
  }
}

export interface MdBlock {
  kind: MdBlockKind;
  content: string; // raw markdown for the block
  /** Inner text for visual_description blocks (without the ::: fences). */
  inner?: string;
  /** The original directive name (e.g. "chart_description"). */
  directive?: string;
  /** Variant used to pick icon/label (e.g. "chart"). */
  variant?: VisualVariant;
  /** Heading level 1-6 if kind === 'heading'. */
  level?: number;
}

function classify(content: string): MdBlock {
  const trimmed = content.trim();
  if (!trimmed) return { kind: "empty", content };
  if (/^#{1,6}\s/.test(trimmed)) {
    const level = (trimmed.match(/^(#{1,6})/) || ["", ""])[1].length;
    return { kind: "heading", content, level };
  }
  if (/^---+\s*$/.test(trimmed) || /^\*\*\*+\s*$/.test(trimmed)) {
    return { kind: "hr", content };
  }
  if (/^>\s/.test(trimmed.split("\n")[0])) return { kind: "blockquote", content };
  if (/^[-*+]\s/.test(trimmed.split("\n")[0]) || /^\d+\.\s/.test(trimmed.split("\n")[0])) {
    return { kind: "list", content };
  }
  if (/^\|.*\|/.test(trimmed.split("\n")[0])) return { kind: "table", content };
  if (/^!\[[^\]]*\]\([^)]*\)/.test(trimmed)) return { kind: "image", content };
  if (/^\$\$/.test(trimmed)) return { kind: "math", content };
  return { kind: "paragraph", content };
}

export function parseMarkdownBlocks(md: string): MdBlock[] {
  const lines = (md ?? "").replace(/\r\n/g, "\n").split("\n");
  const blocks: MdBlock[] = [];
  let buf: string[] = [];
  let mode: "normal" | "code" | "directive" = "normal";
  let directiveName = "";

  const flushBuf = () => {
    if (buf.length === 0) return;
    // Split buffered "normal" lines into blocks separated by blank lines
    const text = buf.join("\n");
    const chunks = text.split(/\n{2,}/);
    for (const chunk of chunks) {
      if (chunk.trim() === "") continue;
      blocks.push(classify(chunk));
    }
    buf = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (mode === "normal") {
      const fenceMatch = line.match(/^```(.*)$/);
      const directiveMatch = line.match(/^:::\s*([a-zA-Z0-9_-]+)\s*$/);
      if (fenceMatch) {
        flushBuf();
        buf = [line];
        mode = "code";
      } else if (directiveMatch) {
        flushBuf();
        directiveName = directiveMatch[1];
        buf = [line];
        mode = "directive";
      } else {
        buf.push(line);
      }
      continue;
    }

    if (mode === "code") {
      buf.push(line);
      if (/^```\s*$/.test(line)) {
        blocks.push({ kind: "code", content: buf.join("\n") });
        buf = [];
        mode = "normal";
      }
      continue;
    }

    if (mode === "directive") {
      if (/^:::\s*$/.test(line)) {
        buf.push(line);
        const content = buf.join("\n");
        const inner = buf.slice(1, -1).join("\n").trim();
        if (isVisualDirective(directiveName)) {
          blocks.push({
            kind: "visual_description",
            content,
            inner,
            directive: directiveName,
            variant: visualVariantFromDirective(directiveName),
          });
        } else {
          // Unknown directive — render as paragraph but preserve inner content
          blocks.push({ kind: "paragraph", content: inner || content });
        }
        buf = [];
        mode = "normal";
        directiveName = "";
      } else {
        buf.push(line);
      }
      continue;
    }
  }

  // Flush any leftover (unterminated fence/directive treated as plain text)
  if (buf.length > 0) {
    if (mode === "code" || mode === "directive") {
      blocks.push(classify(buf.join("\n")));
    } else {
      flushBuf();
    }
  }

  return blocks;
}

/**
 * Pads two block arrays with empty blocks so both sides have the same length,
 * guaranteeing row-by-row alignment in the side-by-side viewer.
 */
export function alignBlockPairs(a: MdBlock[], b: MdBlock[]): Array<[MdBlock, MdBlock]> {
  const max = Math.max(a.length, b.length);
  const empty: MdBlock = { kind: "empty", content: "" };
  const pairs: Array<[MdBlock, MdBlock]> = [];
  for (let i = 0; i < max; i++) {
    pairs.push([a[i] ?? empty, b[i] ?? empty]);
  }
  return pairs;
}
