/**
 * Sync Logic — Clean rewrite of the portfolio data sync pipeline.
 *
 * Fetches all 5 Airtable tables ONCE, syncs images to Cloudinary,
 * then processes and writes portfolio-data.json for each portfolio mode.
 *
 * Replaces the old sync-core.mjs monolith (1,219 lines → ~400 lines).
 * See docs/SCHEMA.md for the full Airtable → Output field mapping.
 */

import fs from 'fs';
import path from 'path';
import { v2 as cloudinary } from 'cloudinary';
import { getVideoThumbnail } from '../utils/videoHelpers.mjs';
import { normalizeTitle, calculateReadingTime, parseCreditsText } from '../utils/helpers/textHelpers.mjs';
import { uploadToCloudinary, checkImageExists } from '../utils/cloudinary/cloudinaryHelpers.mjs';
import {
    fetchAirtableTable,
    parseExternalLinks,
    makeSlug,
    normalizeProjectType,
    resolveProductionCompany,
    resolveAwards
} from './airtable-helpers.mjs';


// ═══════════════════════════════════════════════════════════════
// Main Orchestrator
// ═══════════════════════════════════════════════════════════════

/**
 * Unified sync: fetch once, process both portfolios, write both files.
 *
 * @param {Object} config
 * @param {string} config.airtableToken
 * @param {string} config.airtableBaseId
 * @param {string} config.outputDir       - Repo root (default: '.')
 * @param {boolean} config.verbose         - Log progress
 * @param {boolean} config.skipFileWrites  - Dry-run mode
 * @param {string[]} config.portfolioModes - e.g. ['directing', 'postproduction']
 * @returns {Promise<Object>} Sync results
 */
export async function syncPortfolios(config) {
    const {
        airtableToken,
        airtableBaseId,
        outputDir = '.',
        verbose = false,
        skipFileWrites = false,
        portfolioModes = ['directing', 'postproduction']
    } = config;

    if (!airtableToken || !airtableBaseId) {
        throw new Error('Missing required Airtable credentials');
    }

    const log = verbose ? (...args) => console.log('[sync]', ...args) : () => { };
    const timestamp = new Date().toISOString();

    // ── Step 1: Fetch all tables in parallel (5 API calls total) ──
    log('🔄 Fetching all Airtable tables...');
    const [projectRecords, journalRecords, festivalRecords, clientRecords, settingsRecords] = await Promise.all([
        fetchAirtableTable('Projects', 'Release Date', airtableToken, airtableBaseId),
        fetchAirtableTable('Journal', 'Date', airtableToken, airtableBaseId),
        fetchAirtableTable('tblGdWlTVC06ZT60H', null, airtableToken, airtableBaseId),  // Festivals
        fetchAirtableTable('Client Book', null, airtableToken, airtableBaseId),
        fetchAirtableTable('Settings', null, airtableToken, airtableBaseId),
    ]);
    log(`✅ Fetched: ${projectRecords.length} projects, ${journalRecords.length} journal, ${festivalRecords.length} festivals, ${clientRecords.length} clients, ${settingsRecords.length} settings`);

    // ── Step 2: Build lookup maps ──
    const festivalsMap = Object.fromEntries(
        festivalRecords.map(r => [r.id, r.fields['Display Name'] || r.fields['Name'] || 'Unknown Award'])
    );
    const clientsMap = Object.fromEntries(
        clientRecords.map(r => [r.id, r.fields['Company'] || r.fields['Name'] || 'Unknown'])
    );
    log('✅ Built lookup maps');

    // ── Step 3: Sync images to Cloudinary (check-then-upload) ──
    const existingMapping = loadCloudinaryMapping(outputDir);
    const updatedMapping = await syncImagesToCloudinary(projectRecords, journalRecords, existingMapping, verbose);

    if (!skipFileWrites && updatedMapping) {
        saveCloudinaryMapping(outputDir, updatedMapping);
        log('✅ Saved Cloudinary mapping');
    }

    const mapping = updatedMapping || existingMapping;

    // ── Step 4: Process each portfolio mode ──
    const results = { success: true, portfolios: {}, timestamp, apiCalls: 5 };

    for (const mode of portfolioModes) {
        log(`\n📂 Processing portfolio: ${mode}`);

        const portfolioConfig = processConfig(settingsRecords, mapping, mode, verbose);
        log(`✅ Config ready (domain: ${portfolioConfig.domain || 'none'})`);

        const projects = await processProjects(
            projectRecords, festivalsMap, clientsMap, mapping, portfolioConfig, mode, verbose
        );
        log(`✅ ${projects.length} projects`);

        let journal = [];
        if (portfolioConfig.hasJournal) {
            journal = processJournal(journalRecords, mapping, verbose);
            log(`✅ ${journal.length} journal posts`);
        } else {
            log(`⏭️ Journal disabled for ${mode}`);
        }

        results.portfolios[mode] = { projects, journal, config: portfolioConfig };

        // Write output
        if (!skipFileWrites) {
            const modeDir = path.join(outputDir, mode);
            fs.mkdirSync(modeDir, { recursive: true });

            const payload = {
                projects: stripInternalFields(projects),
                posts: stripInternalFields(journal),
                config: portfolioConfig,
                portfolioMode: mode,
                lastUpdated: timestamp,
                version: '2.0',
                source: 'sync-logic'
            };

            const outputFile = path.join(modeDir, 'portfolio-data.json');
            fs.writeFileSync(outputFile, JSON.stringify(payload, null, 2));
            log(`✅ Wrote ${outputFile}`);
        }
    }

    log(`\n🎉 Sync complete! (${results.apiCalls} API calls for all portfolios)`);
    return results;
}


// ═══════════════════════════════════════════════════════════════
// Config Processor
// ═══════════════════════════════════════════════════════════════

function processConfig(settingsRecords, cloudinaryMapping, portfolioMode, verbose) {
    if (!settingsRecords.length) return getDefaultConfig();

    // Find settings row matching this portfolio mode
    let record = settingsRecords.find(r =>
        (r.fields['Portfolio ID'] || '').toLowerCase() === portfolioMode.toLowerCase()
    );
    if (!record) {
        if (verbose) console.warn(`[sync] ⚠️ No settings for "${portfolioMode}", using first row`);
        record = settingsRecords[0];
    }

    const f = record.fields || {};

    // Cloudinary config image lookup (profile, showreel, logo, etc.)
    const configImages = Object.fromEntries(
        (cloudinaryMapping?.config?.images || []).map(img => [img.type, img.cloudinaryUrl])
    );

    // Helper: resolve attachment URL with Cloudinary override
    const attachmentUrl = (field, cloudinaryKey) => {
        const attachments = f[field] || [];
        const airtableUrl = attachments[0]?.url || '';
        return cloudinaryKey ? (configImages[cloudinaryKey] || airtableUrl) : airtableUrl;
    };

    // Parse roles (multipleSelects array or comma-separated string)
    const parseRoles = (raw) => {
        if (Array.isArray(raw)) return raw;
        if (typeof raw === 'string' && raw) return raw.split(',').map(r => r.trim()).filter(Boolean);
        return [];
    };

    const allowedRoles = parseRoles(f['Allowed Roles'] || '');

    // Cross-site: read the OTHER portfolio's settings for cross-site credits
    const otherMode = portfolioMode === 'directing' ? 'postproduction' : 'directing';
    const otherRecord = settingsRecords.find(r =>
        (r.fields['Portfolio ID'] || '').toLowerCase() === otherMode.toLowerCase()
    );
    const otherFields = otherRecord?.fields || {};
    const otherAllowedRoles = parseRoles(otherFields['Allowed Roles'] || '');
    const otherName = otherFields['Site Title'] || otherFields['Owner Name'] || '';

    return {
        // Identity
        portfolioId: f['Portfolio ID'] || 'directing',
        siteTitle: f['Site Title'] || '',
        navTitle: f['Nav Title'] || '',
        seoTitle: f['SEO Title'] || '',
        seoDescription: f['SEO Description'] || '',
        domain: f['Domain'] || '',
        logo: attachmentUrl('Logo', 'logo'),
        favicon: attachmentUrl('Favicon', 'favicon'),
        fontFamily: f['Font Family'] || '',

        // Feature flags
        workSectionLabel: f['Work Section Label'] || 'Filmography',
        hasJournal: f['Has Journal'] || false,
        showRoleFilter: f['Show Role Filter'] || false,

        // Cross-portfolio
        showOtherPortfolioLink: f['Show Other Portfolio Link'] || false,
        otherPortfolioUrl: f['Other Portfolio URL'] || '',
        otherPortfolioLabel: f['Other Portfolio Label'] || '',

        // Layout & theme
        aboutLayout: f['About Layout'] || 'standard',
        themeMode: f['Theme Mode'] || 'dark',

        // Legal & analytics
        tradingNameDisclosure: f['Trading Name Disclosure'] || '',
        gaMeasurementId: f['GA Measurement ID'] || '',

        // Showreel
        showreel: {
            enabled: f['Showreel Enabled'] || false,
            videoUrl: f['Showreel URL'] || '',
            placeholderImage: attachmentUrl('Showreel Placeholder', 'showreel'),
        },

        // Contact
        contact: {
            email: f['Contact Email'] || '',
            phone: f['Contact Phone'] || '',
            repUK: f['Rep UK'] || '',
            repUSA: f['Rep USA'] || '',
            instagram: f['Instagram URL'] || '',
            vimeo: f['Vimeo URL'] || '',
            linkedin: f['LinkedIn URL'] || f['Linkedin URL'] || '',
            imdb: f['IMDb URL'] || f['IMDB URL'] || '',
        },

        // About
        about: {
            bio: f['Bio'] || '',
            profileImage: attachmentUrl('About Image', 'profile'),
        },

        // Roles & credits
        allowedRoles,
        otherPortfolioAllowedRoles: otherAllowedRoles,
        otherPortfolioName: otherName,

        // Images & meta
        defaultOgImage: attachmentUrl('Default OG Image', 'defaultOg'),
        portfolioOwnerName: f['Owner Name'] || f['Portfolio Owner'] || f['Site Title'] || 'Gabriel Athanasiou',
        lastModified: f['Last Modified'] || '',
    };
}

function getDefaultConfig() {
    return {
        portfolioId: 'directing', siteTitle: '', navTitle: '',
        seoTitle: '', seoDescription: '', domain: '',
        logo: '', favicon: '', fontFamily: '',
        workSectionLabel: 'Filmography', hasJournal: true, showRoleFilter: false,
        showOtherPortfolioLink: false, otherPortfolioUrl: '', otherPortfolioLabel: '',
        aboutLayout: 'standard', themeMode: 'dark',
        tradingNameDisclosure: '', gaMeasurementId: '',
        showreel: { enabled: false, videoUrl: '', placeholderImage: '' },
        contact: { email: '', phone: '', repUK: '', repUSA: '', instagram: '', vimeo: '', linkedin: '', imdb: '' },
        about: { bio: '', profileImage: '' },
        allowedRoles: [], otherPortfolioAllowedRoles: [], otherPortfolioName: '',
        defaultOgImage: '', portfolioOwnerName: '', lastModified: '',
    };
}


// ═══════════════════════════════════════════════════════════════
// Project Processor
// ═══════════════════════════════════════════════════════════════

async function processProjects(records, festivalsMap, clientsMap, cloudinaryMapping, config, portfolioMode, verbose) {
    const ownerName = config.portfolioOwnerName || '';
    const allowedRoles = config.allowedRoles || [];
    const displayStatusField = portfolioMode === 'postproduction' ? 'Display Status (Post)' : 'Display Status';

    // Cloudinary lookup: recordId → images[]
    const cloudinaryMap = {};
    (cloudinaryMapping?.projects || []).forEach(p => {
        cloudinaryMap[p.recordId] = p.images || [];
    });

    const projects = [];

    for (const record of records) {
        const f = record.fields || {};

        // ── Visibility filter ──
        const displayStatus = f[displayStatusField] || '';
        if (!displayStatus || displayStatus === 'Hidden') continue;

        // ── Role filter ──
        const roleField = f['Role'] || null;
        if (allowedRoles.length > 0) {
            if (!roleField) continue;
            const projectRoles = Array.isArray(roleField) ? roleField : [roleField];
            if (!projectRoles.some(r => allowedRoles.includes(r))) continue;
        }

        // ── Core fields ──
        const rawTitle = f['Name'] || 'Untitled';
        const title = normalizeTitle(rawTitle);
        const releaseDate = f['Release Date'] || '';
        const workDate = f['Work Date'] || releaseDate;
        const description = f['About'] || f['Description'] || '';
        const year = (releaseDate || workDate).split('-')[0] || '';

        const isFeatured = displayStatus === 'Featured' || displayStatus === 'Hero';
        const isHero = displayStatus === 'Hero';

        const type = normalizeProjectType(f['Project Type'] || '');
        const kinds = f['Kind'] ? [f['Kind']] : (f['Kinds'] || []);
        const genre = f['Genre'] || [];
        const client = f['Client'] || '';

        // ── Credits ──
        const rawCredits = f['Credits (new)'] || f['Credits'] || '';
        const extraCredits = parseCreditsText(rawCredits);

        // Owner credits (roles matching this portfolio's allowedRoles)
        const ownerCredits = [];
        if (ownerName && allowedRoles.length > 0 && roleField) {
            const projectRoles = Array.isArray(roleField) ? roleField : [roleField];
            projectRoles
                .filter(r => allowedRoles.includes(r))
                .forEach(r => ownerCredits.push({ role: r, name: ownerName }));
        }

        // Cross-site credits (roles matching the OTHER portfolio's allowedRoles)
        const crossSiteCredits = [];
        const otherRoles = config.otherPortfolioAllowedRoles || [];
        const otherUrl = config.otherPortfolioUrl || '';
        if (otherRoles.length > 0 && otherUrl && roleField) {
            const projectRoles = Array.isArray(roleField) ? roleField : [roleField];
            projectRoles
                .filter(r => otherRoles.includes(r))
                .forEach(r => crossSiteCredits.push({
                    role: r,
                    name: config.otherPortfolioName || 'Unknown',
                    isCrossSite: true,
                    externalUrl: otherUrl,
                }));
        }

        const credits = [...ownerCredits, ...crossSiteCredits, ...extraCredits];

        // ── Videos ──
        const videoUrlField = f['Video URL'] || '';
        const rawLinks = f['External Links'] || '';
        const { links, videos: externalVideos } = parseExternalLinks(rawLinks);

        const primaryVideos = videoUrlField ? videoUrlField.split(',').map(v => v.trim()).filter(Boolean) : [];
        const additionalExternalVideos = externalVideos.filter(v => !primaryVideos.includes(v));
        const finalVideoUrl = [...primaryVideos, ...additionalExternalVideos].join(', ');

        // ── Gallery (prefer Cloudinary URLs) ──
        const galleryAttachments = f['Gallery'] || f['Gallery (Image)'] || [];
        const gallery = galleryAttachments.map((att, idx) => {
            const cloudinaryImg = cloudinaryMap[record.id]?.[idx];
            if (cloudinaryImg?.cloudinaryUrl) return cloudinaryImg.cloudinaryUrl;
            if (verbose) console.warn(`[sync] ⚠️ Missing Cloudinary URL for "${title}" gallery[${idx}]`);
            return att.url;
        });

        // ── Hero image ──
        let heroImage = gallery[0] || '';
        if (!heroImage && finalVideoUrl) {
            try {
                heroImage = await getVideoThumbnail(finalVideoUrl) || '';
            } catch (err) {
                if (verbose) console.warn(`[sync] ⚠️ Video thumbnail failed for "${title}": ${err.message}`);
            }
        }

        // ── Awards & production company ──
        const festivalIds = f['Festivals'] || f['Awards'] || [];
        const awards = resolveAwards(festivalIds, festivalsMap);
        const productionCompanyId = f['Production Company']?.[0];
        const productionCompany = resolveProductionCompany(productionCompanyId, clientsMap);

        // ── Related article ──
        const relatedArticleId = f['Journal']?.[0] || f['Related Article']?.[0] || null;

        projects.push({
            id: record.id,
            slug: makeSlug(title),
            title, type, kinds, genre, productionCompany, client,
            year, releaseDate, workDate, description,
            isFeatured, isHero, heroImage, gallery,
            videoUrl: finalVideoUrl, additionalVideos: [],
            awards, credits, externalLinks: links,
            relatedArticleId,
        });
    }

    // Sort newest first (Release Date priority, then Work Date)
    projects.sort((a, b) => {
        const da = a.releaseDate || a.workDate || '1900-01-01';
        const db = b.releaseDate || b.workDate || '1900-01-01';
        return db.localeCompare(da);
    });

    return projects;
}


// ═══════════════════════════════════════════════════════════════
// Journal Processor
// ═══════════════════════════════════════════════════════════════

function processJournal(records, cloudinaryMapping, verbose) {
    // Cloudinary lookup: recordId → images[]
    const cloudinaryMap = {};
    (cloudinaryMapping?.journal || []).forEach(p => {
        cloudinaryMap[p.recordId] = p.images || [];
    });

    const posts = [];

    for (const record of records) {
        const f = record.fields || {};
        if ((f['Status'] || '') !== 'Published') continue;

        const title = normalizeTitle(f['Title'] || 'Untitled');
        const date = f['Publish Date'] || f['Date'] || '';
        const content = f['Content'] || '';
        const excerpt = f['Excerpt'] || '';
        const readingTime = calculateReadingTime(content);

        // Cover image (prefer Cloudinary)
        const coverAttachments = f['Cover Image'] || [];
        const airtableUrl = coverAttachments[0]?.url || '';
        const cloudinaryImg = cloudinaryMap[record.id]?.[0];
        const imageUrl = cloudinaryImg?.cloudinaryUrl || airtableUrl;

        if (!cloudinaryImg?.cloudinaryUrl && airtableUrl && verbose) {
            console.warn(`[sync] ⚠️ Missing Cloudinary URL for journal "${title}"`);
        }

        const tags = f['Tags'] || [];
        const relatedProjectId = f['Related Project']?.[0] || null;

        const rawLinks = f['Links'] || f['External Links'] || '';
        const relatedLinks = rawLinks
            ? rawLinks.split(',').map(s => s.trim()).filter(Boolean)
            : [];

        posts.push({
            id: record.id,
            slug: makeSlug(title),
            title, date, status: 'Published',
            content, excerpt, readingTime, imageUrl,
            tags, relatedProjectId, relatedLinks,
            source: 'local',
        });
    }

    // Sort newest first
    posts.sort((a, b) => (b.date || '1900-01-01').localeCompare(a.date || '1900-01-01'));

    return posts;
}


// ═══════════════════════════════════════════════════════════════
// Cloudinary Sync (check-then-upload)
// ═══════════════════════════════════════════════════════════════

function configureCloudinarySdk() {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME || process.env.VITE_CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;
    const useIt = process.env.USE_CLOUDINARY === 'true';

    if (!useIt || !cloudName || !apiKey || !apiSecret) {
        return { enabled: false };
    }

    cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true });
    return { enabled: true, cloudName };
}

/**
 * Sync images to Cloudinary. Works directly with raw Airtable records.
 *
 * Uses a CACHE-FIRST strategy:
 * 1. Build a lookup from cloudinary-mapping.json (publicId+airtableId → cached entry)
 * 2. For each Airtable attachment:
 *    - If already in cache with matching airtableId → reuse instantly (0 API calls)
 *    - If NOT in cache → check Cloudinary API, upload if missing
 *
 * This means unchanged content = 0 Cloudinary API calls (instant).
 * Only genuinely new/changed images hit the network.
 */
async function syncImagesToCloudinary(projectRecords, journalRecords, existingMapping, verbose) {
    const cloudinaryConfig = configureCloudinarySdk();
    if (!cloudinaryConfig.enabled) {
        if (verbose) console.log('[sync] ⏭️ Cloudinary disabled or credentials missing');
        return existingMapping;
    }

    const log = verbose ? (...args) => console.log('[sync]', ...args) : () => { };

    // ── Build cache from existing mapping ──
    // Key: "publicId::airtableId" → cached image entry
    const cache = new Map();
    for (const project of (existingMapping?.projects || [])) {
        for (const img of (project.images || [])) {
            if (img.publicId && img.cloudinaryUrl && img.airtableId) {
                cache.set(`${img.publicId}::${img.airtableId}`, img);
            }
        }
    }
    for (const post of (existingMapping?.journal || [])) {
        for (const img of (post.images || [])) {
            if (img.publicId && img.cloudinaryUrl && img.airtableId) {
                cache.set(`${img.publicId}::${img.airtableId}`, img);
            }
        }
    }
    log(`📦 Loaded ${cache.size} cached Cloudinary entries`);

    const newMapping = {
        generatedAt: new Date().toISOString(),
        projects: [],
        journal: [],
        config: existingMapping?.config || { images: [] },
    };

    let uploaded = 0, cached = 0, checkedAndFound = 0, failed = 0;

    // Helper: resolve a single image (cache → API check → upload)
    async function resolveImage(publicId, airtableId, airtableUrl, title, label) {
        // 1. Check local cache first (instant, no API call)
        const cacheKey = `${publicId}::${airtableId}`;
        const cachedEntry = cache.get(cacheKey);
        if (cachedEntry) {
            cached++;
            return cachedEntry;
        }

        // 2. Not in cache — check Cloudinary API
        const existing = await checkImageExists(cloudinary, publicId);
        if (existing) {
            log(`   ⏭️ Exists (API): ${title} ${label}`);
            checkedAndFound++;
            return {
                publicId: existing.publicId,
                cloudinaryUrl: existing.cloudinaryUrl,
                airtableId,
                format: existing.format, size: existing.size,
            };
        }

        // 3. Not in Cloudinary — upload
        log(`   📤 Uploading: ${title} ${label}`);
        const result = await uploadToCloudinary(cloudinary, airtableUrl, publicId, { title });
        if (result.success) {
            uploaded++;
            return {
                publicId: result.publicId,
                cloudinaryUrl: result.cloudinaryUrl,
                airtableId,
                format: result.format, size: result.size,
            };
        } else {
            failed++;
            return { publicId, cloudinaryUrl: '', airtableId, error: result.error };
        }
    }

    // ── Project gallery images ──
    for (const record of projectRecords) {
        const f = record.fields || {};
        const title = f['Name'] || 'Untitled';
        const gallery = f['Gallery'] || [];
        const projectEntry = { recordId: record.id, title, images: [] };

        for (let i = 0; i < gallery.length; i++) {
            const attachment = gallery[i];
            const publicId = `portfolio-projects-${record.id}-${i}`;
            const resolved = await resolveImage(publicId, attachment.id, attachment.url, title, `[${i}]`);
            projectEntry.images.push({ index: i, ...resolved });
        }

        newMapping.projects.push(projectEntry);
    }

    // ── Journal cover images ──
    for (const record of journalRecords) {
        const f = record.fields || {};
        const title = f['Title'] || 'Untitled';
        const cover = (f['Cover Image'] || [])[0];
        const postEntry = { recordId: record.id, title, images: [] };

        if (cover) {
            const publicId = `portfolio-journal-${record.id}`;
            const resolved = await resolveImage(publicId, cover.id, cover.url, title, '');
            postEntry.images.push({ index: 0, ...resolved });
        }

        newMapping.journal.push(postEntry);
    }

    const total = cached + checkedAndFound + uploaded + failed;
    log(`✅ Cloudinary sync: ${cached} cached, ${checkedAndFound} verified via API, ${uploaded} uploaded, ${failed} failed (${total} total)`);
    return newMapping;
}


// ═══════════════════════════════════════════════════════════════
// File I/O Utilities
// ═══════════════════════════════════════════════════════════════

function loadCloudinaryMapping(outputDir) {
    try {
        const file = path.join(outputDir, 'cloudinary-mapping.json');
        if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf-8'));
    } catch (err) {
        console.warn('[sync] ⚠️ Could not load Cloudinary mapping:', err.message);
    }
    return { generatedAt: new Date().toISOString(), projects: [], journal: [], config: { images: [] } };
}

function saveCloudinaryMapping(outputDir, mapping) {
    try {
        const file = path.join(outputDir, 'cloudinary-mapping.json');
        mapping.generatedAt = new Date().toISOString();
        fs.writeFileSync(file, JSON.stringify(mapping, null, 2), 'utf-8');
    } catch (err) {
        console.error('[sync] ❌ Failed to save Cloudinary mapping:', err.message);
    }
}

function stripInternalFields(data) {
    return JSON.parse(JSON.stringify(data, (key, value) => key.startsWith('_') ? undefined : value));
}
