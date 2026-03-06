#!/usr/bin/env node
/**
 * Upload Instagram Studio data to Cloudinary
 * 
 * This uploads the instagram-studio-data-backup.json to Cloudinary so the
 * scheduled publish function can access it.
 * 
 * Usage:
 * node scripts/upload-instagram-data.mjs
 */

import { v2 as cloudinary } from 'cloudinary';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { config as dotenvConfig } from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
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

// Configure Cloudinary
cloudinary.config({
  cloud_name: CLOUDINARY_CLOUD_NAME,
  api_key: CLOUDINARY_API_KEY,
  api_secret: CLOUDINARY_API_SECRET,
  secure: true
});

console.log(`\n☁️  Uploading Instagram Studio data to Cloudinary\n`);
console.log(`Cloud: ${CLOUDINARY_CLOUD_NAME}`);

const PUBLIC_DIR = path.resolve(__dirname, '.');
const dataPath = path.join(PUBLIC_DIR, 'instagram-studio-data-backup.json');

async function uploadInstagramData() {
  try {
    // Read the local backup file
    console.log(`📖 Reading Instagram data from: ${dataPath}`);
    const fileContent = await readFile(dataPath, 'utf8');
    const data = JSON.parse(fileContent);
    
    console.log(`✅ File read successfully`);
    console.log(`   - Drafts: ${(data.drafts || []).length}`);
    console.log(`   - Schedule Slots: ${(data.scheduleSlots || []).length}`);
    console.log(`   - Instagram Connected: ${data.instagram?.connected ? '✅' : '❌'}`);
    console.log('');
    
    // Create a temporary file path
    const tempPath = path.join(PUBLIC_DIR, 'instagram-studio-data.json');
    const fs = await import('fs').then(m => m.promises);
    await fs.writeFile(tempPath, fileContent);
    
    console.log(`📤 Uploading to Cloudinary...`);
    console.log(`   Public ID: instagram-studio-data`);
    
    const result = await cloudinary.uploader.upload(tempPath, {
      public_id: 'instagram-studio-data',
      resource_type: 'raw',
      overwrite: true,
      invalidate: true, // Clear CDN cache
      type: 'upload'
    });
    
    console.log(`✅ Upload successful!`);
    console.log(`   URL: ${result.secure_url}`);
    console.log(`   Size: ${(result.bytes / 1024).toFixed(1)} KB`);
    console.log('');
    
    // Clean up temp file
    await fs.unlink(tempPath);
    
    console.log(`✨ Instagram Studio data is now accessible to the scheduled function`);
    console.log('');
    console.log('🔄 Next Steps:');
    console.log('   1. The scheduled function will check for due posts every hour');
    console.log('   2. Any pending posts with a past scheduled time will be published');
    console.log('   3. Or manually trigger: npm run instagram:publish-now');
    console.log('');
    
  } catch (error) {
    console.error('❌ Error uploading Instagram data:', error.message);
    process.exit(1);
  }
}

uploadInstagramData();
