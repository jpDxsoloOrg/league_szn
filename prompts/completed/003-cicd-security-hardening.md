<objective>
Fix TWO CI/CD security issues in the GitHub Actions deploy workflows: add the ADMIN_SETUP_KEY secret to prevent unauthorized admin creation, and exclude source map files from S3 deployment to prevent source code exposure.
</objective>

<context>
This is a WWE 2K League Management app deployed via GitHub Actions to AWS.

Current state:
- `backend/serverless.yml` line 31 sets `ADMIN_SETUP_KEY: ${env:ADMIN_SETUP_KEY, 'default-dev-key-change-in-production'}` — the default fallback is guessable and visible in the public repo. The `/auth/setup` endpoint is unauthenticated, so anyone reading the repo can create Admin users.
- Neither deploy workflow (`.github/workflows/deploy-prod.yml`, `.github/workflows/deploy-dev.yml`) passes `ADMIN_SETUP_KEY` as an environment variable to the serverless deploy step.
- The frontend build uses `sourcemap: 'hidden'` which generates .map files without URL references, but `aws s3 sync dist` still uploads them to the public S3 bucket where they're accessible via guessable URLs (e.g., `assets/index-abc123.js.map`).

Files to modify:
- `.github/workflows/deploy-prod.yml`
- `.github/workflows/deploy-dev.yml`
</context>

<requirements>
1. Read both workflow files first to confirm current state

2. **Add ADMIN_SETUP_KEY to both deploy workflows**:
   - In `deploy-prod.yml`, add `ADMIN_SETUP_KEY: ${{ secrets.ADMIN_SETUP_KEY }}` to the `env:` block of the "Deploy backend to production" step (the `npx serverless deploy` step)
   - In `deploy-dev.yml`, add `ADMIN_SETUP_KEY: ${{ secrets.ADMIN_SETUP_KEY }}` to the `env:` block of the "Deploy backend to dev" step
   - The env vars already exist on those steps (AWS keys + ACM cert), just add to them

3. **Exclude source maps from S3 sync in both workflows**:
   - In `deploy-prod.yml`, change:
     `aws s3 sync dist s3://leagueszn.jpdxsolo.com --delete`
     to:
     `aws s3 sync dist s3://leagueszn.jpdxsolo.com --delete --exclude "*.map"`
   - In `deploy-dev.yml`, change:
     `aws s3 sync dist s3://dev.leagueszn.jpdxsolo.com --delete`
     to:
     `aws s3 sync dist s3://dev.leagueszn.jpdxsolo.com --delete --exclude "*.map"`

4. Do NOT modify any other files
5. Do NOT change any other parts of the workflow files
</requirements>

<verification>
After making changes, verify:
1. Both workflows now have `ADMIN_SETUP_KEY: ${{ secrets.ADMIN_SETUP_KEY }}` in the serverless deploy step
2. Both S3 sync commands now include `--exclude "*.map"`
3. No other lines were changed
4. YAML syntax is valid (proper indentation)
</verification>

<success_criteria>
- `ADMIN_SETUP_KEY` is passed to serverless deploy in both prod and dev workflows
- Source map files (.map) are excluded from S3 sync in both workflows
- Workflow YAML files are syntactically valid
- No unrelated changes introduced
</success_criteria>
