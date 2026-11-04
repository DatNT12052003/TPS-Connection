import { v7 as uuidv7 } from 'uuid';
import { hashPassword, isCommonPassword, passwordSchema } from '../auth/password.js';
import { loadEnv } from '../config/env.js';
import { createDataSource } from '../db/data-source.js';

/*
 * Only for the very first Admin: nobody can sign up as one (BR-103), and later ones
 * are created by an Admin. The password comes from the environment, because
 * arguments stay in shell history.
 *
 *   ADMIN_PASSWORD=... npm run admin:create -- admin@example.com
 */
const email = process.argv[2]?.toLowerCase();
const password = passwordSchema.safeParse(process.env.ADMIN_PASSWORD);
if (!email?.includes('@')) throw new Error('Usage: npm run admin:create -- <email>');
if (!password.success || isCommonPassword(password.data)) {
  throw new Error('ADMIN_PASSWORD must be 10 to 128 characters and not a common password');
}

const env = loadEnv();
if (!env.MIGRATION_DATABASE_URL) throw new Error('MIGRATION_DATABASE_URL is required');

const db = await createDataSource(env.MIGRATION_DATABASE_URL).initialize();
try {
  const passwordHash = await hashPassword(password.data);
  await db.transaction(async (tx) => {
    const admins: unknown[] = await tx.query(`SELECT 1 FROM user_roles WHERE role = 'admin'`);
    if (admins.length > 0) throw new Error('An Admin already exists. Refusing to add another.');
    const id = uuidv7();
    await tx.query(
      `INSERT INTO users (id, email, password_hash, display_name, email_verified_at)
       VALUES ($1, $2, $3, 'Admin', now())`,
      [id, email, passwordHash],
    );
    await tx.query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'admin')`, [id]);
    await tx.query(
      `INSERT INTO audit_logs (id, action, target_type, target_id)
       VALUES ($1, 'account.first_admin.created', 'user', $2)`,
      [uuidv7(), id],
    );
  });
  console.log('The first Admin has been created.');
} finally {
  await db.destroy();
}
