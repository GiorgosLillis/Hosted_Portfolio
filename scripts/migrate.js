const { execSync } = require('child_process');

// The script now consistently uses DIRECT_URL for the database connection.
// In local development, this will be sourced from the .env file.
// In production (Vercel), this will be sourced from Vercel's environment variables.
const databaseUrl = process.env.DIRECT_URL;

if (!databaseUrl) {
  console.error('Required database URL environment variable (DIRECT_URL) is not set.');
  process.exit(1);
}

console.log('Running migrations against:', databaseUrl.replace(/:[^:]+@/, ':****@'));

try {
  execSync('npx prisma migrate deploy', {
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

