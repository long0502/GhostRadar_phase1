const { execSync } = require('child_process');

console.log('=== DOCKER START ===');
console.log('CWD:', process.cwd());
console.log('DATABASE_URL set:', !!process.env.DATABASE_URL);

// Run prisma db push using the local prisma binary
try {
  console.log('=== Running prisma db push ===');
  const output = execSync(
    'node node_modules/prisma/build/index.js db push --skip-generate',
    { encoding: 'utf8', timeout: 30000, env: process.env, stdio: 'pipe' }
  );
  console.log('prisma db push output:', output);
  console.log('=== DB push SUCCESS ===');
} catch (error) {
  console.error('=== DB push FAILED ===');
  console.error('Exit code:', error.status);
  console.error('stdout:', error.stdout);
  console.error('stderr:', error.stderr);
  console.log('Continuing to start server anyway...');
}

// Start the server
console.log('=== Starting server ===');
require('../dist/server.js');
