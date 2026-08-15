import { PreSignUpTriggerHandler } from 'aws-lambda';

/**
 * TEMPORARY — Pre-SignUp trigger that auto-confirms new users so Cognito
 * never sends a verification email.
 *
 * Why: the AWS account is capped at 50 Cognito-sent emails/day (shared
 * across every user pool in the region), so signup verification emails
 * fail once the account-wide budget is spent. Until SES production access
 * is granted and the pool's email sender is switched to SES
 * (no-reply@jpdxsolo.com), we skip email verification entirely.
 *
 * REMOVE THIS TRIGGER as part of the SES cutover:
 *   1. Delete this file and the `preSignUp` function in serverless.yml.
 *   2. Detach the trigger from the pool — setup-cognito.sh merges the
 *      pool's existing LambdaConfig on every run, so the PreSignUp entry
 *      must be explicitly cleared there (see Step 2b in that script).
 *
 * The PostConfirmation trigger still fires for auto-confirmed users, so
 * Wrestler-group assignment and Player creation are unaffected. Users
 * created while this trigger is live have unverified-but-trusted emails.
 */
export const handler: PreSignUpTriggerHandler = async (event) => {
  event.response.autoConfirmUser = true;
  if (event.request.userAttributes['email']) {
    event.response.autoVerifyEmail = true;
  }
  return event;
};
