const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

const authPath = path.join(process.env.APPDATA, 'com.vercel.cli', 'Data', 'auth.json');
console.log('Reading auth from:', authPath);

if (!fs.existsSync(authPath)) {
  console.error('auth.json not found!');
  process.exit(1);
}

const auth = JSON.parse(fs.readFileSync(authPath, 'utf8'));
const vercelCmd = path.join(process.env.APPDATA, 'npm', 'vercel.cmd');
const projectDir = 'c:\\Users\\Krishana dubey\\hello\\internship\\admin-portal';

console.log('Running Vercel deployment with token...');
try {
  const result = execSync(`"${vercelCmd}" --prod --yes --token "${auth.token}"`, {
    cwd: projectDir,
    encoding: 'utf8',
    stdio: 'pipe'
  });
  console.log('DEPLOY SUCCESS:');
  console.log(result);
} catch (err) {
  console.log('DEPLOY OUTPUT / ERROR:');
  if (err.stdout) console.log('STDOUT:', err.stdout.toString());
  if (err.stderr) console.error('STDERR:', err.stderr.toString());
  console.error('ERROR MESSAGE:', err.message);
}
