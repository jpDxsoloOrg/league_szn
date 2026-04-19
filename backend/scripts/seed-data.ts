// Set up environment for local DynamoDB before importing anything
process.env.IS_OFFLINE = 'true';
process.env.DB_DRIVER = 'dynamo';

import type { APIGatewayProxyEvent, Context } from 'aws-lambda';
import { handler as seedDataHandler } from '../functions/admin/seedData';

async function seedData() {
  console.log('Starting to seed data via repository layer...\n');

  try {
    // Build a minimal API Gateway event to invoke the seed handler
    const event: APIGatewayProxyEvent = {
      body: null, // default mode — seeds all sample data
      headers: {},
      multiValueHeaders: {},
      httpMethod: 'POST',
      isBase64Encoded: false,
      path: '/admin/seed-data',
      pathParameters: null,
      queryStringParameters: null,
      multiValueQueryStringParameters: null,
      stageVariables: null,
      resource: '',
      requestContext: {
        authorizer: {
          groups: 'Admin',
          username: 'seed-script',
          email: 'seed@local',
          principalId: 'seed-user',
        },
      } as unknown as APIGatewayProxyEvent['requestContext'],
    };

    const result = await seedDataHandler(event, {} as Context, () => {});

    if (!result) {
      throw new Error('No result from seed handler');
    }

    const body = JSON.parse(result.body);

    if (result.statusCode !== 200) {
      throw new Error(`Seed failed (${result.statusCode}): ${body.message}`);
    }

    console.log(`✅ ${body.message}`);
    console.log('\nCreated counts:');
    for (const [key, count] of Object.entries(body.createdCounts as Record<string, number>)) {
      console.log(`  ${key}: ${count}`);
    }
  } catch (error) {
    console.error('Error seeding data:', error);
    throw error;
  }
}

seedData()
  .then(() => {
    console.log('\nDone!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Failed to seed data:', error);
    process.exit(1);
  });
