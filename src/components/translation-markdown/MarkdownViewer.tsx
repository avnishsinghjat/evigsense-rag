import ReactMarkdown, { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { useMemo } from "react";
import {
  ImageIcon,
  BarChart3,
  Network,
  GitBranch,
  Camera,
  Table2,
  LineChart,
  Sigma,
  Code2,
  ScanLine,
  type LucideIcon,
} from "lucide-react";
import { parseMarkdownBlocks, MdBlock, VisualVariant } from "@/lib/markdownBlocks";

const markdownComponents: Components = {
  table: ({ node, ...props }) => (
    <div className="not-prose my-4 overflow-x-auto rounded-md border border-border">
      <table className="w-full border-collapse text-sm" {...props} />
    </div>
  ),
  thead: ({ node, ...props }) => <thead className="bg-muted/60" {...props} />,
  tbody: ({ node, ...props }) => <tbody className="divide-y divide-border" {...props} />,
  tr: ({ node, ...props }) => <tr className="border-b border-border last:border-0" {...props} />,
  th: ({ node, style, ...props }) => (
    <th
      className="border border-border px-3 py-2 text-left font-semibold text-foreground bg-muted/40"
      {...props}
    />
  ),
  td: ({ node, style, ...props }) => (
    <td className="border border-border px-3 py-2 align-top text-foreground/90" {...props} />
  ),
  img: ({ alt, src }) => {
    const isPlaceholder = !src || src === "image-placeholder" || src.includes("image-placeholder");
    if (isPlaceholder) {
      return (
        <span className="not-prose my-4 flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-muted/30 px-6 py-10 text-center">
          <ImageIcon className="h-10 w-10 text-muted-foreground/70" />
          <span className="text-sm font-medium text-foreground">{alt || "Figure"}</span>
          <span className="text-xs text-muted-foreground">Image from original document</span>
        </span>
      );
    }
    return <img src={src} alt={alt ?? ""} className="rounded-md mx-auto my-4 max-w-full h-auto" />;
  },
  code: ({ className, children, ...props }) => (
    <code className={className} {...props}>
      {children}
    </code>
  ),
};

const VISUAL_META: Record<VisualVariant, { icon: LucideIcon; label: string }> = {
  image: { icon: ImageIcon, label: "Image description" },
  chart: { icon: BarChart3, label: "Chart description" },
  diagram: { icon: Network, label: "Diagram description" },
  flowchart: { icon: GitBranch, label: "Flowchart description" },
  figure: { icon: ImageIcon, label: "Figure description" },
  screenshot: { icon: Camera, label: "Screenshot description" },
  table: { icon: Table2, label: "Table description" },
  graph: { icon: LineChart, label: "Graph description" },
  equation: { icon: Sigma, label: "Equation description" },
  code: { icon: Code2, label: "Code description" },
  generic: { icon: ScanLine, label: "Visual description" },
};

function VisualDescriptionBlock({
  text,
  variant,
}: {
  text: string;
  variant: VisualVariant;
}) {
  const { icon: Icon, label } = VISUAL_META[variant] ?? VISUAL_META.generic;
  return (
    <div className="not-prose my-3 rounded-md border-l-4 border-primary/60 bg-primary/5 p-3">
      <div className="flex items-center gap-2 text-xs font-semibold text-primary mb-1">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="text-sm leading-relaxed whitespace-pre-wrap text-foreground/90">
        {text || <span className="italic text-muted-foreground">No description provided.</span>}
      </div>
    </div>
  );
}

/**
 * Renders a single parsed Markdown block.
 * Used by the side-by-side viewer so each row aligns structurally.
 */
export function BlockRenderer({ block }: { block: MdBlock }) {
  if (block.kind === "empty") {
    return <div className="h-4" aria-hidden />;
  }
  if (block.kind === "visual_description") {
    return (
      <VisualDescriptionBlock
        text={block.inner ?? ""}
        variant={block.variant ?? "generic"}
      />
    );
  }
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} components={markdownComponents}>
        {block.content}
      </ReactMarkdown>
    </div>
  );
}


interface MarkdownViewerProps {
  content: string;
  className?: string;
}

/**
 * Block-aware viewer: parses markdown into blocks, renders each with the
 * shared BlockRenderer so :::image_description blocks become real callouts
 * (and so the same renderer is used in single-pane and side-by-side views).
 */
export function MarkdownViewer({ content, className }: MarkdownViewerProps) {
  const blocks = useMemo(() => parseMarkdownBlocks(content || ""), [content]);
  return (
    <div className={className ?? ""}>
      {blocks.map((b, i) => (
        <BlockRenderer key={i} block={b} />
      ))}
    </div>
  );
}
