import test from "node:test";
import assert from "node:assert/strict";
import {
  htmlToText,
  normalizeChapterContent,
  sanitizeHtml,
} from "../dist/index.js";

test("sanitizeHtml preserves formatting and removes executable markup", () => {
  const html = sanitizeHtml(
    '<p style="text-align:center" onclick="evil()"><b>Hello</b> <i>world</i><script>alert(1)</script><a href="javascript:evil()">bad</a><a href="/safe">safe</a></p>',
    "https://ranobelib.me",
  );
  assert.equal(
    html,
    '<p style="text-align:center"><strong>Hello</strong> <em>world</em><a>bad</a><a href="https://ranobelib.me/safe" rel="noopener noreferrer">safe</a></p>',
  );
});

test("ProseMirror content keeps paragraphs, marks, links, breaks and images", () => {
  const content = normalizeChapterContent(
    {
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { textAlign: "center" },
          content: [
            { type: "text", text: "Bold", marks: [{ type: "bold" }] },
            { type: "hardBreak" },
            { type: "text", text: "link", marks: [{ type: "link", attrs: { href: "/x" } }] },
          ],
        },
        { type: "image", attrs: { images: [{ image: "image-1", alt: "Art" }] } },
      ],
    },
    [{ name: "image-1", url: "/uploads/a.jpg" }],
    "https://ranobelib.me",
  );
  assert.match(content.html, /<p style="text-align:center"><strong>Bold<\/strong><br>/);
  assert.match(content.html, /href="https:\/\/ranobelib\.me\/x"/);
  assert.match(content.html, /src="https:\/\/ranobelib\.me\/uploads\/a\.jpg"/);
  assert.equal(content.rawFormat, "prosemirror");
  assert.equal(content.text, "Bold\nlink\nArt");
  assert.equal(content.sha256.length, 64);
});

test("HTML chapter content is normalized and converted to readable text", () => {
  const content = normalizeChapterContent(
    '<h2>Title</h2><p>First<br>Second &amp; third</p><img src="https://cdn.test/a.jpg" alt="Map">',
    [],
    "https://ranobelib.me",
  );
  assert.equal(content.rawFormat, "html");
  assert.equal(content.text, "Title\nFirst\nSecond & third\nMap");
  assert.equal(htmlToText(content.html), content.text);
});

test("HTML chapter content keeps legacy lazy-loaded illustrations", () => {
  const content = normalizeChapterContent(
    '<p>Before</p><img data-src="/uploads/legacy-art.webp" alt="Legacy art"><img data-original="https://cdn.example/map.png">',
    [],
    "https://ranobelib.me",
  );
  assert.equal(
    content.html,
    '<p>Before</p><img src="https://ranobelib.me/uploads/legacy-art.webp" alt="Legacy art" loading="lazy"><img src="https://cdn.example/map.png" alt="" loading="lazy">',
  );
  assert.equal(content.text, "Before\nLegacy art");
});
