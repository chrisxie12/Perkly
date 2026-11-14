/** Renders the agreement's simple markdown (headings, numbered lists, bold) without HTML injection. */
function inline(text: string) {
  return text
    .split(/(\*\*[^*]+\*\*)/g)
    .map((part, i) => (part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : part));
}

export function AgreementText({ body }: { body: string }) {
  const blocks = body.trim().split(/\n\s*\n/);
  return (
    <div className="space-y-4 leading-relaxed text-ink-800">
      {blocks.map((block, i) => {
        if (block.startsWith("# ")) return null; // The page shows the title.
        if (block.startsWith("## ")) {
          return (
            <h3 key={i} className="pt-2 font-display text-lg font-bold text-ink-900">
              {block.slice(3)}
            </h3>
          );
        }
        const lines = block.split("\n");
        if (lines.every((l) => /^\d+\.\s/.test(l))) {
          return (
            <ol key={i} className="list-decimal space-y-1 pl-6">
              {lines.map((l, j) => (
                <li key={j}>{inline(l.replace(/^\d+\.\s/, ""))}</li>
              ))}
            </ol>
          );
        }
        return <p key={i}>{inline(block.replace(/\n/g, " "))}</p>;
      })}
    </div>
  );
}
