import { loadEnv } from '../config/env.js';
import { s3FileStore, s3SettingsFromEnv } from '../files/file-store.js';

const env = loadEnv();
if (env.NODE_ENV === 'production') {
  throw new Error('Create production buckets through the provider, with encryption turned on');
}
await s3FileStore(s3SettingsFromEnv(env)).ensureBuckets();
console.log('Buckets are ready.');
