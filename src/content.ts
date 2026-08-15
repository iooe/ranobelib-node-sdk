import type { Attachment, ChapterContent, RichText, UnknownRecord } from "./types.js";
import { absoluteUrl, asArray, asRecord, asString, isRecord, sha256 } from "./utils.js";

const ALLOWED_TAGS = new Set([
  "p",
  "br",
  "hr",
  "strong",
  "em",
  "a",
  "img",
  "ul",
  "ol",
  "li",
  "blockquote",
  "pre",
  "code",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "th",
  "td",
  "sup",
  "sub",
  "s",
]);
const VOID_TAGS = new Set(["br", "hr", "img"]);
const BLOCK_TAGS = new Set([
  "p",
  "br",
  "hr",
  "li",
  "blockquote",
  "pre",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "tr",
  "table",
  "ul",
  "ol",
]);

export function normalizeRichText(raw: unknown, sourceBaseUrl: string): RichText {
  const attachments: Attachment[] = [];
  const html = normalizeContentHtml(raw, attachments, sourceBaseUrl);
  return { raw, html, text: htmlToText(html) };
}

export function normalizeChapterContent(
  raw: unknown,
  rawAttachments: unknown,
  sourceBaseUrl: string,
): ChapterContent {
  const attachments = parseAttachments(rawAttachments, sourceBaseUrl);
  const rawFormat = typeof raw === "string" ? "html" : isRecord(raw) ? "prosemirror" : "unknown";
  const html = normalizeContentHtml(raw, attachments, sourceBaseUrl);
  const text = htmlToText(html);
  return {
    raw,
    rawFormat,
    html,
    text,
    attachments,
    sha256: sha256(stableContentValue(raw)),
  };
}

export function parseAttachments(raw: unknown, sourceBaseUrl: string): Attachment[] {
  return asArray(raw).map((item) => {
    const record = asRecord(item);
    const rawUrl = asString(record.url);
    const filename = asString(record.filename);
    const extension = asString(record.extension);
    let url = absoluteUrl(rawUrl, sourceBaseUrl);
    if (!url && filename) {
      url = absoluteUrl(extension ? `${filename}.${extension}` : filename, sourceBaseUrl);
    }
    return {
      id: toInteger(record.id),
      name: asString(record.name),
      url,
      filename,
      extension,
      raw: record,
    };
  });
}

export function sanitizeHtml(input: string, sourceBaseUrl: string): string {
  const withoutDangerousBlocks = input
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, "")
    .replace(/<!--([\s\S]*?)-->/g, "");
  const tokens = withoutDangerousBlocks.match(/<[^>]*>|[^<]+/g) ?? [];
  const output: string[] = [];

  for (const token of tokens) {
    if (!token.startsWith("<")) {
      output.push(token);
      continue;
    }
    const parsed = parseTag(token);
    if (!parsed) continue;
    let { name } = parsed;
    if (name === "b") name = "strong";
    if (name === "i") name = "em";
    if (!ALLOWED_TAGS.has(name)) continue;

    if (parsed.closing) {
      if (!VOID_TAGS.has(name)) output.push(`</${name}>`);
      continue;
    }

    const attributes = sanitizeAttributes(name, parsed.attributes, sourceBaseUrl);
    output.push(`<${name}${attributes}>`);
  }
  return output.join("");
}

export function htmlToText(html: string): string {
  let value = html
    .replace(/<img\b[^>]*\balt=(?:"([^"]*)"|'([^']*)')[^>]*>/gi, (_match, doubleAlt, singleAlt) =>
      ` ${doubleAlt ?? singleAlt ?? ""} `,
    )
    .replace(/<\/(p|li|blockquote|pre|h[1-6]|tr|table|ul|ol)>/gi, "\n")
    .replace(/<(br|hr)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  value = decodeEntities(value)
    .replace(/\r\n?/g, "\n")
    .replace(/[\t ]+\n/g, "\n")
    .replace(/\n[\t ]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return value;
}

function normalizeContentHtml(raw: unknown, attachments: Attachment[], sourceBaseUrl: string): string {
  if (typeof raw === "string") return sanitizeHtml(raw, sourceBaseUrl);
  if (isRecord(raw)) {
    return renderNode(raw, attachmentMap(attachments), sourceBaseUrl);
  }
  return "";
}

function renderNode(
  node: UnknownRecord,
  attachments: Map<string, string>,
  sourceBaseUrl: string,
): string {
  const type = asString(node.type) ?? "doc";
  const children = asArray(node.content)
    .map((child) => (isRecord(child) ? renderNode(child, attachments, sourceBaseUrl) : ""))
    .join("");
  const attrs = asRecord(node.attrs);

  switch (type) {
    case "doc":
      return children;
    case "text":
      return applyMarks(escapeHtml(asString(node.text) ?? ""), node.marks, sourceBaseUrl);
    case "paragraph":
      return `<p${textAlignAttribute(attrs.textAlign)}>${children}</p>`;
    case "heading": {
      const level = Math.min(6, Math.max(1, toInteger(attrs.level) ?? 2));
      return `<h${level}${textAlignAttribute(attrs.textAlign)}>${children}</h${level}>`;
    }
    case "hardBreak":
      return "<br>";
    case "horizontalRule":
      return "<hr>";
    case "blockquote":
      return `<blockquote>${children}</blockquote>`;
    case "bulletList":
      return `<ul>${children}</ul>`;
    case "orderedList": {
      const start = toInteger(attrs.start);
      return `<ol${start !== null && start !== 1 ? ` start="${start}"` : ""}>${children}</ol>`;
    }
    case "listItem":
      return `<li>${children}</li>`;
    case "codeBlock":
      return `<pre><code>${children}</code></pre>`;
    case "image":
      return renderImages(attrs, attachments, sourceBaseUrl);
    case "table":
      return `<table>${children}</table>`;
    case "tableRow":
      return `<tr>${children}</tr>`;
    case "tableHeader":
      return `<th>${children}</th>`;
    case "tableCell":
      return `<td>${children}</td>`;
    default:
      return children;
  }
}

function applyMarks(value: string, rawMarks: unknown, sourceBaseUrl: string): string {
  let output = value;
  for (const rawMark of asArray(rawMarks)) {
    const mark = asRecord(rawMark);
    const type = asString(mark.type);
    const attrs = asRecord(mark.attrs);
    switch (type) {
      case "bold":
      case "strong":
        output = `<strong>${output}</strong>`;
        break;
      case "italic":
      case "em":
        output = `<em>${output}</em>`;
        break;
      case "code":
        output = `<code>${output}</code>`;
        break;
      case "strike":
        output = `<s>${output}</s>`;
        break;
      case "subscript":
        output = `<sub>${output}</sub>`;
        break;
      case "superscript":
        output = `<sup>${output}</sup>`;
        break;
      case "link": {
        const href = absoluteUrl(asString(attrs.href), sourceBaseUrl);
        if (href) output = `<a href="${escapeAttribute(href)}">${output}</a>`;
        break;
      }
      default:
        break;
    }
  }
  return output;
}

function renderImages(
  attrs: UnknownRecord,
  attachments: Map<string, string>,
  sourceBaseUrl: string,
): string {
  const images = asArray(attrs.images);
  const direct = asString(attrs.src) ?? asString(attrs.url) ?? asString(attrs.image);
  const candidates = images.length > 0 ? images : direct ? [{ image: direct }] : [];
  return candidates
    .map((item) => {
      const record = asRecord(item);
      const identifier = asString(record.image) ?? asString(record.name) ?? asString(record.src);
      const url = (identifier ? attachments.get(identifier) : null) ?? absoluteUrl(identifier, sourceBaseUrl);
      if (!url) return "";
      const alt = asString(record.alt) ?? asString(attrs.alt) ?? "";
      const title = asString(record.title) ?? asString(attrs.title);
      return `<img src="${escapeAttribute(url)}" alt="${escapeAttribute(alt)}"${
        title ? ` title="${escapeAttribute(title)}"` : ""
      }>`;
    })
    .join("");
}

function attachmentMap(attachments: Attachment[]): Map<string, string> {
  const result = new Map<string, string>();
  for (const attachment of attachments) {
    if (attachment.url && attachment.name) result.set(attachment.name, attachment.url);
    if (attachment.url && attachment.filename) result.set(attachment.filename, attachment.url);
  }
  return result;
}

function parseTag(token: string): {
  name: string;
  closing: boolean;
  attributes: string;
} | null {
  const match = /^<\s*(\/?)\s*([a-zA-Z0-9]+)([\s\S]*?)\/?\s*>$/.exec(token);
  if (!match) return null;
  return {
    closing: match[1] === "/",
    name: (match[2] ?? "").toLowerCase(),
    attributes: match[3] ?? "",
  };
}

function sanitizeAttributes(tag: string, raw: string, sourceBaseUrl: string): string {
  const entries: string[] = [];
  const attributes = parseAttributes(raw);

  if (tag === "a") {
    const href = absoluteUrl(attributes.get("href") ?? null, sourceBaseUrl);
    if (href) entries.push(`href="${escapeAttribute(href)}"`, 'rel="noopener noreferrer"');
  } else if (tag === "img") {
    const src = absoluteUrl(attributes.get("src") ?? null, sourceBaseUrl);
    if (!src) return "";
    entries.push(`src="${escapeAttribute(src)}"`);
    const alt = attributes.get("alt");
    const title = attributes.get("title");
    if (alt !== undefined) entries.push(`alt="${escapeAttribute(alt)}"`);
    else entries.push('alt=""');
    if (title !== undefined) entries.push(`title="${escapeAttribute(title)}"`);
    entries.push('loading="lazy"');
  } else if (tag === "ol") {
    const start = attributes.get("start");
    if (start && /^\d+$/.test(start)) entries.push(`start="${start}"`);
  } else if (tag === "td" || tag === "th") {
    for (const name of ["colspan", "rowspan"]) {
      const value = attributes.get(name);
      if (value && /^\d+$/.test(value)) entries.push(`${name}="${value}"`);
    }
  }

  if (["p", "h1", "h2", "h3", "h4", "h5", "h6", "td", "th"].includes(tag)) {
    const style = attributes.get("style") ?? "";
    const align = /text-align\s*:\s*(left|right|center|justify)/i.exec(style)?.[1]?.toLowerCase();
    if (align) entries.push(`style="text-align:${align}"`);
  }
  return entries.length ? ` ${entries.join(" ")}` : "";
}

function parseAttributes(raw: string): Map<string, string> {
  const result = new Map<string, string>();
  const pattern = /([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  for (const match of raw.matchAll(pattern)) {
    const name = (match[1] ?? "").toLowerCase();
    result.set(name, match[2] ?? match[3] ?? match[4] ?? "");
  }
  return result;
}

function textAlignAttribute(value: unknown): string {
  const align = asString(value)?.toLowerCase();
  return align && ["left", "right", "center", "justify"].includes(align)
    ? ` style="text-align:${align}"`
    : "";
}

function stableContentValue(raw: unknown): string {
  if (typeof raw === "string") return raw;
  try {
    return JSON.stringify(raw) ?? "";
  } catch {
    return String(raw);
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

function decodeEntities(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
  };
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
    if (entity.startsWith("#x") || entity.startsWith("#X")) {
      const code = Number.parseInt(entity.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    if (entity.startsWith("#")) {
      const code = Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return named[entity.toLowerCase()] ?? match;
  });
}

function toInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) return Number(value);
  return null;
}

export function blockTagNames(): ReadonlySet<string> {
  return BLOCK_TAGS;
}
