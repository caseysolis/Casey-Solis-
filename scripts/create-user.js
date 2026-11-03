// Create the owner account: npm run create-user -- you@example.com "a-long-password"
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Auth } from '../server/auth.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [email, password] = process.argv.slice(2);
if (!email || !password) {
  console.error('Usage: npm run create-user -- you@example.com "a-long-password"');
  process.exit(1);
}
const auth = new Auth(path.resolve(process.env.DATA_DIR || path.join(root, 'data')));
try {
  const u = auth.createUser(email, password);
  console.log(`Created owner account ${u.email}`);
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
