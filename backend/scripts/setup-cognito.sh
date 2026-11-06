#!/bin/bash
# Post-deploy setup for Cognito User Pool.
# Safe to run on every deploy — steps 1 and 2 are idempotent.
#
# This script:
#   1. Adds the custom:wrestler_name attribute (idempotent)
#   2. Attaches the PostConfirmation Lambda trigger (idempotent)
#      2b. TEMPORARY: also attaches the PreSignUp auto-confirm trigger
#          (Cognito email cap workaround — see functions/auth/preSignUp.ts).
#          To remove it after the SES cutover, replace the PreSignUp merge
#          in Step 2 with `del(.PreSignUp)` for one deploy (the script
#          merges the pool's existing LambdaConfig, so simply deleting the
#          Lambda would leave a dangling trigger and break signups).
#   3. (OPTIONAL) Migrates ALL existing users into the Admin group.
#      Only runs when MIGRATE_USERS_TO_ADMIN=true. Skipped by default
#      because CI runs the script on every deploy and bulk-promoting
#      every wrestler to Admin would be a security regression.
#
# Usage:
#   ./scripts/setup-cognito.sh <USER_POOL_ID> <STAGE>
#   MIGRATE_USERS_TO_ADMIN=true ./scripts/setup-cognito.sh <USER_POOL_ID> <STAGE>
#
# Example:
#   ./scripts/setup-cognito.sh us-east-1_o0xMTyzI5 devtest
#   ./scripts/setup-cognito.sh us-east-1_JuxZ1KfPW dev

set -e

USER_POOL_ID=${1:?"Usage: $0 <USER_POOL_ID> <STAGE>"}
STAGE=${2:?"Usage: $0 <USER_POOL_ID> <STAGE>"}
REGION=${AWS_REGION:-us-east-1}
SERVICE_NAME="wwe-2k-league-api"

echo "=== Cognito Setup for ${STAGE} (${USER_POOL_ID}) ==="
echo ""

# Step 1: Add custom attribute
echo "Step 1: Adding custom:wrestler_name attribute..."
EXISTING_ATTRIBUTE=$(aws cognito-idp describe-user-pool \
  --user-pool-id "$USER_POOL_ID" \
  --query "UserPool.SchemaAttributes[?Name=='custom:wrestler_name'].Name" \
  --output text \
  --region "$REGION")

if [ -n "$EXISTING_ATTRIBUTE" ]; then
  echo "  Already exists (skipping)"
else
  aws cognito-idp add-custom-attributes \
    --user-pool-id "$USER_POOL_ID" \
    --custom-attributes \
      'Name=wrestler_name,AttributeDataType=String,Mutable=true,StringAttributeConstraints={MinLength=0,MaxLength=100}' \
    --region "$REGION"
  echo "  Added custom:wrestler_name"
fi

# Step 2: Attach PostConfirmation trigger
echo ""
echo "Step 2: Attaching PostConfirmation Lambda trigger..."

# Get the Lambda ARN from the deployed stack
LAMBDA_ARN=$(aws lambda get-function \
  --function-name "${SERVICE_NAME}-${STAGE}-postConfirmation" \
  --query 'Configuration.FunctionArn' \
  --output text \
  --region "$REGION") || LAMBDA_ARN=""

if [ -z "$LAMBDA_ARN" ] || [ "$LAMBDA_ARN" = "None" ]; then
  echo "  ERROR: PostConfirmation Lambda not found. Deploy the stack first."
  exit 1
fi

echo "  Lambda ARN: $LAMBDA_ARN"

# TEMPORARY (Step 2b): PreSignUp auto-confirm trigger — see header comment.
PRESIGNUP_LAMBDA_ARN=$(aws lambda get-function \
  --function-name "${SERVICE_NAME}-${STAGE}-preSignUp" \
  --query 'Configuration.FunctionArn' \
  --output text \
  --region "$REGION") || PRESIGNUP_LAMBDA_ARN=""

if [ -z "$PRESIGNUP_LAMBDA_ARN" ] || [ "$PRESIGNUP_LAMBDA_ARN" = "None" ]; then
  echo "  ERROR: PreSignUp Lambda not found. Deploy the stack first."
  exit 1
fi

echo "  PreSignUp Lambda ARN: $PRESIGNUP_LAMBDA_ARN"

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

# Add a Lambda permission for Cognito to invoke a trigger. A statement that
# already exists is the normal case on redeploys; any other error stops the run.
add_cognito_invoke_permission() {
  local function_name=$1
  local statement_id=$2
  local error_output

  if error_output=$(aws lambda add-permission \
    --function-name "$function_name" \
    --statement-id "$statement_id" \
    --action "lambda:InvokeFunction" \
    --principal "cognito-idp.amazonaws.com" \
    --source-arn "arn:aws:cognito-idp:${REGION}:${ACCOUNT_ID}:userpool/${USER_POOL_ID}" \
    --region "$REGION" \
    2>&1 >/dev/null); then
    echo "  Lambda permission added: ${statement_id}"
  elif echo "$error_output" | grep -q "ResourceConflictException"; then
    echo "  Permission already exists: ${statement_id} (skipping)"
  else
    echo "  ERROR: could not add Lambda permission ${statement_id}:" >&2
    echo "$error_output" >&2
    exit 1
  fi
}

add_cognito_invoke_permission "${SERVICE_NAME}-${STAGE}-postConfirmation" "CognitoPostConfirmation"
add_cognito_invoke_permission "${SERVICE_NAME}-${STAGE}-preSignUp" "CognitoPreSignUp"

# Update the User Pool to use the PostConfirmation trigger.
#
# IMPORTANT: aws cognito-idp update-user-pool is *destructive* — any
# parameter not present in the request is reset to its default value
# (e.g. AutoVerifiedAttributes back to [], EmailConfiguration cleared,
# AdminCreateUserConfig reset). To avoid wiping the pool's config on
# every deploy, we read the current state with describe-user-pool,
# merge in the new LambdaConfig, and pass the full payload back.
echo "  Reading current User Pool config to preserve settings…"
CURRENT_POOL=$(aws cognito-idp describe-user-pool \
  --user-pool-id "$USER_POOL_ID" \
  --region "$REGION")

# TEMPORARY: PreSignUp is merged in below — after the SES cutover, change
# `.PreSignUp = $preSignUpArn` to `del(.PreSignUp)` for one deploy to
# detach the trigger (see header comment).
UPDATE_PAYLOAD=$(echo "$CURRENT_POOL" | jq \
  --arg lambdaArn "$LAMBDA_ARN" \
  --arg preSignUpArn "$PRESIGNUP_LAMBDA_ARN" \
  --arg userPoolId "$USER_POOL_ID" \
  '{
    UserPoolId: $userPoolId,
    Policies: .UserPool.Policies,
    DeletionProtection: "ACTIVE",
    LambdaConfig: ((.UserPool.LambdaConfig // {}) | .PostConfirmation = $lambdaArn | .PreSignUp = $preSignUpArn),
    AutoVerifiedAttributes: .UserPool.AutoVerifiedAttributes,
    SmsVerificationMessage: .UserPool.SmsVerificationMessage,
    EmailVerificationMessage: .UserPool.EmailVerificationMessage,
    EmailVerificationSubject: .UserPool.EmailVerificationSubject,
    VerificationMessageTemplate: .UserPool.VerificationMessageTemplate,
    SmsAuthenticationMessage: .UserPool.SmsAuthenticationMessage,
    UserAttributeUpdateSettings: .UserPool.UserAttributeUpdateSettings,
    MfaConfiguration: .UserPool.MfaConfiguration,
    DeviceConfiguration: .UserPool.DeviceConfiguration,
    EmailConfiguration: .UserPool.EmailConfiguration,
    SmsConfiguration: .UserPool.SmsConfiguration,
    UserPoolTags: .UserPool.UserPoolTags,
    AdminCreateUserConfig: .UserPool.AdminCreateUserConfig,
    UserPoolAddOns: .UserPool.UserPoolAddOns,
    AccountRecoverySetting: .UserPool.AccountRecoverySetting
  } | with_entries(select(.value != null))')

aws cognito-idp update-user-pool \
  --cli-input-json "$UPDATE_PAYLOAD" \
  --region "$REGION"
echo "  PostConfirmation + PreSignUp triggers attached (preserving existing pool config)"

# Step 3: (Optional, opt-in) Migrate existing users to Admin group.
# Skipped by default — see header comment.
COUNT=0
if [ "${MIGRATE_USERS_TO_ADMIN:-false}" = "true" ]; then
  echo ""
  echo "Step 3: MIGRATE_USERS_TO_ADMIN=true — migrating existing users to Admin group..."

  USERS=$(aws cognito-idp list-users \
    --user-pool-id "$USER_POOL_ID" \
    --query 'Users[].Username' \
    --output text \
    --region "$REGION")

  for USERNAME in $USERS; do
    aws cognito-idp admin-add-user-to-group \
      --user-pool-id "$USER_POOL_ID" \
      --username "$USERNAME" \
      --group-name "Admin" \
      --region "$REGION" \
      2>/dev/null && echo "  Added $USERNAME to Admin" || echo "  Failed to add $USERNAME"
    COUNT=$((COUNT + 1))
  done
else
  echo ""
  echo "Step 3: Skipped (MIGRATE_USERS_TO_ADMIN not set to true)."
fi

echo ""
echo "=== Setup complete ==="
echo "  Custom attribute: wrestler_name"
echo "  PostConfirmation trigger: attached"
echo "  PreSignUp trigger (TEMPORARY auto-confirm): attached"
if [ "${MIGRATE_USERS_TO_ADMIN:-false}" = "true" ]; then
  echo "  Users migrated to Admin: $COUNT"
fi
