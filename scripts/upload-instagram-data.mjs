#!/usr/bin/env node
/**
 * Upload Instagram Studio data to Cloudinary.
 *
 * The backup payload can contain the Instagram access token (`instagram.accessToken`).
 * It is never uploaded: secrets are stripped recursively, the asset is stored as
 * authenticated (signed access only), and the temporary file is removed even when
 * the upload fails.
 *
 * Consumers must read the asset with a signed URL
 * (`type: 'authenticated'` in the delivery URL) rather than the plain CDN path.
 *
 * Usage:
 *   node scripts/upload-instagram-data.mjs
 */

import { v2 as cloudinary } from 'cloudinary';
import { readFile } from 'fs/promises';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config as dotenvConfig } from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Keys that must never leave this machine. */
const SECRET_KEY = /^(access_?token|refresh_?token|client_?secret|app_?secret|password)$/i;

/**
 * Recursively drop secret-bearing keys from the uploaded payload.
 * Pure: the input is not mutated.
 */
export function stripInstagramSecrets(value) {
  if (Array.isArray(value)) return value.map(stripInstagramSecrets);
  if (!value || typeof value !== 'object') return value;

  const cleaned = {};
  for (const [key, child] of Object.entries(value)) {
    if (SECRET_KEY.test(key)) continue;
    cleaned[key] = stripInstagramSecrets(child);
  }
  return cleaned;
}

/** Last line of defence: refuse to upload a serialized payload with a secret. */
export function assertNoSecrets(serialized) {
  if (/"(access_?token|refresh_?token|client_?secret|app_?secret|password)"\s*:/i.test(serialized)) {
    throw new Error('Refusing to upload Instagram data: payload still contains a credential');
  }
}

async function main() {
  // Load environment variables only when run as a script.
  dotenvConfig({ path: path.resolve(__dirname, '../.env.local') });
  dotenvConfig({ path: path.resolve(__dirname, '../.env') });

  const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || process.env.VITE_CLOUDINARY_CLOUD_NAME;
  const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY;
  const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET;

  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
    console.error('❌ Missing Cloudinary credentials');
    console.error('Required: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET');
    process.exit(1);
  }

  cloudinary.config({
    cloud_name: CLOUDINARY_CLOUD_NAME,
    api_key: CLOUDINARY_API_KEY,
    api_secret: CLOUDINARY_API_SECRET,
    secure: true
  });

  const dataPath = path.join(__dirname, 'instagram-studio-data-backup.json');
  const tempPath = path.join(__dirname, 'instagram-studio-data.json');

  let uploaded = false;
  try {
    console.log(`\n☁️  Uploading Instagram Studio data to Cloudinary\n`);
    console.log(`Cloud: ${CLOUDINARY_CLOUD_NAME}`);
    console.log(`📖 Reading Instagram data from: ${dataPath}`);

    const data = JSON.parse(await readFile(dataPath, 'utf8'));
    const payload = stripInstagramSecrets(data);
    const serialized = JSON.stringify(payload, null, 2);
    assertNoSecrets(serialized);

    await fs.promises.writeFile(tempPath, serialized);

    console.log(`📤 Uploading to Cloudinary...`);
    console.log(`   Public ID: instagram-studio-data`);

    const result = await cloudinary.uploader.upload(tempPath, {
      public_id: 'instagram-studio-data',
      resource_type: 'raw',
      type: 'authenticated',
      access_mode: 'authenticated',
      overwrite: true,
      invalidate: true
    });

    uploaded = true;
    console.log(`✅ Upload successful!`);
    console.log(`   URL: ${result.secure_url}`);
    console.log(`   Size: ${(result.bytes / 1024).toFixed(1)} KB`);
  } catch (error) {
    console.error('❌ Error uploading Instagram data:', error.message);
    process.exitCode = 1;
  } finally {
    // Never leave the copy of the payload on disk, even after a failed upload.
    await fs.promises.unlink(tempPath).catch(() => {});
    if (uploaded) {
      console.log('✨ Instagram Studio data is now accessible to the scheduled function');
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main();
}
