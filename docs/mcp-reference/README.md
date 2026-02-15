# MCP Server Tutorials & Reference

This folder contains tutorials and reference docs for the **MCP (Model Context Protocol) servers** configured in your Cursor `mcp.json`.

## Your setup

Config file: **`~/.cursor/mcp.json`** (or project-level `.cursor/mcp.json`).

| Server    | Purpose |
|----------|--------|
| **AWS**  | Run AWS CLI, search/read AWS docs, list regions, check availability, follow AWS SOPs. |
| **Fetch**| Fetch public URLs and get content as markdown. |
| **GitHub** | Repos, issues, PRs, search, file ops, reviews, merge. |

*(You also have `browsermcp` configured for browser automation; these docs focus on AWS, Fetch, and GitHub.)*

## Tutorials

| File | Description |
|------|-------------|
| [AWS-MCP-Tutorial.md](./AWS-MCP-Tutorial.md) | AWS CLI, docs search, regions, availability, SOPs, and example prompts. |
| [Fetch-MCP-Tutorial.md](./Fetch-MCP-Tutorial.md) | Fetching URLs, markdown conversion, length and pagination. |
| [GitHub-MCP-Tutorial.md](./GitHub-MCP-Tutorial.md) | Repos, files, issues, PRs, search, reviews, and permissions. |

## How to use these in Cursor

1. Open the tutorial for the server you care about (AWS, Fetch, or GitHub).
2. Use the **“Ask in Cursor”** / **Quick reference** tables to phrase prompts.
3. The AI will call the right MCP tools and show you results or next steps.

## Security note

- **GitHub:** Your `GITHUB_PERSONAL_ACCESS_TOKEN` in `mcp.json` should be in env or a secrets manager, not committed. Rotate the token if it was ever exposed.
- **AWS:** The AWS MCP uses your existing AWS credentials (e.g. `league-szn` profile); no secrets are stored in these docs.
