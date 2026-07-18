import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { htmlToText, loadSourceInput } from "../src/index.js";

describe("htmlToText", () => {
  it("drops script/style/head and keeps readable body text", () => {
    const html = `<!doctype html><html><head><title>x</title><style>.a{color:red}</style></head>
      <body><script>alert(1)</script><h1>Heading</h1><p>First sentence.</p><p>Second sentence.</p></body></html>`;
    const text = htmlToText(html);
    expect(text).not.toMatch(/alert|color:red|<[a-z]/i);
    expect(text).toContain("Heading");
    expect(text).toContain("First sentence.");
    expect(text).toContain("Second sentence.");
  });

  it("inserts boundaries so adjacent blocks do not fuse into one word", () => {
    expect(htmlToText("<p>alpha</p><p>beta</p>")).toBe("alpha\nbeta");
    expect(htmlToText("one<br>two")).toBe("one\ntwo");
  });

  it("decodes the common named and numeric entities", () => {
    expect(htmlToText("<p>Débarre &amp; Worobey &#8212; 5&nbsp;m</p>")).toBe("Débarre & Worobey \u2014 5 m");
    expect(htmlToText("<p>a &lt; b &gt; c &quot;q&quot; &#39;s&#39;</p>")).toBe('a < b > c "q" \'s\'');
  });
});

describe("loadSourceInput", () => {
  it("reads a local file and carries the explicit --url through untouched", async () => {
    const dir = await mkdtemp(join(tmpdir(), "egit-fetch-"));
    try {
      const file = join(dir, "src.txt");
      await writeFile(file, "local body text", "utf8");
      const { text, url } = await loadSourceInput(file, "https://example.org/paper");
      expect(text).toBe("local body text");
      expect(url).toBe("https://example.org/paper");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("leaves url undefined for a local file with no explicit --url", async () => {
    const dir = await mkdtemp(join(tmpdir(), "egit-fetch-"));
    try {
      const file = join(dir, "src.txt");
      await writeFile(file, "body", "utf8");
      const { url } = await loadSourceInput(file, undefined);
      expect(url).toBeUndefined();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
