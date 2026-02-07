#!/bin/bash
# Post-deploy setup for Cognito User Pool.
# Run this ONCE per environment after deploying the stack.
#
# This script:
#   1. Adds the custom:wrestler_name attribute
#   2. Attaches the PostConfirmation Lambda trigger (auto-assign Fantasy group)
#   3. Migrates existing users to the Admin group
#
# Usage:
#   ./scripts/setup-cognito.sh <USER_POOL_ID> <STAGE>
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
aws cognito-idp add-custom-attributes \
  --user-pool-id "$USER_POOL_ID" \
  --custom-attributes \
    'Name=wrestler_name,AttributeDataType=String,Mutable=true,StringAttributeConstraints={MinLength=0,MaxLength=100}' \
  2>/dev/null && echo "  Added custom:wrestler_name" || echo "  Already exists (skipping)"

# Step 2: Attach PostConfirmation trigger
echo ""
echo "Step 2: Attaching PostConfirmation Lambda trigger..."

# Get the Lambda ARN from the deployed stack
LAMBDA_ARN=$(aws lambda get-function \
  --function-name "${SERVICE_NAME}-${STAGE}-postConfirmation" \
  --query 'Configuration.FunctionArn' \
  --output text \
  --region "$REGION" 2>/dev/null)

if [ -z "$LAMBDA_ARN" ] || [ "$LAMBDA_ARN" = "None" ]; then
  echo "  ERROR: PostConfirmation Lambda not found. Deploy the stack first."
  exit 1
fi

echo "  Lambda ARN: $LAMBDA_ARN"

# Add Lambda permission for Cognito to invoke it
aws lambda add-permission \
  --function-name "${SERVICE_NAME}-${STAGE}-postConfirmation" \
  --statement-id "CognitoPostConfirmation" \
  --action "lambda:InvokeFunction" \
  --principal "cognito-idp.amazonaws.com" \
  --source-arn "arn:aws:cognito-idp:${REGION}:$(aws sts get-caller-identity --query Account --output text):userpool/${USER_POOL_ID}" \
  --region "$REGION" \
  2>/dev/null && echo "  Lambda permission added" || echo "  Permission already exists (skipping)"

# Update the User Pool to use the PostConfirmation trigger
aws cognito-idp update-user-pool \
  --user-pool-id "$USER_POOL_ID" \
  --lambda-config "PostConfirmation=$LAMBDA_ARN" \
  --region "$REGION"
echo "  PostConfirmation trigger attached"

# Step 3: Migrate existing users to Admin group
echo ""
echo "Step 3: Migrating existing users to Admin group..."

USERS=$(aws cognito-idp list-users \
  --user-pool-id "$USER_POOL_ID" \
  --query 'Users[].Username' \
  --output text \
  --region "$REGION")

COUNT=0
for USERNAME in $USERS; do
  aws cognito-idp admin-add-user-to-group \
    --user-pool-id "$USER_POOL_ID" \
    --username "$USERNAME" \
    --group-name "Admin" \
    --region "$REGION" \
    2>/dev/null && echo "  Added $USERNAME to Admin" || echo "  Failed to add $USERNAME"
  COUNT=$((COUNT + 1))
done

echo ""
echo "=== Setup complete ==="
echo "  Custom attribute: wrestler_name"
echo "  PostConfirmation trigger: attached"
echo "  Users migrated to Admin: $COUNT"
