const { execSync } = require('child_process');

// In production (Vercel), the DIRECT_URL will be set.
// In development, we'll fall back to DIRECT_DEV_URL from the .env file.
const databaseUrl = process.env.NODE_ENV === 'production'
  ? process.env.DIRECT_URL
  : process.env.DIRECT_DEV_URL;

if (!databaseUrl) {
  console.error('Required database URL environment variable (DIRECT_URL or DIRECT_DEV_URL) is not set.');
  process.exit(1);
}

console.log('Running migrations against:', databaseUrl.replace(/:[^:]+@/, ':****@'));

try {
  execSync('npx prisma migrate dev', {
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
    },
    stdio: 'inherit',
  });
} catch (e) {
  console.error('Migration failed.');
  process.exit(1);
}
