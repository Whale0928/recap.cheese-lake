import { Fragment, type ReactNode } from "react";

type LegalDocumentProps = {
  markdown: string;
};

const inlineToken = /(\*\*.+?\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\)|<https?:\/\/[^>]+>)/g;

function legalHref(href: string) {
  const decoded = decodeURIComponent(href);
  if (decoded.endsWith("개인정보 처리방침.md")) return "/privacy/";
  if (decoded.endsWith("이용약관.md")) return "/terms/";
  return href;
}

function Inline({ children }: { children: string }) {
  const parts = children.split(inlineToken).filter(Boolean);

  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index}><Inline>{part.slice(2, -2)}</Inline></strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={index}>{part.slice(1, -1)}</code>;
    }
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) {
      const href = legalHref(link[2]);
      const external = href.startsWith("http");
      return <a key={index} href={href} target={external ? "_blank" : undefined} rel={external ? "noreferrer" : undefined}>{link[1]}</a>;
    }
    if (part.startsWith("<http") && part.endsWith(">")) {
      const href = part.slice(1, -1);
      return <a key={index} href={href} target="_blank" rel="noreferrer">{href}</a>;
    }
    return <Fragment key={index}>{part}</Fragment>;
  });
}

function isTableDivider(line: string) {
  return /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(line);
}

function tableCells(line: string) {
  return line.replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim());
}

function startsBlock(lines: string[], index: number) {
  const line = lines[index] ?? "";
  return !line.trim()
    || /^#{1,3}\s/.test(line)
    || line.trim() === "---"
    || line.startsWith("- ")
    || (line.includes("|") && isTableDivider(lines[index + 1] ?? ""));
}

function renderMarkdown(markdown: string): ReactNode[] {
  const lines = markdown.trim().split("\n");
  const blocks: ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      const content = <Inline>{heading[2]}</Inline>;
      if (level === 1) blocks.push(<h1 key={index}>{content}</h1>);
      if (level === 2) blocks.push(<h2 key={index}>{content}</h2>);
      if (level === 3) blocks.push(<h3 key={index}>{content}</h3>);
      index += 1;
      continue;
    }

    if (line.trim() === "---") {
      blocks.push(<hr key={index} />);
      index += 1;
      continue;
    }

    if (line.includes("|") && isTableDivider(lines[index + 1] ?? "")) {
      const header = tableCells(line);
      index += 2;
      const rows: string[][] = [];
      while (index < lines.length && lines[index].includes("|") && lines[index].trim()) {
        rows.push(tableCells(lines[index]));
        index += 1;
      }
      blocks.push(
        <div className="legal-table-wrap" key={`table-${index}`}>
          <table>
            <thead><tr>{header.map((cell, cellIndex) => <th key={cellIndex}><Inline>{cell}</Inline></th>)}</tr></thead>
            <tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}><Inline>{cell}</Inline></td>)}</tr>)}</tbody>
          </table>
        </div>
      );
      continue;
    }

    if (line.startsWith("- ")) {
      const items: string[] = [];
      while (index < lines.length && lines[index].startsWith("- ")) {
        let item = lines[index].slice(2).trim();
        index += 1;
        while (index < lines.length && lines[index].trim() && !startsBlock(lines, index)) {
          item += ` ${lines[index].trim()}`;
          index += 1;
        }
        items.push(item);
      }
      blocks.push(<ul key={`list-${index}`}>{items.map((item, itemIndex) => <li key={itemIndex}><Inline>{item}</Inline></li>)}</ul>);
      continue;
    }

    const paragraph: string[] = [];
    while (index < lines.length && !startsBlock(lines, index)) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    blocks.push(<p key={`paragraph-${index}`}><Inline>{paragraph.join(" ")}</Inline></p>);
  }

  return blocks;
}

function LegalDocument({ markdown }: LegalDocumentProps) {
  return (
    <main className="legal-main" id="main">
      <article className="legal-document">{renderMarkdown(markdown)}</article>
    </main>
  );
}

export { LegalDocument };
