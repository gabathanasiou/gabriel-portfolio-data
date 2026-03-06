/**
 * Shared TypeScript Types
 * Common type definitions used across the application
 */

// ==========================================
// VIDEO TYPES
// ==========================================

export interface VideoIdResult {
  type: 'youtube' | 'vimeo' | null;
  id: string | null;
  hash?: string | null;
}

export interface VideoEmbedOptions {
  autoplay?: boolean;
  muted?: boolean;
  loop?: boolean;
  controls?: boolean;
}

// ==========================================
// TEXT TYPES
// ==========================================

export interface CreditItem {
  role: string;
  name: string;
}

// ==========================================
// IMAGE TYPES
// ==========================================

export interface ImageTransformation {
  width?: number;
  height?: number;
  quality?: number;
  format?: 'webp' | 'jpg' | 'png' | 'avif';
  dpr?: number;
  crop?: 'limit' | 'fill' | 'fit' | 'scale';
}

export interface CloudinaryImage {
  publicId: string;
  cloudinaryUrl: string;
  airtableId?: string;
  airtableUrl?: string;
  filename?: string;
  size?: number;
  format?: string;
  error?: string;
  index?: number;
}

export interface CloudinaryMapping {
  generatedAt: string;
  projects: CloudinaryProjectMapping[];
  journal: CloudinaryJournalMapping[];
  config?: {
    images: CloudinaryConfigImage[];
  };
}

export interface CloudinaryProjectMapping {
  recordId: string;
  title: string;
  images: CloudinaryImage[];
}

export interface CloudinaryJournalMapping {
  recordId: string;
  title: string;
  images: CloudinaryImage[];
}

export interface CloudinaryConfigImage {
  type: 'profile' | 'showreel';
  publicId: string;
  cloudinaryUrl: string;
  originalUrl: string;
  format?: string;
  size?: number;
  error?: string;
}

// ==========================================
// PORTFOLIO DATA TYPES
// ==========================================

export interface Project {
  id: string;
  title: string;
  slug: string;
  category: string;
  subcategory?: string;
  description?: string;
  credits?: CreditItem[];
  images?: string[];
  videos?: string[];
  externalLinks?: { label: string; url: string }[];
  featured?: boolean;
  order?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface JournalPost {
  id: string;
  title: string;
  slug: string;
  excerpt?: string;
  content?: string;
  coverImage?: string;
  author?: string;
  publishedDate?: string;
  readingTime?: string;
  tags?: string[];
  featured?: boolean;
  order?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface AboutConfig {
  bio?: string;
  profileImage?: string;
  email?: string;
  socials?: { platform: string; url: string }[];
}

export interface ShowreelConfig {
  videoUrl?: string;
  placeholderImage?: string;
  enabled?: boolean;
}

export interface PortfolioData {
  generatedAt: string;
  projects: Project[];
  journal: JournalPost[];
  config: {
    about?: AboutConfig;
    showreel?: ShowreelConfig;
  };
}

// ==========================================
// SLUG TYPES
// ==========================================

export type SlugSet = Set<string>;

export interface SlugOptions {
  fallbackId?: string;
  maxLength?: number;
}

// ==========================================
// AIRTABLE TYPES
// ==========================================

export interface AirtableAttachment {
  id: string;
  url: string;
  filename?: string;
  size?: number;
  type?: string;
  width?: number;
  height?: number;
}

export interface AirtableRecord {
  id: string;
  fields: Record<string, any>;
  createdTime: string;
}

export interface AirtableSyncResult {
  success: boolean;
  projectsCount?: number;
  journalCount?: number;
  timestamp: string;
  error?: string;
  cached?: boolean;
}

// ==========================================
// UTILITY TYPES
// ==========================================

export interface FetchOptions {
  timeout?: number;
  retries?: number;
  headers?: Record<string, string>;
}

export type AsyncReturnType<T extends (...args: any) => Promise<any>> = T extends (
  ...args: any
) => Promise<infer R>
  ? R
  : any;
