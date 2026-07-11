/**
 * Section-targeted read (v1.4 Phase 7). Extract one heading's section from a
 * markdown document so pulling a dossier's *Knobs* section doesn't cost the whole
 * file. Matches a heading by text (case-insensitive), returns from that heading
 * through to the next heading of the same or higher level.
 */
export function extractSection(markdown: string, heading: string): string | null {
  const target = heading.trim().toLowerCase();
  const lines = markdown.split("\n");
  let startIdx = -1;
  let startLevel = 0;

  const headingAt = (line: string): { level: number; text: string } | null => {
    const m = /^(#{1,6})\s+(.*?)\s*$/.exec(line);
    return m ? { level: m[1].length, text: m[2].trim().toLowerCase() } : null;
  };

  for (let i = 0; i < lines.length; i++) {
    const h = headingAt(lines[i]);
    if (h && h.text === target) {
      startIdx = i;
      startLevel = h.level;
      break;
    }
  }
  if (startIdx === -1) return null;

  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    const h = headingAt(lines[i]);
    if (h && h.level <= startLevel) {
      endIdx = i;
      break;
    }
  }
  return lines.slice(startIdx, endIdx).join("\n").trimEnd();
}
