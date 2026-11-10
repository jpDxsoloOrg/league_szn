import { PreSignUpTriggerHandler } from 'aws-lambda';
import { isSignupRefused } from '../../lib/accountStatus';

const SIGNUP_REFUSED_MESSAGE = 'This account cannot be registered. Please contact an administrator.';

/**
 * Pre-SignUp trigger. It does two jobs:
 *
 * 1. Refuses a signup that matches a blocked or deactivated player's email or
 *    PSN ID. This is permanent. It stays after the SES cutover.
 * 2. TEMPORARY: auto-confirms new users so Cognito never sends a verification
 *    email.
 *
 * Why: the AWS account is capped at 50 Cognito-sent emails/day (shared
 * across every user pool in the region), so signup verification emails
 * fail once the account-wide budget is spent. Until SES production access
 * is granted and the pool's email sender is switched to SES
 * (no-reply@jpdxsolo.com), we skip email verification entirely.
 *
 * At the SES cutover KEEP THIS HANDLER and the trigger, and drop only the
 * auto-confirm lines below.
 *
 * The PostConfirmation trigger still fires for auto-confirmed users, so
 * Wrestler-group assignment and Player creation are unaffected. Users
 * created while this trigger is live have unverified-but-trusted emails.
 */
export const handler: PreSignUpTriggerHandler = async (event) => {
  const { email, 'custom:psn_id': psnId } = event.request.userAttributes;
  if (await isSignupRefused({ email, psnId })) {
    throw new Error(SIGNUP_REFUSED_MESSAGE);
  }

  event.response.autoConfirmUser = true;
  if (email) {
    event.response.autoVerifyEmail = true;
  }
  return event;
};
