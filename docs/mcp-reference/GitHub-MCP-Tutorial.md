# GitHub MCP Server – Tutorial & Reference

This guide covers the **GitHub MCP** server you configured in Cursor. It talks to GitHub (repos, issues, PRs, files, search) so you can query and manage your project without leaving the editor.

## Your configuration (from `mcp.json`)

```json
"GitHub": {
  "command": "docker run -i --rm -e GITHUB_PERSONAL_ACCESS_TOKEN ghcr.io/github/github-mcp-server",
  "env": {
    "GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_..."
  },
  "args": []
}
```

- **Runtime**: Docker image `ghcr.io/github/github-mcp-server`.
- **Auth**: Token passed via `GITHUB_PERSONAL_ACCESS_TOKEN` (classic PAT or fine-grained).
- **Security:** Store the token in env or a secrets manager; do not commit it. Rotate if exposed.

---

## What the GitHub MCP can do

| Category | Examples |
|----------|----------|
| **Repos** | List branches, get file/dir contents, create/update/delete files, create repo. |
| **Issues** | List, create, update, read, search issues; add/remove labels; sub-issues. |
| **Pull requests** | List, create, update, get diff/status/files; reviews and review comments; merge; update branch. |
| **Search** | Search code, issues, PRs, repos, users. |
| **Commits & history** | List commits, get commit details (with optional diff). |
| **Releases & tags** | List releases, get release by tag; list tags, get tag. |
| **Collaboration** | Request Copilot review; assign Copilot to an issue; add PR/issue comments. |

---

## 1. Repository and file operations

### Get file or directory contents

- **Get a file:** From default branch or a specific `ref` (branch/tag/SHA).
- **Get a directory:** List contents of a path.

**Example prompts:**

- “Get the contents of `README.md` in jpDxsolo/league_szn.”
- “List files in the `backend/functions` directory of jpDxsolo/league_szn on branch feat/seedAdmin.”

**Typical parameters:** `owner`, `repo`, `path`, optional `ref` or `sha`.

---

### Create or update a file

- **Create:** Provide branch, path, content, message.
- **Update:** Same, plus **SHA** of the current file (from `git ls-tree HEAD <path>` or API).

**Example prompts:**

- “Create a file `docs/contributing.md` in jpDxsolo/league_szn on branch main with content ‘# Contributing …’.”
- “Update `serverless.yml` in jpDxsolo/league_szn: add this environment variable …”

---

### Push multiple files (single commit)

- **Tool:** Push an array of `{ path, content }` in one commit.

**Example:** “Push these 3 files to branch `feat/docs` in jpDxsolo/league_szn: …”

---

## 2. Branches

- **List branches:** Paginated list for a repo.
- **Create branch:** From default or a given `from_branch`.

**Example:** “List branches in jpDxsolo/league_szn” or “Create branch `fix/auth` from `main` in jpDxsolo/league_szn.”

---

## 3. Issues

- **List issues:** By state (open/closed), labels, sort, pagination.
- **Search issues:** Full search syntax (e.g. `is:issue author:me label:bug`).
- **Create / update:** Create with title, body, labels, assignees; update state, labels, etc.
- **Read:** Get issue, comments, sub-issues, labels.
- **Sub-issues:** Add, remove, reprioritize sub-issues.

**Example prompts:**

- “List open issues in jpDxsolo/league_szn.”
- “Create an issue in jpDxsolo/league_szn: title ‘Add API docs’, body ‘We need OpenAPI docs’.”
- “Search issues in jpDxsolo/league_szn: ‘label:bug is:open’.”

---

## 4. Pull requests

- **List PRs:** By state (open/closed), base/head, sort.
- **Search PRs:** e.g. `is:pr author:me`.
- **Create PR:** Base branch, head branch, title, body, draft, maintainer_can_modify.
- **Read:** Get PR, diff, status, files changed, review comments, reviews, general comments.
- **Update:** Title, body, base, draft, state, reviewers.
- **Review:** Create review (approve / request changes / comment), add line comments to pending review, submit or delete pending review.
- **Merge:** Merge with optional method (merge/squash/rebase), commit title/body.
- **Update branch:** Rebase/merge base into PR branch (optional `expectedHeadSha`).

**Example prompts:**

- “List open PRs in jpDxsolo/league_szn.”
- “Create a PR in jpDxsolo/league_szn: head `feat/seedAdmin`, base `main`, title ‘Seed admin script’.”
- “Get the diff for PR #42 in jpDxsolo/league_szn.”
- “Add a review comment on PR #42, file `backend/package.json`, line 10: ‘Consider pinning this dependency’.”
- “Merge PR #42 in jpDxsolo/league_szn with squash.”

---

## 5. Search

- **Code:** Query across repos (e.g. `repo:jpDxsolo/league_szn language:TypeScript createMatch`).
- **Issues:** e.g. `repo:jpDxsolo/league_szn is:issue label:enhancement`.
- **PRs:** e.g. `repo:jpDxsolo/league_szn is:pr is:open`.
- **Repositories:** e.g. `user:jpDxsolo language:TypeScript`.
- **Users:** e.g. `followers:>100 location:seattle`.

**Example prompts:**

- “Search code in jpDxsolo/league_szn for ‘authorizer’.”
- “Search open PRs in jpDxsolo/league_szn.”

---

## 6. Commits and history

- **List commits:** By branch/SHA, optional author, pagination.
- **Get commit:** Details with optional diff and file stats.

**Example:** “List last 10 commits on main in jpDxsolo/league_szn” or “Get commit abc123 in jpDxsolo/league_szn with diff.”

---

## 7. Releases and tags

- **List releases:** Paginated.
- **Get release:** By tag or “latest.”
- **List tags** / **Get tag:** Inspect tags.

**Example:** “Get the latest release in jpDxsolo/league_szn.”

---

## 8. Collaboration (Copilot, reviews, comments)

- **Request Copilot review:** On a PR.
- **Assign Copilot to issue:** Optional base ref and custom instructions.
- **Add issue/PR comment:** General comment (e.g. “LGTM” on an issue or PR).
- **Add review comment:** On a specific line (or range) of the PR diff; requires a pending review, then submit.

**Example:** “Request a Copilot review on PR #42 in jpDxsolo/league_szn.”

---

## Quick reference: “Ask in Cursor” examples

| Goal | What to say |
|------|-------------|
| Read file | “Get contents of `backend/serverless.yml` in jpDxsolo/league_szn.” |
| List dir | “List files in `frontend/src` in jpDxsolo/league_szn.” |
| Create file | “Create `docs/API.md` on branch `main` in jpDxsolo/league_szn with ….” |
| List issues | “List open issues in jpDxsolo/league_szn.” |
| Create issue | “Create an issue in jpDxsolo/league_szn: title ‘…’, body ‘…’.” |
| List PRs | “List open pull requests in jpDxsolo/league_szn.” |
| Create PR | “Create a PR from feat/seedAdmin to main in jpDxsolo/league_szn.” |
| PR diff | “Get the diff for PR #X in jpDxsolo/league_szn.” |
| Review PR | “Add a review comment on PR #X on file Y, line Z: ‘…’.” |
| Merge PR | “Merge PR #X in jpDxsolo/league_szn (squash).” |
| Search code | “Search jpDxsolo/league_szn for ‘DynamoDB’.” |
| My user | “Get my GitHub user (for permissions/context).” |

---

## Permissions and token scope

Your PAT must have scopes that match what you do:

- **Repo (code, issues, PRs):** `repo` (or fine-grained: Contents, Pull requests, Issues, etc.).
- **Workflows (if you use them via API):** `workflow`.
- **Optional:** `read:org`, `user` for org and profile.

If the AI gets 403 or “resource not accessible,” check token scopes and repo permissions. Use **get_me** to confirm the authenticated user.

---

## Best practices

1. **Repo/owner:** Always specify `owner` and `repo` (e.g. `jpDxsolo`, `league_szn`).
2. **PR review comments:** Create a pending review, add line comments, then submit the review.
3. **Update file:** Use the blob SHA of the current file when updating to avoid overwriting others’ changes.
4. **Search:** Use `search_*` for targeted queries; use `list_*` for “all” with filters/pagination.
5. **Templates:** Check for `.github/PULL_REQUEST_TEMPLATE.md` (or similar) when creating PRs and use it in the body.

---

## Troubleshooting

| Issue | What to check |
|-------|----------------|
| 401 Unauthorized | Token valid, not expired, and passed correctly in `env`. |
| 403 Forbidden | Token scopes and repo access (org/repo permissions). |
| 404 Not found | Correct owner/repo, branch/ref, and path. |
| “Resource not accessible” | Fine-grained token repository access and permissions. |
| Review submission fails | Pending review must exist before submitting; use the same user that started the review. |

---

## Links

- [GitHub MCP Server](https://github.com/github/github-mcp-server) (or official docs)
- [GitHub REST API](https://docs.github.com/en/rest)
- [Search syntax](https://docs.github.com/en/search-github)
