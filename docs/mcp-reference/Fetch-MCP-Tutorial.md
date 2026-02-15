# Fetch MCP Server – Tutorial & Reference

This guide covers the **Fetch MCP** server you configured in Cursor. It fetches URLs from the internet and can return the content as markdown, so you can pull in docs, articles, or API responses without leaving the editor.

## Your configuration (from `mcp.json`)

```json
"fetch": {
  "command": "uvx",
  "args": ["mcp-server-fetch"]
}
```

- **Runtime**: `uvx` (runs the `mcp-server-fetch` package).
- **No env or URL allowlist** in your snippet; the server may apply its own rules (e.g. allowed hosts or size limits).

---

## What the Fetch MCP can do

| Capability | Description |
|------------|-------------|
| **Fetch URL** | HTTP GET a URL and return the response. |
| **As markdown** | Convert HTML (or other content) to readable markdown. |
| **Control length** | Limit response size with `max_length` (default often ~5000 chars). |
| **Resume long docs** | Use `start_index` to get the next chunk after a truncated response. |

---

## Parameters (typical)

| Parameter     | Type    | Default | Description |
|--------------|---------|---------|-------------|
| `url`        | string  | required | Full URL to fetch (e.g. `https://example.com/page`). |
| `max_length` | integer | 5000    | Max characters to return. Increase for long pages. |
| `start_index`| integer | 0       | Character index to start from (for pagination/continuation). |
| `raw`        | boolean | false   | If true, return raw HTML instead of simplified markdown. |

---

## Example use cases

### 1. Read a documentation page

**Goal:** Get the content of a docs page as markdown.

**In Cursor:** “Fetch this URL and give me the content as markdown: https://docs.aws.amazon.com/lambda/latest/dg/welcome.html”

**Typical flow:** The AI calls the fetch tool with `url` and optionally `max_length`. You get a markdown summary of the page.

---

### 2. Get an API’s public description

**Goal:** Pull the “what is this API?” section from a public API doc.

**In Cursor:** “Fetch https://developer.github.com/v3/ and summarize the main sections.”

---

### 3. Read a long article in chunks

**Goal:** Page through a long document.

- First request: `url`, `max_length` (e.g. 10000).
- If the response says “truncated” or gives a character count, second request: same `url`, `start_index` = previous length, same `max_length`.

**In Cursor:** “Fetch this long doc; if it’s truncated, continue from where it left off.”

---

### 4. Check a changelog or release note

**Goal:** Get the text of a release page or changelog.

**In Cursor:** “Fetch the content of https://github.com/org/repo/releases/tag/v1.2.0”

---

## Example “prompts” to use in Cursor

| You want to… | Say… |
|--------------|------|
| Get a page as markdown | “Fetch https://example.com/doc and return the content as markdown.” |
| Get more of a long page | “Continue fetching that URL from character index 5000.” |
| Get raw HTML | “Fetch this URL and return the raw HTML: [url].” |
| Stay within size limit | “Fetch this URL but limit the response to 3000 characters.” |

---

## Tips

- **HTTPS:** Prefer `https://` URLs; some servers or MCP configs may block or restrict `http://`.
- **Length:** For long pages, use a larger `max_length` or multiple requests with `start_index`.
- **Rate limits / politeness:** Avoid asking for many different URLs in a tight loop; the server may rate-limit or the site may block.
- **Auth:** This MCP is for **public** URLs. It does not send cookies or auth headers; use other tools or the browser for logged-in content.

---

## Troubleshooting

| Issue | What to try |
|-------|-------------|
| Empty or short response | Increase `max_length` or ask to “continue from index X”. |
| “URL not allowed” or error | Server or tool may restrict to certain domains; try a different URL or use the browser MCP for that site. |
| Wrong encoding or garbled text | Ask for “raw” and then “convert to markdown” or try a different page. |
| Timeout | URL might be slow or blocking automated requests; try again or use a different source. |

---

## Comparison with other MCPs

| Need | Prefer |
|------|--------|
| Public URL → markdown/text | **Fetch MCP** |
| Interact with a page (click, type, form) | Browser MCP (e.g. cursor-ide-browser) |
| AWS docs only | **AWS MCP** “search/read documentation” |
| GitHub repo/API data | **GitHub MCP** |

Use Fetch when you want to **pull in content from an arbitrary public URL** and work with it in the chat or in code.
