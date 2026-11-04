import type { DataSource } from 'typeorm';
import type { FileStore } from './file-store.js';

const ABANDONED_AFTER = `interval '1 day'`;

/**
 * Removes objects for replaced or refused files, and uploads never completed.
 * Removing an object that is already gone succeeds, so running it again is safe.
 */
export async function purgeFiles(db: DataSource, store: FileStore): Promise<number> {
  const rows: { id: string; bucket: string; object_key: string }[] = await db.query(
    `SELECT id, bucket, object_key FROM files
      WHERE purged_at IS NULL
        AND (deleted_at IS NOT NULL
             OR (completed_at IS NULL AND created_at < now() - ${ABANDONED_AFTER}))
      LIMIT 200`,
  );
  for (const row of rows) {
    await store.remove({ bucket: row.bucket, key: row.object_key });
    await db.query(
      `UPDATE files SET purged_at = now(), deleted_at = COALESCE(deleted_at, now()),
              updated_at = now()
        WHERE id = $1`,
      [row.id],
    );
  }
  return rows.length;
}
