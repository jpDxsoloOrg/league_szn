#!/bin/bash
# Add the custom:wrestler_name attribute to the Cognito User Pool.
# Run this ONCE per environment after the first deploy with groups.
#
# Usage:
#   ./scripts/add-custom-attributes.sh <USER_POOL_ID>
#
# Example:
#   ./scripts/add-custom-attributes.sh us-east-1_o0xMTyzI5   # devtest
#   ./scripts/add-custom-attributes.sh us-east-1_JuxZ1KfPW   # prod/dev

set -e

USER_POOL_ID=${1:?"Usage: $0 <USER_POOL_ID>"}

echo "Adding custom:wrestler_name attribute to pool: $USER_POOL_ID"

aws cognito-idp add-custom-attributes \
  --user-pool-id "$USER_POOL_ID" \
  --custom-attributes \
    Name=wrestler_name,AttributeDataType=String,Mutable=true,StringAttributeConstraints="{MinLength=0,MaxLength=100}"

echo "Done. custom:wrestler_name attribute added."
