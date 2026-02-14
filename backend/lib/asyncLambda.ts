import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

const lambda = new LambdaClient({});

const SERVICE_NAME = process.env.SERVICE_NAME || 'wwe-2k-league-api';
const STAGE = process.env.STAGE || 'dev';

/**
 * Fire-and-forget async Lambda invocation.
 * Uses InvocationType 'Event' so the call returns immediately after Lambda
 * accepts the invocation (HTTP 202). The target function runs independently.
 */
export async function invokeAsync(
  functionName: string,
  payload?: Record<string, unknown>,
): Promise<void> {
  const fullName = `${SERVICE_NAME}-${STAGE}-${functionName}`;

  const command = new InvokeCommand({
    FunctionName: fullName,
    InvocationType: 'Event',
    Payload: payload ? Buffer.from(JSON.stringify(payload)) : undefined,
  });

  const response = await lambda.send(command);

  if (response.StatusCode !== 202) {
    throw new Error(
      `Async invocation of ${fullName} returned status ${response.StatusCode}`,
    );
  }
}
