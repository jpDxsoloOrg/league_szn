# AWS MCP Server – Tutorial & Reference

This guide covers the **AWS MCP** server you configured in Cursor. It lets you run AWS CLI commands, search AWS docs, list regions, and follow AWS SOPs (Standard Operating Procedures) from the editor.

## Your configuration (from `mcp.json`)

```json
"AWS": {
  "command": "uvx mcp-proxy-for-aws@latest https://aws-mcp.us-east-1.api.aws/mcp --metadata AWS_REGION=us-west-2",
  "env": {
    "AWS_REGION": "us-east-1"
  },
  "args": []
}
```

- **Runtime**: `uvx` (Python/uv)
- **Region**: `us-east-1` (env overrides metadata)
- **Endpoint**: AWS MCP proxy at `https://aws-mcp.us-east-1.api.aws/mcp`

---

## What the AWS MCP can do

| Capability | Use case |
|------------|----------|
| **Run AWS CLI** | Run any `aws ...` command (no pipes/shell operators). |
| **Search AWS docs** | Find reference, troubleshooting, CDK, Amplify, CloudFormation. |
| **Read AWS docs** | Fetch a docs page and get markdown. |
| **List regions** | Get all region IDs and names. |
| **Regional availability** | Check if a product/API/CF resource is available in a region. |
| **Suggest commands** | Get CLI command suggestions from a natural-language description. |
| **SOPs** | Follow step-by-step AWS procedures (e.g. Lambda + API Gateway, secure S3). |

---

## 1. Running AWS CLI commands

**Tool**: Execute a single AWS CLI command (validated, no shell syntax).

**Rules:**

- Command must start with `aws`.
- No `|`, `>`, `$()`, or environment variables.
- For local file paths (e.g. `aws s3 cp` with local files), the MCP server may not have filesystem access; use the terminal for those.

**Examples (ask the AI to run these):**

```text
# List Lambda functions in us-east-1
aws lambda list-functions --region us-east-1

# Describe an S3 bucket
aws s3api get-bucket-location --bucket YOUR_BUCKET_NAME

# List Cognito User Pools
aws cognito-idp list-user-pools --max-results 10

# Get stack outputs (e.g. API Gateway URL)
aws cloudformation describe-stacks --stack-name wwe-2k-league-api-dev --query "Stacks[0].Outputs"
```

**In Cursor:** Describe what you want in natural language (e.g. “list my Lambda functions in us-east-1”). The AI will use the AWS MCP to run the right `aws` command.

---

## 2. Searching AWS documentation

**Tool**: Search AWS docs by topic (reference, troubleshooting, CDK, Amplify, CloudFormation, etc.).

**Example prompts:**

- “Search AWS docs for Lambda environment variables and timeouts.”
- “How do I fix AccessDenied on S3?”
- “CDK Lambda function TypeScript example.”
- “Amplify Auth with React.”

**Topics you can use:**

- `reference_documentation` – API, SDK, CLI
- `troubleshooting` – errors, debugging
- `general` – architecture, best practices
- `cdk_docs` / `cdk_constructs` – CDK
- `amplify_docs` – Amplify
- `cloudformation` – CloudFormation/SAM

---

## 3. Reading a specific AWS docs page

**Tool**: Fetch an AWS documentation URL and get markdown (with optional truncation).

**Example URLs:**

- `https://docs.aws.amazon.com/lambda/latest/dg/configuration-envvars.html`
- `https://docs.aws.amazon.com/AmazonS3/latest/userguide/bucketnamingrules.html`

**In Cursor:** Ask e.g. “Read the Lambda environment variables docs from docs.aws.amazon.com” and share the URL if needed.

---

## 4. Listing AWS regions

**Tool**: Get all AWS regions (e.g. for deployment or validation).

Useful when you need region codes (e.g. `us-east-1`, `eu-west-1`) for CLI or infrastructure.

---

## 5. Checking regional availability

**Tool**: Check if a product, API, or CloudFormation resource is available in a region.

**Example filters:**

- **Products**: `['AWS Lambda', 'Amazon S3']`
- **APIs**: `['Lambda+Invoke', 'EC2']`
- **CloudFormation**: `['AWS::Lambda::Function']`

**In Cursor:** Ask e.g. “Is AWS Lambda available in eu-west-1?” or “Which regions support this CloudFormation resource?”

---

## 6. Getting AWS CLI suggestions

**Tool**: Get suggested AWS CLI commands from a short description (when you’re not sure of the exact command).

**Example prompts:**

- “List all running EC2 instances in us-east-1.”
- “Create an S3 bucket with versioning and encryption.”
- “Get the size of my S3 bucket named my-backup-bucket.”

The AI can use this tool first, then run the chosen command with the “run AWS CLI” tool.

---

## 7. Using AWS SOPs (procedures)

**Tool**: Retrieve step-by-step execution plans for common AWS tasks.

**Some built-in SOPs:**

- `lambda-gateway-api` – REST API Gateway + Lambda
- `secure-s3-buckets` – S3 security best practices
- `launch-ec2-instance-with-best-practices` – EC2 launch
- `create-secrets-using-best-practices` – Secrets Manager
- `amplify-deployment-guide` – Amplify Gen2 deployment
- Others for VPC, EFS, CloudTrail, etc.

**In Cursor:** Ask e.g. “Follow the AWS SOP for securing S3 buckets” or “What’s the procedure for API Gateway and Lambda?”

---

## Quick reference: “Ask in Cursor” examples

| Goal | What to say |
|------|-------------|
| Run CLI | “List my Lambda functions in us-east-1” or “Describe stack wwe-2k-league-api-dev” |
| Find docs | “Search AWS docs for Lambda timeout troubleshooting” |
| Read a page | “Read this AWS doc: [URL]” |
| Regions | “List AWS regions” or “Is Lambda in ap-south-1?” |
| CLI help | “What’s the AWS CLI command to list EC2 instances?” |
| Procedure | “Get the AWS SOP for API Gateway and Lambda” |

---

## Troubleshooting

- **“Command must start with aws”** – Only raw `aws ...` commands are allowed; use the terminal for shell scripts.
- **File operations** – Commands that need local files (e.g. `aws s3 cp ./file s3://bucket/`) may need to be run in your terminal; the MCP server often has no local filesystem.
- **Region** – Your config uses `AWS_REGION=us-east-1`; for other regions, say “in eu-west-1” (or the right region) so the AI can add `--region eu-west-1`.
- **Auth** – The MCP uses your existing AWS credentials (e.g. profile or env). Ensure `league-szn` (or default) is configured if you rely on it.

---

## Links

- [AWS MCP](https://github.com/aws/aws-mcp) (if available)
- [AWS CLI reference](https://docs.aws.amazon.com/cli/latest/reference/)
