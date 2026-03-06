/**
 * Core Sync Logic - Shared between GitHub Actions and Netlify Functions
 * 
 * This module contains the main orchestration logic for syncing data from Airtable,
 * generating static files, and uploading to Cloudinary. Used by:
 * - GitHub Actions workflow (sync-data.yml)
 * - Netlify Functions (sync-now.mjs)
 * - Local development (npm run build:data)
 */

import fs from 'fs';
import path from 'path';
import { v2 as cloudinary } from 'cloudinary';
import { getVideoThumbnail } from '../utils/videoHelpers.mjs';
import { normalizeTitle, calculateReadingTime, parseCreditsText } from '../utils/helpers/textHelpers.mjs';
import { uploadToCloudinary as uploadToCloudinaryHelper, checkImageExists } from '../utils/cloudinary/cloudinaryHelpers.mjs';
import {
  fetchAirtableTable,
  buildLookupMaps,
  parseExternalLinks,
  makeSlug,
  normalizeProjectType,
  resolveProductionCompany,
  resolveAwards
} from './airtable-helpers.mjs';

/**
 * Main sync orchestration function
 * @param {Object} config - Configuration object
 * @param {string} config.airtableToken - Airtable API token
 * @param {string} config.airtableBaseId - Airtable base ID
 * @param {string} config.outputDir - Directory for output files (default: 'public')
 * @param {boolean} config.verbose - Enable verbose logging
 * @param {boolean} config.forceFullSync - Force full sync (now always true)
 * @param {boolean} config.skipFileWrites - Skip writing files to disk (for serverless environments)
 * @param {string} config.portfolioMode - Portfolio mode: 'directing' or 'postproduction' (default: 'directing')
 * @returns {Promise<Object>} Sync results with success status and generated data
 */
export async function syncAllData(config) {
  const {
    airtableToken,
    airtableBaseId,
    outputDir = 'public',
    verbose = false,
    skipFileWrites = false,
    portfolioMode = 'directing'
  } = config;

  if (!airtableToken || !airtableBaseId) {
    throw new Error('Missing required Airtable credentials');
  }

  const results = {
    success: false,
    projects: [],
    journal: [],
    config: null,
    errors: [],
    timestamp: new Date().toISOString(),
    syncStats: {
      mode: 'full',
      apiCalls: 0,
      apiCallsSaved: 0
    }
  };

  try {
    if (verbose) console.log(`[sync-core] 🔄 Starting FULL data sync for portfolio mode: ${portfolioMode}...`);

    const outputFileName = `portfolio-data.json`;
    const outputFile = path.join(outputDir, outputFileName);
    if (verbose) console.log(`[sync-core] 📁 Output file: ${outputFileName}`);

    // Build lookup maps for festivals and clients
    const { festivalsMap, clientsMap } = await buildLookupMaps(airtableToken, airtableBaseId);
    results.syncStats.apiCalls += 2;
    if (verbose) console.log('[sync-core] ✅ Built lookup maps');

    // Load Cloudinary mapping if exists
    const cloudinaryMapping = loadCloudinaryMapping(outputDir);

    // Fetch all records
    const [projectsRecords, journalRecords, festivalsRecords, clientsRecords, settingsRecords] = await Promise.all([
      fetchAirtableTable('Projects', 'Release Date', airtableToken, airtableBaseId),
      fetchAirtableTable('Journal', 'Date', airtableToken, airtableBaseId),
      fetchAirtableTable('Festivals', null, airtableToken, airtableBaseId),
      fetchAirtableTable('Client Book', null, airtableToken, airtableBaseId),
      fetchAirtableTable('Settings', null, airtableToken, airtableBaseId)
    ]);
    results.syncStats.apiCalls += 5;

    const rawRecords = {
      Projects: projectsRecords,
      Journal: journalRecords,
      Festivals: festivalsRecords,
      'Client Book': clientsRecords,
      Settings: settingsRecords
    };

    // Process config/settings data FIRST
    results.config = processConfigRecords(settingsRecords, cloudinaryMapping, verbose, portfolioMode);
    if (verbose) console.log('[sync-core] ✅ Processed config/settings data');

    // Process projects
    results.projects = await processProjectRecords(
      projectsRecords,
      festivalsMap,
      clientsMap,
      cloudinaryMapping,
      results.config,
      verbose,
      portfolioMode
    );
    if (verbose) console.log(`[sync-core] ✅ Processed ${results.projects.length} projects`);

    // Conditionally process journal based on hasJournal flag
    if (results.config.hasJournal) {
      results.journal = processJournalRecords(journalRecords, cloudinaryMapping, verbose);
      if (verbose) console.log(`[sync-core] ✅ Processed ${results.journal.length} journal posts`);
    } else {
      results.journal = [];
      if (verbose) console.log(`[sync-core] ⏭️ Skipped journal processing (hasJournal=false)`);
    }

    // Upload images to Cloudinary (incremental detection by attachment ID)
    const updatedMapping = await syncImagesToCloudinary(
      results.projects,
      results.journal,
      cloudinaryMapping,
      verbose
    );

    // Save updated Cloudinary mapping (skip in serverless environments)
    if (updatedMapping && !skipFileWrites) {
      saveCloudinaryMapping(outputDir, updatedMapping);
      if (verbose) console.log(`[sync-core] ✅ Saved Cloudinary mapping`);
    }

    // Save portfolio data with metadata (skip in serverless environments)
    const portfolioData = {
      projects: cleanProcessedData(results.projects),
      posts: cleanProcessedData(results.journal),
      config: results.config,
      portfolioMode: portfolioMode,
      lastUpdated: results.timestamp,
      version: '1.0',
      source: 'build-time-sync',
      _rawRecords: rawRecords
    };

    if (!skipFileWrites) {
      fs.mkdirSync(outputDir, { recursive: true });
      fs.writeFileSync(outputFile, JSON.stringify(portfolioData, null, 2));
      if (verbose) console.log(`[sync-core] ✅ Wrote ${outputFile} (full mode)`);
    }

    results.success = true;
    return results;

  } catch (error) {
    results.errors.push(error.message);
    console.error('[sync-core] ❌ Sync failed:', error.message);

    // Mark rate limit errors for special handling
    if (error.message?.includes('Rate limit') || error.message?.includes('429')) {
      error.isRateLimit = true;
    }

    throw error;
  }
}

/**
 * Sync BOTH portfolios with a single Airtable fetch
 * This saves ~50% of Airtable API calls by fetching once and writing two files
 * 
 * @param {Object} config - Configuration object (same as syncAllData, but portfolioMode is ignored)
 * @returns {Promise<Object>} Sync results for both portfolios
 */
export async function syncBothPortfolios(config) {
  const {
    airtableToken,
    airtableBaseId,
    outputDir = 'public',
    verbose = false,
    skipFileWrites = false
  } = config;

  if (!airtableToken || !airtableBaseId) {
    throw new Error('Missing required Airtable credentials');
  }

  const portfolioModes = ['directing', 'postproduction'];
  const combinedResults = {
    success: false,
    portfolios: {},
    errors: [],
    timestamp: new Date().toISOString(),
    syncStats: {
      mode: 'full',
      apiCalls: 0
    }
  };

  try {
    if (verbose) console.log('[sync-core] 🔄 Starting DUAL portfolio sync (fetch once, write both)...');

    let rawRecords;

    // FULL SYNC MODE - fetch everything once
    if (verbose) {
      console.log('[sync-core] 🔄 Full sync mode (no previous metadata)');
    }

    combinedResults.syncStats.mode = 'full';

    // Fetch all records - ONE set of API calls for both portfolios
    const [projectsRecords, journalRecords, festivalsRecords, clientsRecords, settingsRecords] = await Promise.all([
      fetchAirtableTable('Projects', 'Release Date', airtableToken, airtableBaseId),
      fetchAirtableTable('Journal', 'Date', airtableToken, airtableBaseId),
      fetchAirtableTable('Festivals', null, airtableToken, airtableBaseId),
      fetchAirtableTable('Client Book', null, airtableToken, airtableBaseId),
      fetchAirtableTable('Settings', null, airtableToken, airtableBaseId)
    ]);
    combinedResults.syncStats.apiCalls += 5;

    rawRecords = {
      Projects: projectsRecords,
      Journal: journalRecords,
      Festivals: festivalsRecords,
      'Client Book': clientsRecords,
      Settings: settingsRecords
    };

    // Build lookup maps (shared between both portfolios)
    const festivalsMap = {};
    (rawRecords.Festivals || []).forEach(r => {
      festivalsMap[r.id] = r.fields['Display Name'] || r.fields['Name'] || r.fields['Award'] || 'Unknown Award';
    });

    const clientsMap = {};
    (rawRecords['Client Book'] || []).forEach(r => {
      clientsMap[r.id] = r.fields['Company'] || r.fields['Company Name'] || r.fields['Client'] || 'Unknown';
    });

    if (verbose) console.log('[sync-core] ✅ Built lookup maps from fetched data');

    // Load Cloudinary mapping (shared)
    const cloudinaryMapping = loadCloudinaryMapping(outputDir);

    // **CRITICAL: Upload images to Cloudinary BEFORE processing portfolios**
    // This ensures processProjectRecords and processJournalRecords use the updated cloudinaryMapping
    if (verbose) console.log('[sync-core] 🔄 Uploading new/changed images to Cloudinary...');

    let updatedCloudinaryMapping = cloudinaryMapping;
    const projectsToUpload = rawRecords.Projects || [];
    const journalToUpload = rawRecords.Journal || [];

    updatedCloudinaryMapping = await syncImagesToCloudinary(
      projectsToUpload,
      journalToUpload,
      cloudinaryMapping,
      verbose
    );

    // Save updated mapping
    if (updatedCloudinaryMapping && !skipFileWrites) {
      saveCloudinaryMapping(outputDir, updatedCloudinaryMapping);
      if (verbose) console.log(`[sync-core] ✅ Saved updated Cloudinary mapping`);
    } else if (updatedCloudinaryMapping && skipFileWrites && verbose) {
      console.log(`[sync-core] ⏭️ Skipped saving Cloudinary mapping (serverless mode)`);
    }

    // Use the updated mapping for all portfolio processing
    const cloudinaryMappingForProcessing = updatedCloudinaryMapping || cloudinaryMapping;

    // Process and write EACH portfolio file
    for (const portfolioMode of portfolioModes) {
      if (verbose) console.log(`\n[sync-core] 📂 Processing portfolio: ${portfolioMode}`);

      const outputFileName = `portfolio-data-${portfolioMode}.json`;
      const outputFile = path.join(outputDir, outputFileName);

      // Process config for this portfolio (using updated Cloudinary mapping)
      const portfolioConfig = processConfigRecords(rawRecords.Settings || [], cloudinaryMappingForProcessing, verbose, portfolioMode);
      if (verbose) console.log(`[sync-core] ✅ Processed config for ${portfolioMode}`);

      // Process projects for this portfolio (using updated Cloudinary mapping)
      const portfolioProjects = await processProjectRecords(
        rawRecords.Projects || [],
        festivalsMap,
        clientsMap,
        cloudinaryMappingForProcessing,
        portfolioConfig,
        verbose,
        portfolioMode
      );
      if (verbose) console.log(`[sync-core] ✅ Processed ${portfolioProjects.length} projects for ${portfolioMode}`);

      // Process journal (only for directing or if hasJournal is true) (using updated Cloudinary mapping)
      let portfolioJournal = [];
      if (portfolioConfig.hasJournal) {
        portfolioJournal = processJournalRecords(rawRecords.Journal || [], cloudinaryMappingForProcessing, verbose);
        if (verbose) console.log(`[sync-core] ✅ Processed ${portfolioJournal.length} journal posts for ${portfolioMode}`);
      } else {
        if (verbose) console.log(`[sync-core] ⏭️ Skipped journal for ${portfolioMode} (hasJournal=false)`);
      }

      // Store results
      combinedResults.portfolios[portfolioMode] = {
        projects: portfolioProjects,
        journal: portfolioJournal,
        config: portfolioConfig
      };

      // Build portfolio data object
      const portfolioData = {
        projects: cleanProcessedData(portfolioProjects),
        posts: cleanProcessedData(portfolioJournal),
        config: portfolioConfig,
        portfolioMode: portfolioMode,
        lastUpdated: combinedResults.timestamp,
        version: '1.0',
        source: 'build-time-sync',
        _rawRecords: rawRecords
      };

      // Write file
      if (!skipFileWrites) {
        fs.mkdirSync(outputDir, { recursive: true });
        fs.writeFileSync(outputFile, JSON.stringify(portfolioData, null, 2));
        if (verbose) console.log(`[sync-core] ✅ Wrote ${outputFileName}`);
      } else if (verbose) {
        console.log(`[sync-core] ⏭️ Skipped writing ${outputFileName} (serverless mode)`);
      }
    }

    combinedResults.success = true;
    if (verbose) {
      console.log(`\n[sync-core] ✅ Dual portfolio sync complete!`);
      console.log(`[sync-core]    - API calls: ${combinedResults.syncStats.apiCalls}`);
      console.log(`[sync-core]    - API calls saved vs separate syncs: ~${combinedResults.syncStats.apiCalls} (50% reduction)`);
    }

    return combinedResults;

  } catch (error) {
    combinedResults.errors.push(error.message);
    console.error('[sync-core] ❌ Dual sync failed:', error.message);

    if (error.message?.includes('Rate limit') || error.message?.includes('429')) {
      error.isRateLimit = true;
    }

    throw error;
  }
}
function cleanProcessedData(data) {
  return JSON.parse(JSON.stringify(data, (key, value) => {
    // Remove any keys starting with underscore (internal fields)
    if (key.startsWith('_')) {
      return undefined;
    }
    return value;
  }));
}

/**
 * Get default settings structure when Settings table is unavailable
 */
function getDefaultSettings() {
  return {
    // Multi-portfolio fields
    portfolioId: 'directing',
    siteTitle: '',
    navTitle: '',
    seoTitle: '',
    seoDescription: '',
    domain: '',
    logo: '',
    favicon: '',
    fontFamily: '',
    workSectionLabel: 'Filmography',
    hasJournal: true,
    showRoleFilter: false,
    showOtherPortfolioLink: false,
    otherPortfolioUrl: '',
    otherPortfolioLabel: '',
    aboutLayout: 'standard',
    themeMode: 'dark',
    tradingNameDisclosure: '',
    gaMeasurementId: '',

    // Existing fields
    showreel: {
      enabled: false,
      videoUrl: '',
      placeholderImage: ''
    },
    contact: {
      email: '',
      phone: '',
      repUK: '',
      repUSA: '',
      instagram: '',
      vimeo: '',
      linkedin: ''
    },
    about: {
      bio: '',
      profileImage: ''
    },
    allowedRoles: [],
    defaultOgImage: '',
    portfolioOwnerName: '',
    lastModified: ''
  };
}

/**
 * Load existing Cloudinary mapping
 */
function loadCloudinaryMapping(outputDir) {
  try {
    const mappingFile = path.join(outputDir, 'cloudinary-mapping.json');
    if (fs.existsSync(mappingFile)) {
      const content = fs.readFileSync(mappingFile, 'utf-8');
      return JSON.parse(content);
    }
  } catch (error) {
    console.warn('[sync-core] ⚠️ Could not load Cloudinary mapping:', error.message);
  }
  return { generatedAt: new Date().toISOString(), projects: [], journal: [], config: { images: [] } };
}

/**
 * Save Cloudinary mapping
 */
function saveCloudinaryMapping(outputDir, mapping) {
  try {
    const mappingFile = path.join(outputDir, 'cloudinary-mapping.json');
    mapping.generatedAt = new Date().toISOString();
    fs.writeFileSync(mappingFile, JSON.stringify(mapping, null, 2), 'utf-8');
  } catch (error) {
    console.error('[sync-core] ❌ Failed to save Cloudinary mapping:', error.message);
  }
}

/**
 * Configure Cloudinary SDK
 */
function configureCloudinary() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME || process.env.VITE_CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  const useCloudinary = process.env.USE_CLOUDINARY === 'true';

  if (!useCloudinary) {
    return { enabled: false };
  }

  if (!cloudName || !apiKey || !apiSecret) {
    console.warn('[sync-core] ⚠️ USE_CLOUDINARY=true but credentials missing');
    return { enabled: false };
  }

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true
  });

  return { enabled: true, cloudName };
}

/**
 * Upload images to Cloudinary with incremental detection
 * Checks Cloudinary directly to see if images already exist (by public_id)
 * Only checks changed records to minimize API calls
 * 
 * @param {Array} projects - All projects
 * @param {Array} journal - All journal posts  
 * @param {Object} existingMapping - Existing cloudinary mapping
 * @param {boolean} verbose - Enable verbose logging
 * @param {Set} changedProjectIds - Set of project record IDs that changed (optional)
 * @param {Set} changedJournalIds - Set of journal record IDs that changed (optional)
 */
async function syncImagesToCloudinary(projects, journal, existingMapping, verbose, changedProjectIds = null, changedJournalIds = null) {
  const cloudinaryConfig = configureCloudinary();

  if (!cloudinaryConfig.enabled) {
    if (verbose) console.log('[sync-core] ⏭️  Cloudinary upload skipped (disabled or no credentials)');
    return existingMapping;
  }

  // Build lookup for existing mapping
  const existingProjectsMap = new Map(
    (existingMapping.projects || []).map(p => [p.recordId, p])
  );
  const existingJournalMap = new Map(
    (existingMapping.journal || []).map(j => [j.recordId, j])
  );

  // Determine which records need checking
  const isFullSync = changedProjectIds === null && changedJournalIds === null;
  const projectsToCheck = isFullSync
    ? new Set(projects.map(p => p.id))
    : changedProjectIds || new Set();
  const journalToCheck = isFullSync
    ? new Set(journal.map(j => j.id))
    : changedJournalIds || new Set();

  const totalToCheck = projectsToCheck.size + journalToCheck.size;

  if (totalToCheck === 0) {
    if (verbose) console.log('[sync-core] ⏭️  No changed records - skipping Cloudinary checks');
    return existingMapping;
  }

  if (verbose) {
    if (isFullSync) {
      console.log(`[sync-core] 🔄 Full sync: checking Cloudinary for all ${totalToCheck} records...`);
    } else {
      console.log(`[sync-core] 🔄 Incremental sync: checking Cloudinary for ${totalToCheck} changed records...`);
    }
  }

  const newMapping = {
    generatedAt: new Date().toISOString(),
    projects: [],
    journal: [],
    config: existingMapping.config || { images: [] }
  };

  let uploadCount = 0;
  let skipCount = 0;
  let failCount = 0;
  let reuseCount = 0;

  // Process project images
  for (const project of projects) {
    // Check if this project needs checking or can reuse existing mapping
    if (!projectsToCheck.has(project.id)) {
      // Project unchanged - reuse existing mapping if available
      const existingProject = existingProjectsMap.get(project.id);
      if (existingProject) {
        newMapping.projects.push(existingProject);
        reuseCount += existingProject.images?.length || 0;
        continue;
      }
    }

    const projectData = {
      recordId: project.id,
      title: project.title,
      images: []
    };

    // Get gallery attachments from raw Airtable data
    const galleryAttachments = project._rawGallery || [];

    for (let i = 0; i < galleryAttachments.length; i++) {
      const attachment = galleryAttachments[i];
      const publicId = `portfolio-projects-${project.id}-${i}`;

      // Check if image already exists in Cloudinary by public_id
      const existingImage = await checkImageExists(cloudinary, publicId);

      if (existingImage) {
        // Image already exists in Cloudinary - skip upload
        if (verbose) console.log(`[sync-core]    ⏭️  Exists: ${project.title} [${i}]`);
        projectData.images.push({
          index: i,
          publicId: existingImage.publicId,
          cloudinaryUrl: existingImage.cloudinaryUrl,
          airtableId: attachment.id,
          format: existingImage.format,
          size: existingImage.size
        });
        skipCount++;
      } else {
        // Image doesn't exist - upload it
        if (verbose) console.log(`[sync-core]    📤 Uploading: ${project.title} [${i}]`);

        const result = await uploadToCloudinaryHelper(
          cloudinary,
          attachment.url,
          publicId,
          { title: project.title }
        );

        if (result.success) {
          projectData.images.push({
            index: i,
            publicId: result.publicId,
            cloudinaryUrl: result.cloudinaryUrl,
            airtableId: attachment.id,
            format: result.format,
            size: result.size
          });
          uploadCount++;
        } else {
          projectData.images.push({
            index: i,
            publicId: publicId,
            cloudinaryUrl: '',
            airtableId: attachment.id,
            error: result.error
          });
          failCount++;
        }
      }
    }

    newMapping.projects.push(projectData);
  }

  // Process journal images
  for (const post of journal) {
    // Check if this post needs checking or can reuse existing mapping
    if (!journalToCheck.has(post.id)) {
      // Post unchanged - reuse existing mapping if available
      const existingPost = existingJournalMap.get(post.id);
      if (existingPost) {
        newMapping.journal.push(existingPost);
        reuseCount += existingPost.images?.length || 0;
        continue;
      }
    }

    const postData = {
      recordId: post.id,
      title: post.title,
      images: []
    };

    // Get cover image attachment from raw data
    const coverAttachment = post._rawCoverImage;

    if (coverAttachment) {
      const publicId = `portfolio-journal-${post.id}`;

      // Check if image already exists in Cloudinary
      const existingImage = await checkImageExists(cloudinary, publicId);

      if (existingImage) {
        // Image already exists - skip upload
        if (verbose) console.log(`[sync-core]    ⏭️  Exists: ${post.title}`);
        postData.images.push({
          index: 0,
          publicId: existingImage.publicId,
          cloudinaryUrl: existingImage.cloudinaryUrl,
          airtableId: coverAttachment.id,
          format: existingImage.format,
          size: existingImage.size
        });
        skipCount++;
      } else {
        // Image doesn't exist - upload it
        if (verbose) console.log(`[sync-core]    📤 Uploading: ${post.title}`);

        const result = await uploadToCloudinaryHelper(
          cloudinary,
          coverAttachment.url,
          publicId,
          { title: post.title }
        );

        if (result.success) {
          postData.images.push({
            index: 0,
            publicId: result.publicId,
            cloudinaryUrl: result.cloudinaryUrl,
            airtableId: coverAttachment.id,
            format: result.format,
            size: result.size
          });
          uploadCount++;
        } else {
          postData.images.push({
            index: 0,
            publicId: publicId,
            cloudinaryUrl: '',
            airtableId: coverAttachment.id,
            error: result.error
          });
          failCount++;
        }
      }
    }

    newMapping.journal.push(postData);
  }

  if (verbose) {
    const stats = [`${uploadCount} uploaded`, `${skipCount} already exist`, `${failCount} failed`];
    if (reuseCount > 0) stats.push(`${reuseCount} reused from cache`);
    console.log(`[sync-core] ✅ Cloudinary sync complete: ${stats.join(', ')}`);
  }

  return newMapping;
}

/**
 * Load existing portfolio data for incremental sync
 * @param {string} filePath - Path to portfolio-data.json
 * @returns {Object|null} Previous sync data or null if not found
 */
function loadExistingData(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content);
    }
  } catch (error) {
    console.warn('[sync-core] ⚠️ Could not load existing data:', error.message);
  }
  return null;
}

/**
 * Process project records from raw Airtable data
 * @param {Array} rawRecords - Raw Airtable project records
 * @param {Object} festivalsMap - Festival ID to name mapping
 * @param {Object} clientsMap - Client ID to name mapping
 * @param {Object} cloudinaryMapping - Cloudinary URL mapping
 * @param {Object} config - Settings/config data
 * @param {boolean} verbose - Enable verbose logging
 * @param {string} portfolioMode - Portfolio mode: 'directing' or 'postproduction'
 * @returns {Promise<Array>} Processed project objects
 */
async function processProjectRecords(rawRecords, festivalsMap, clientsMap, cloudinaryMapping, config, verbose, portfolioMode = 'directing') {
  const projects = [];

  // Extract owner info from config
  const ownerName = config?.portfolioOwnerName || '';
  const allowedRoles = config?.allowedRoles || [];

  // Determine which Display Status field to use based on portfolio mode
  const displayStatusField = portfolioMode === 'postproduction' ? 'Display Status (Post)' : 'Display Status';
  if (verbose) console.log(`[sync-core] Using display status field: ${displayStatusField}`);

  // Build cloudinary lookup map
  const cloudinaryMap = {};
  if (cloudinaryMapping?.projects) {
    cloudinaryMapping.projects.forEach(project => {
      cloudinaryMap[project.recordId] = project.images || [];
    });
  }

  for (const r of rawRecords) {
    const f = r.fields || {};

    // Check Display Status field (using the correct one based on portfolio mode)
    const displayStatus = f[displayStatusField] || '';
    if (displayStatus === 'Hidden' || !displayStatus) continue;

    // Also check that the project's Role matches the portfolio's allowedRoles
    const roleField = f['Role'] || null;
    if (allowedRoles.length > 0 && roleField) {
      const projectRoles = Array.isArray(roleField) ? roleField : [roleField];
      const hasMatchingRole = projectRoles.some(r => allowedRoles.includes(r));
      if (!hasMatchingRole) continue; // Skip projects that don't match any allowed role
    } else if (allowedRoles.length > 0) {
      // If allowedRoles is set but project has no Role, skip it
      continue;
    }

    const rawTitle = f['Name'] || 'Untitled';
    const title = normalizeTitle(rawTitle);
    const releaseDate = f['Release Date'] || '';
    const workDate = f['Work Date'] || releaseDate;
    const description = f['About'] || f['Description'] || '';

    // Extract year from dates
    const year = (releaseDate || workDate).split('-')[0] || '';

    // Map Display Status to isFeatured and isHero
    const isFeatured = displayStatus === 'Featured' || displayStatus === 'Hero';
    const isHero = displayStatus === 'Hero';

    // Get project type and categories
    const type = normalizeProjectType(f['Project Type'] || '');
    const kinds = f['Kind'] ? [f['Kind']] : (f['Kinds'] || []);
    const genre = f['Genre'] || [];
    const client = f['Client'] || '';

    // Parse credits from Credits field
    const rawCredits = f['Credits (new)'] || f['Credits'] || '';
    const extraCredits = parseCreditsText(rawCredits);

    // Prepend owner's credits based on Role field and allowed roles
    // (roleField was already defined above for role filtering)
    const ownerCredits = [];
    if (ownerName && allowedRoles.length > 0 && roleField) {
      // Role field might be a string or array (depends on Airtable field type)
      const projectRoles = Array.isArray(roleField) ? roleField : [roleField];

      // Filter to only allowed roles
      const matchingRoles = projectRoles.filter(r => allowedRoles.includes(r));

      // Create credit entry for each matching role
      matchingRoles.forEach(r => {
        ownerCredits.push({
          role: r,
          name: ownerName
        });
      });

      if (verbose && matchingRoles.length > 0) {
        console.log(`[sync-core] ✨ Added ${matchingRoles.length} owner credit(s) to "${title}"`);
      }
    }

    // Add cross-site credits based on the other portfolio's allowed roles
    const crossSiteCredits = [];
    const otherPortfolioAllowedRoles = config?.otherPortfolioAllowedRoles || [];
    const otherPortfolioUrl = config?.otherPortfolioUrl || '';

    if (otherPortfolioAllowedRoles.length > 0 && otherPortfolioUrl && roleField) {
      const projectRoles = Array.isArray(roleField) ? roleField : [roleField];

      // Find roles that match the OTHER portfolio's allowed roles
      const matchingCrossSiteRoles = projectRoles.filter(role =>
        otherPortfolioAllowedRoles.includes(role)
      );

      // Add cross-site credits for matching roles
      matchingCrossSiteRoles.forEach(role => {
        crossSiteCredits.push({
          role: role,
          name: config?.otherPortfolioName || 'Unknown',
          isCrossSite: true,
          externalUrl: otherPortfolioUrl
        });
      });

      if (verbose && crossSiteCredits.length > 0) {
        console.log(`[sync-core] 🔗 Added ${crossSiteCredits.length} cross-site credit(s) to "${title}"`);
      }
    }

    // Combine in order: owner credits, cross-site credits, then additional credits
    const credits = [...ownerCredits, ...crossSiteCredits, ...extraCredits];

    // Get video URL directly from Video URL field
    const videoUrl = f['Video URL'] || '';

    // Parse external links to get additional videos
    const rawLinks = f['External Links'] || '';
    const { links, videos: externalVideos } = parseExternalLinks(rawLinks);

    // Build image URLs (prefer Cloudinary if available)
    const galleryAttachments = f['Gallery'] || f['Gallery (Image)'] || [];
    const gallery = galleryAttachments.map((att, idx) => {
      const cloudinaryImg = cloudinaryMap[r.id]?.[idx];
      // MUST use Cloudinary URL if available, never fallback to Airtable
      if (cloudinaryImg?.cloudinaryUrl) {
        return cloudinaryImg.cloudinaryUrl;
      }
      // Log warning if Cloudinary URL is missing (indicates sync issue)
      if (verbose) {
        console.warn(`[sync-core] ⚠️ Missing Cloudinary URL for ${title} gallery[${idx}] - using Airtable fallback`);
      }
      return att.url;
    });

    // Combine Video URL field with any additional videos from External Links
    // Video URL may already contain comma-separated URLs
    const primaryVideos = videoUrl ? videoUrl.split(',').map(v => v.trim()).filter(v => v.length > 0) : [];
    // Filter out any external videos that are already in the primary list
    const additionalExternalVideos = externalVideos.filter(v => !primaryVideos.includes(v));
    // Combine all videos into one array, then join back to comma-separated string
    const allVideos = [...primaryVideos, ...additionalExternalVideos];
    const finalVideoUrl = allVideos.join(', ');

    // Set heroImage to first gallery image, or video thumbnail if no gallery
    let heroImage = gallery[0] || '';
    if (!heroImage && finalVideoUrl) {
      try {
        const videoThumbnail = await getVideoThumbnail(finalVideoUrl);
        heroImage = videoThumbnail || '';
      } catch (err) {
        if (verbose) console.warn(`[sync-core] ⚠️ Failed to fetch video thumbnail for ${title}:`, err.message);
      }
    }

    // Additional videos array (empty for now, can be populated if needed)
    const additionalVideos = [];

    // Resolve awards
    const festivalIds = f['Festivals'] || f['Awards'] || [];
    const awards = resolveAwards(festivalIds, festivalsMap);

    // Resolve production company
    const productionCompanyId = f['Production Company']?.[0];
    const productionCompany = resolveProductionCompany(productionCompanyId, clientsMap);

    // Get related article ID if exists
    const relatedArticleId = f['Related Article']?.[0] || null;

    projects.push({
      id: r.id,
      slug: makeSlug(title),
      title,
      type,
      kinds,
      genre,
      productionCompany,
      client,
      year,
      releaseDate,
      workDate,
      description,
      isFeatured,
      isHero,
      heroImage,
      gallery,
      videoUrl: finalVideoUrl,
      additionalVideos,
      awards,
      credits,
      externalLinks: links,
      relatedArticleId,
      // Store raw attachments for Cloudinary upload detection
      _rawGallery: galleryAttachments
    });
  }

  // Sort projects by date (Release Date takes priority, then Work Date) - newest first
  projects.sort((a, b) => {
    const dateA = a.releaseDate || a.workDate || '1900-01-01';
    const dateB = b.releaseDate || b.workDate || '1900-01-01';
    return dateB.localeCompare(dateA); // Descending order (newest first)
  });

  return projects;
}

/**
 * Process journal records from raw Airtable data
 * @param {Array} rawRecords - Raw Airtable journal records
 * @param {Object} cloudinaryMapping - Cloudinary URL mapping
 * @param {boolean} verbose - Enable verbose logging
 * @returns {Array} Processed journal post objects
 */
function processJournalRecords(rawRecords, cloudinaryMapping, verbose) {
  const posts = [];

  // Build cloudinary lookup map for journal
  const cloudinaryMap = {};
  if (cloudinaryMapping?.journal) {
    cloudinaryMapping.journal.forEach(post => {
      cloudinaryMap[post.recordId] = post.images || [];
    });
  }

  for (const r of rawRecords) {
    const f = r.fields || {};

    const status = f['Status'] || '';
    // Only show Published posts (matching the Airtable "Published" status)
    if (status !== 'Published') continue;

    const title = normalizeTitle(f['Title'] || 'Untitled');
    const date = f['Publish Date'] || f['Date'] || '';
    const content = f['Content'] || '';
    const excerpt = f['Excerpt'] || '';
    const readingTime = calculateReadingTime(content);

    // Handle cover image - prefer Cloudinary URL if available
    const coverAttachments = f['Cover Image'] || [];
    const airtableImageUrl = coverAttachments[0]?.url || '';

    // Use Cloudinary URL if available, otherwise fall back to Airtable URL
    const cloudinaryImage = cloudinaryMap[r.id]?.[0];
    let imageUrl = cloudinaryImage?.cloudinaryUrl || airtableImageUrl;

    // Log warning if Cloudinary URL is missing (indicates sync issue)
    if (!cloudinaryImage?.cloudinaryUrl && airtableImageUrl && verbose) {
      console.warn(`[sync-core] ⚠️ Missing Cloudinary URL for journal "${title}" - using Airtable fallback`);
    }

    // Get tags
    const tags = f['Tags'] || [];

    // Get related project ID
    const relatedProjectId = f['Related Project']?.[0] || null;

    // Parse related links from Links or External Links field
    const rawLinks = f['Links'] || f['External Links'] || '';
    const relatedLinks = rawLinks
      ? rawLinks.split(',').map(s => s.trim()).filter(s => s.length > 0)
      : [];

    posts.push({
      id: r.id,
      slug: makeSlug(title),
      title,
      date,
      status,
      content,
      excerpt,
      readingTime,
      imageUrl,
      tags,
      relatedProjectId,
      relatedLinks,
      source: 'local',
      // Store raw attachment for Cloudinary upload detection
      _rawCoverImage: coverAttachments[0] || null
    });
  }

  // Sort posts by date (newest first)
  posts.sort((a, b) => {
    const dateA = a.date || '1900-01-01';
    const dateB = b.date || '1900-01-01';
    return dateB.localeCompare(dateA);
  });

  return posts;
}

/**
 * Process config/settings record from raw Airtable data
 * @param {Array} rawRecords - Raw Airtable settings records
 * @param {Object} cloudinaryMapping - Cloudinary URL mapping
 * @param {boolean} verbose - Enable verbose logging
 * @param {string} portfolioMode - Portfolio mode: 'directing' or 'postproduction'
 * @returns {Object} Processed config object
 */
function processConfigRecords(rawRecords, cloudinaryMapping, verbose, portfolioMode = 'directing') {
  if (rawRecords.length === 0) {
    return getDefaultSettings();
  }

  // Find the correct settings row based on Portfolio ID
  let settingsRecord = rawRecords.find(r => {
    const portfolioId = r.fields?.['Portfolio ID'] || '';
    return portfolioId.toLowerCase() === portfolioMode.toLowerCase();
  });

  // Fallback to first record if no matching Portfolio ID found
  if (!settingsRecord) {
    if (verbose) console.warn(`[sync-core] ⚠️ No settings found for portfolio mode "${portfolioMode}", using first row`);
    settingsRecord = rawRecords[0];
  } else if (verbose) {
    console.log(`[sync-core] ✅ Using settings for portfolio: ${portfolioMode}`);
  }

  const f = settingsRecord.fields || {};

  // Build cloudinary lookup map for config images
  const cloudinaryConfigImagesArray = cloudinaryMapping?.config?.images || [];
  const cloudinaryConfigImages = {};
  cloudinaryConfigImagesArray.forEach(img => {
    cloudinaryConfigImages[img.type] = img.cloudinaryUrl;
  });

  // Extract showreel fields
  const showreelEnabled = f['Showreel Enabled'] || false;
  const showreelUrl = f['Showreel URL'] || '';
  const showreelPlaceholderAttachments = f['Showreel Placeholder'] || [];
  const showreelPlaceholderAirtableUrl = showreelPlaceholderAttachments[0] ? showreelPlaceholderAttachments[0].url : '';
  const showreelPlaceholderImage = cloudinaryConfigImages['showreel'] || showreelPlaceholderAirtableUrl;

  // Extract contact fields
  const contactEmail = f['Contact Email'] || '';
  const contactPhone = f['Contact Phone'] || '';
  const repUK = f['Rep UK'] || '';
  const repUSA = f['Rep USA'] || '';
  const instagramUrl = f['Instagram URL'] || '';
  const vimeoUrl = f['Vimeo URL'] || '';
  const linkedinUrl = f['LinkedIn URL'] || f['Linkedin URL'] || '';
  const imdbUrl = f['IMDb URL'] || f['IMDB URL'] || '';

  // Extract about fields
  const bio = f['Bio'] || '';
  const aboutImageAttachments = f['About Image'] || [];
  const aboutAirtableUrl = aboutImageAttachments[0] ? aboutImageAttachments[0].url : '';
  const aboutProfileImage = cloudinaryConfigImages['profile'] || aboutAirtableUrl;

  // Extract other settings
  const name = f['Name'] || '';

  const allowedRolesRaw = f['Allowed Roles'] || '';

  // Handle Allowed Roles - might be string or array
  let allowedRoles = [];
  if (Array.isArray(allowedRolesRaw)) {
    allowedRoles = allowedRolesRaw;
  } else if (typeof allowedRolesRaw === 'string' && allowedRolesRaw) {
    allowedRoles = allowedRolesRaw.split(',').map(r => r.trim()).filter(r => r);
  }

  // Get the OTHER portfolio's allowed roles for cross-site credits
  // If this is 'directing', get 'postproduction' allowed roles, and vice versa
  let otherPortfolioAllowedRoles = [];
  let otherPortfolioName = '';
  const otherPortfolioMode = portfolioMode === 'directing' ? 'postproduction' : 'directing';
  const otherPortfolioRecord = rawRecords.find(r => {
    const portfolioId = r.fields?.['Portfolio ID'] || '';
    return portfolioId.toLowerCase() === otherPortfolioMode.toLowerCase();
  });

  if (otherPortfolioRecord) {
    const otherRolesRaw = otherPortfolioRecord.fields?.['Allowed Roles'] || '';
    if (Array.isArray(otherRolesRaw)) {
      otherPortfolioAllowedRoles = otherRolesRaw;
    } else if (typeof otherRolesRaw === 'string' && otherRolesRaw) {
      otherPortfolioAllowedRoles = otherRolesRaw.split(',').map(r => r.trim()).filter(r => r);
    }

    // Get the other portfolio's name for cross-site credits
    otherPortfolioName = otherPortfolioRecord.fields?.['Site Title'] ||
      otherPortfolioRecord.fields?.['Owner Name'] ||
      otherPortfolioRecord.fields?.['Portfolio Owner'] ||
      (portfolioMode === 'directing' ? 'Lemon Post' : 'Gabriel Athanasiou');
  }

  const defaultOgImageAttachments = f['Default OG Image'] || [];
  const defaultOgAirtableUrl = defaultOgImageAttachments[0] ? defaultOgImageAttachments[0].url : '';
  const defaultOgImage = cloudinaryConfigImages['defaultOg'] || defaultOgAirtableUrl;

  const lastModified = f['Last Modified'] || '';

  // New multi-portfolio fields
  const portfolioId = f['Portfolio ID'] || 'directing';
  const siteTitle = f['Site Title'] || '';
  const navTitle = f['Nav Title'] || '';
  const seoTitle = f['SEO Title'] || '';
  const seoDescription = f['SEO Description'] || '';
  const domain = f['Domain'] || '';

  // Logo attachment
  const logoAttachments = f['Logo'] || [];
  const logoAirtableUrl = logoAttachments[0] ? logoAttachments[0].url : '';
  const logo = cloudinaryConfigImages['logo'] || logoAirtableUrl;

  // Favicon attachment
  const faviconAttachments = f['Favicon'] || [];
  const faviconAirtableUrl = faviconAttachments[0] ? faviconAttachments[0].url : '';
  const favicon = cloudinaryConfigImages['favicon'] || faviconAirtableUrl;

  const fontFamily = f['Font Family'] || '';
  const workSectionLabel = f['Work Section Label'] || 'Filmography';
  const hasJournal = f['Has Journal'] || false;
  const showRoleFilter = f['Show Role Filter'] || false;
  const showOtherPortfolioLink = f['Show Other Portfolio Link'] || false;
  const otherPortfolioUrl = f['Other Portfolio URL'] || '';
  const otherPortfolioLabel = f['Other Portfolio Label'] || '';
  const aboutLayout = f['About Layout'] || 'standard';
  const themeMode = f['Theme Mode'] || 'dark';

  // Legal/Business: Trading name disclosure for UK sole traders
  const tradingNameDisclosure = f['Trading Name Disclosure'] || '';

  // Analytics: Google Analytics 4 Measurement ID
  const gaMeasurementId = f['GA Measurement ID'] || '';

  // Portfolio owner name: use 'Owner Name' field first, then Site Title, then default
  let portfolioOwnerName = f['Owner Name'] || f['Portfolio Owner'] || siteTitle || '';
  if (!portfolioOwnerName) {
    portfolioOwnerName = 'Gabriel Athanasiou';
  }

  return {
    // Multi-portfolio fields
    portfolioId,
    siteTitle,
    navTitle,
    seoTitle,
    seoDescription,
    domain,
    logo,
    favicon,
    fontFamily,
    workSectionLabel,
    hasJournal,
    showRoleFilter,
    showOtherPortfolioLink,
    otherPortfolioUrl,
    otherPortfolioLabel,
    aboutLayout,
    themeMode,
    tradingNameDisclosure,
    gaMeasurementId,

    // Existing fields
    showreel: {
      enabled: showreelEnabled,
      videoUrl: showreelUrl,
      placeholderImage: showreelPlaceholderImage
    },
    contact: {
      email: contactEmail,
      phone: contactPhone,
      repUK: repUK,
      repUSA: repUSA,
      instagram: instagramUrl,
      vimeo: vimeoUrl,
      linkedin: linkedinUrl,
      imdb: imdbUrl
    },
    about: {
      bio: bio,
      profileImage: aboutProfileImage
    },
    allowedRoles: allowedRoles,
    otherPortfolioAllowedRoles: otherPortfolioAllowedRoles,
    otherPortfolioName: otherPortfolioName,
    defaultOgImage: defaultOgImage,
    portfolioOwnerName: portfolioOwnerName,
    lastModified: lastModified
  };
}
