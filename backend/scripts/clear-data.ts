// Set up environment for local DynamoDB before importing repositories
process.env.IS_OFFLINE = 'true';
process.env.DB_DRIVER = 'dynamo';

import { getRepositories } from '../lib/repositories';

async function clearAllData() {
  console.log('Starting to clear all data from local DynamoDB...\n');

  try {
    const { clearAllData: clearAll } = getRepositories();
    const results = await clearAll();

    for (const [key, { deleted, errors }] of Object.entries(results)) {
      if (deleted > 0 || errors > 0) {
        const errorStr = errors > 0 ? ` (${errors} errors)` : '';
        console.log(`  ✓ ${key}: deleted ${deleted} items${errorStr}`);
      } else {
        console.log(`  No items to delete in ${key}`);
      }
    }

    console.log('\n✅ All data cleared successfully!');
  } catch (error) {
    console.error('Error clearing data:', error);
    throw error;
  }
}

clearAllData()
  .then(() => {
    console.log('\nDone!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Failed to clear data:', error);
    process.exit(1);
  });
