/**
 * Seed Config: Site Config
 * No dependencies on other seed scripts.
 */
import { TABLES, putItem } from './shared';

export async function seedConfig(): Promise<void> {
  const now = new Date().toISOString();

  console.log('Creating site config...');
  const siteConfig = {
    configKey: 'features',
    features: {
      fantasy: true,
      challenges: true,
      promos: true,
      contenders: true,
      statistics: true,
    },
    updatedAt: now,
  };

  await putItem(TABLES.SITE_CONFIG, siteConfig);
  console.log('  ✓ Site config: features');

  console.log('\n✅ Config seed complete (1 site config)');
}

if (require.main === module) {
  seedConfig()
    .then(() => { console.log('\nDone!'); process.exit(0); })
    .catch((error) => { console.error('Error:', error); process.exit(1); });
}
