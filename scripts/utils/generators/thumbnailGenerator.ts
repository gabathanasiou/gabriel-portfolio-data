/**
 * ==============================================================================
 *  PROCEDURAL THUMBNAIL GENERATOR
 * ==============================================================================
 * 
 *  Generates deterministic, elegant SVG thumbnails for projects without video.
 *  Uses project metadata (title, year, type) to create unique, stable visuals.
 * 
 *  Features:
 *  - Deterministic: Same input -> same output (hash-based)
 *  - Small: Sub-1KB SVG generation
 *  - Themeable: Uses site color palette
 *  - Multiple variants: geometric, minimal, film-strip, grid, radial
 */

import { THEME } from '../../theme';

// ==========================================
// TYPES & CONFIG
// ==========================================

export type ThumbnailVariant = 'geometric' | 'minimal' | 'film-strip' | 'grid' | 'radial';

export interface ThumbnailConfig {
  title: string;
  year?: string;
  type?: string;
  variant?: ThumbnailVariant;
  width?: number;
  height?: number;
  /** Show large title text overlay */
  showTitle?: boolean;
  /** Show small metadata (year/type) */
  showMetadata?: boolean;
}

// Color palettes per project type (muted, sophisticated gradients)
const TYPE_PALETTES: Record<string, { primary: string; secondary: string; accent: string }> = {
  Narrative: {
    primary: '#1a1a2e',
    secondary: '#16213e',
    accent: '#e94560'
  },
  Commercial: {
    primary: '#0f3460',
    secondary: '#16213e',
    accent: '#e94560'
  },
  'Music Video': {
    primary: '#2d132c',
    secondary: '#3c1642',
    accent: '#ff6b9d'
  },
  Documentary: {
    primary: '#1e3a2e',
    secondary: '#2c5f4e',
    accent: '#7cb342'
  },
  Uncategorized: {
    primary: '#1a1a1a',
    secondary: '#2a2a2a',
    accent: '#666666'
  }
};

// ==========================================
// DETERMINISTIC HASH UTILITIES
// ==========================================

/**
 * Simple string hash for deterministic randomness
 */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

/**
 * Seeded random number generator (0-1)
 */
function seededRandom(seed: number, index: number = 0): number {
  const x = Math.sin(seed + index * 12.9898) * 43758.5453123;
  return x - Math.floor(x);
}

/**
 * Get deterministic value from array
 */
function pickFromArray<T>(arr: T[], seed: number, index: number = 0): T {
  const randomIndex = Math.floor(seededRandom(seed, index) * arr.length);
  return arr[randomIndex];
}

/**
 * Generate deterministic color from seed
 */
function generateColor(seed: number, saturation: number = 50, lightness: number = 50): string {
  const hue = Math.floor(seededRandom(seed) * 360);
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

// ==========================================
// VARIANT GENERATORS
// ==========================================

/**
 * GEOMETRIC: Abstract shapes and lines
 */
function generateGeometric(config: ThumbnailConfig, seed: number, colors: ReturnType<typeof getColorPalette>): string {
  const { width = 1200, height = 675 } = config;
  
  const shapes: string[] = [];
  
  // Diagonal lines
  const lineCount = 5 + Math.floor(seededRandom(seed, 1) * 8);
  for (let i = 0; i < lineCount; i++) {
    const x1 = seededRandom(seed, i * 2) * width;
    const y1 = seededRandom(seed, i * 2 + 1) * height;
    const angle = seededRandom(seed, i * 3) * 360;
    const length = 100 + seededRandom(seed, i * 4) * 300;
    const x2 = x1 + Math.cos(angle * Math.PI / 180) * length;
    const y2 = y1 + Math.sin(angle * Math.PI / 180) * length;
    const opacity = 0.05 + seededRandom(seed, i * 5) * 0.1;
    
    shapes.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${colors.accent}" stroke-width="2" opacity="${opacity}" />`);
  }
  
  // Circles
  const circleCount = 3 + Math.floor(seededRandom(seed, 100) * 5);
  for (let i = 0; i < circleCount; i++) {
    const cx = seededRandom(seed, i * 10 + 50) * width;
    const cy = seededRandom(seed, i * 10 + 51) * height;
    const r = 20 + seededRandom(seed, i * 10 + 52) * 100;
    const opacity = 0.03 + seededRandom(seed, i * 10 + 53) * 0.08;
    
    shapes.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${colors.accent}" stroke-width="1.5" opacity="${opacity}" />`);
  }
  
  // Rectangles
  const rectCount = 2 + Math.floor(seededRandom(seed, 200) * 4);
  for (let i = 0; i < rectCount; i++) {
    const x = seededRandom(seed, i * 15 + 100) * width;
    const y = seededRandom(seed, i * 15 + 101) * height;
    const w = 50 + seededRandom(seed, i * 15 + 102) * 200;
    const h = 50 + seededRandom(seed, i * 15 + 103) * 200;
    const rotation = seededRandom(seed, i * 15 + 104) * 360;
    const opacity = 0.02 + seededRandom(seed, i * 15 + 105) * 0.06;
    
    shapes.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${colors.accent}" opacity="${opacity}" transform="rotate(${rotation} ${x + w/2} ${y + h/2})" />`);
  }
  
  return shapes.join('\n');
}

/**
 * MINIMAL: Clean typography-focused design
 */
function generateMinimal(config: ThumbnailConfig, seed: number, colors: ReturnType<typeof getColorPalette>): string {
  const { width = 1200, height = 675 } = config;
  
  const shapes: string[] = [];
  
  // Simple corner accent
  shapes.push(`<line x1="0" y1="0" x2="${width * 0.15}" y2="0" stroke="${colors.accent}" stroke-width="2" opacity="0.3" />`);
  shapes.push(`<line x1="0" y1="0" x2="0" y2="${height * 0.15}" stroke="${colors.accent}" stroke-width="2" opacity="0.3" />`);
  
  // Bottom right corner
  shapes.push(`<line x1="${width}" y1="${height}" x2="${width - width * 0.15}" y2="${height}" stroke="${colors.accent}" stroke-width="2" opacity="0.3" />`);
  shapes.push(`<line x1="${width}" y1="${height}" x2="${width}" y2="${height - height * 0.15}" stroke="${colors.accent}" stroke-width="2" opacity="0.3" />`);
  
  // Subtle grid
  const gridSpacing = 80;
  for (let x = gridSpacing; x < width; x += gridSpacing) {
    shapes.push(`<line x1="${x}" y1="0" x2="${x}" y2="${height}" stroke="${colors.accent}" stroke-width="0.5" opacity="0.05" />`);
  }
  for (let y = gridSpacing; y < height; y += gridSpacing) {
    shapes.push(`<line x1="0" y1="${y}" x2="${width}" y2="${y}" stroke="${colors.accent}" stroke-width="0.5" opacity="0.05" />`);
  }
  
  return shapes.join('\n');
}

/**
 * FILM-STRIP: Cinema-inspired sprocket holes and frames
 */
function generateFilmStrip(config: ThumbnailConfig, seed: number, colors: ReturnType<typeof getColorPalette>): string {
  const { width = 1200, height = 675 } = config;
  
  const shapes: string[] = [];
  
  // Sprocket holes along top and bottom
  const holeSpacing = 40;
  const holeWidth = 20;
  const holeHeight = 15;
  const margin = 20;
  
  for (let x = margin; x < width - margin; x += holeSpacing) {
    // Top sprockets
    shapes.push(`<rect x="${x}" y="${margin}" width="${holeWidth}" height="${holeHeight}" fill="${colors.accent}" opacity="0.15" rx="2" />`);
    // Bottom sprockets
    shapes.push(`<rect x="${x}" y="${height - margin - holeHeight}" width="${holeWidth}" height="${holeHeight}" fill="${colors.accent}" opacity="0.15" rx="2" />`);
  }
  
  // Vertical film edges
  shapes.push(`<rect x="0" y="0" width="${margin}" height="${height}" fill="${colors.accent}" opacity="0.08" />`);
  shapes.push(`<rect x="${width - margin}" y="0" width="${margin}" height="${height}" fill="${colors.accent}" opacity="0.08" />`);
  
  // Frame dividers
  const frameCount = 3;
  const frameWidth = (width - margin * 2) / frameCount;
  for (let i = 1; i < frameCount; i++) {
    const x = margin + i * frameWidth;
    shapes.push(`<line x1="${x}" y1="0" x2="${x}" y2="${height}" stroke="${colors.accent}" stroke-width="2" opacity="0.1" />`);
  }
  
  return shapes.join('\n');
}

/**
 * GRID: Modular grid pattern with depth
 */
function generateGrid(config: ThumbnailConfig, seed: number, colors: ReturnType<typeof getColorPalette>): string {
  const { width = 1200, height = 675 } = config;
  
  const shapes: string[] = [];
  
  const gridSize = 60;
  const cols = Math.floor(width / gridSize);
  const rows = Math.floor(height / gridSize);
  
  // Generate grid cells with random fills
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = col * gridSize;
      const y = row * gridSize;
      const random = seededRandom(seed, row * cols + col);
      
      if (random > 0.7) {
        const opacity = 0.02 + random * 0.08;
        shapes.push(`<rect x="${x}" y="${y}" width="${gridSize}" height="${gridSize}" fill="${colors.accent}" opacity="${opacity}" />`);
      }
    }
  }
  
  // Grid lines
  for (let col = 0; col <= cols; col++) {
    const x = col * gridSize;
    shapes.push(`<line x1="${x}" y1="0" x2="${x}" y2="${height}" stroke="${colors.accent}" stroke-width="0.5" opacity="0.08" />`);
  }
  for (let row = 0; row <= rows; row++) {
    const y = row * gridSize;
    shapes.push(`<line x1="0" y1="${y}" x2="${width}" y2="${y}" stroke="${colors.accent}" stroke-width="0.5" opacity="0.08" />`);
  }
  
  return shapes.join('\n');
}

/**
 * RADIAL: Concentric circles and radial gradients
 */
function generateRadial(config: ThumbnailConfig, seed: number, colors: ReturnType<typeof getColorPalette>): string {
  const { width = 1200, height = 675 } = config;
  
  const shapes: string[] = [];
  const centerX = width / 2;
  const centerY = height / 2;
  
  // Concentric circles
  const circleCount = 8 + Math.floor(seededRandom(seed, 1) * 6);
  const maxRadius = Math.sqrt(width * width + height * height) / 2;
  
  for (let i = 0; i < circleCount; i++) {
    const radius = (maxRadius / circleCount) * (i + 1);
    const opacity = 0.02 + (1 - i / circleCount) * 0.08;
    shapes.push(`<circle cx="${centerX}" cy="${centerY}" r="${radius}" fill="none" stroke="${colors.accent}" stroke-width="1" opacity="${opacity}" />`);
  }
  
  // Radial lines
  const lineCount = 12 + Math.floor(seededRandom(seed, 2) * 12);
  for (let i = 0; i < lineCount; i++) {
    const angle = (360 / lineCount) * i;
    const x = centerX + Math.cos(angle * Math.PI / 180) * maxRadius;
    const y = centerY + Math.sin(angle * Math.PI / 180) * maxRadius;
    const opacity = 0.03 + seededRandom(seed, i + 10) * 0.05;
    
    shapes.push(`<line x1="${centerX}" y1="${centerY}" x2="${x}" y2="${y}" stroke="${colors.accent}" stroke-width="0.5" opacity="${opacity}" />`);
  }
  
  return shapes.join('\n');
}

// ==========================================
// COLOR PALETTE SELECTION
// ==========================================

function getColorPalette(type: string = 'Uncategorized', seed: number) {
  const palette = TYPE_PALETTES[type] || TYPE_PALETTES.Uncategorized;
  
  // Add slight variation to colors based on seed (keeps it interesting but stable)
  const hueShift = Math.floor(seededRandom(seed, 999) * 20) - 10; // -10 to +10 degrees
  
  return {
    primary: palette.primary,
    secondary: palette.secondary,
    accent: palette.accent,
    background: THEME.colors.background
  };
}

// ==========================================
// MAIN GENERATOR
// ==========================================

/**
 * Generate SVG data URL for procedural thumbnail
 */
export function generateProceduralThumbnail(config: ThumbnailConfig): string {
  const {
    title,
    year = '',
    type = 'Uncategorized',
    variant = 'geometric',
    width = 1200,
    height = 675,
    showTitle = true,
    showMetadata = true
  } = config;
  
  // Generate deterministic seed from project metadata
  const seedString = `${title}-${year}-${type}`;
  const seed = hashString(seedString);
  
  // Select color palette
  const colors = getColorPalette(type, seed);
  
  // Default to film-strip variant (perfect for cinematography portfolio)
  let selectedVariant = variant || 'film-strip';
  
  // Generate pattern based on variant
  let pattern = '';
  switch (selectedVariant) {
    case 'geometric':
      pattern = generateGeometric(config, seed, colors);
      break;
    case 'minimal':
      pattern = generateMinimal(config, seed, colors);
      break;
    case 'film-strip':
      pattern = generateFilmStrip(config, seed, colors);
      break;
    case 'grid':
      pattern = generateGrid(config, seed, colors);
      break;
    case 'radial':
      pattern = generateRadial(config, seed, colors);
      break;
  }
  
  // Prepare title rendering if enabled
  let titleBlock = '';
  let metaBlock = '';
  if (showTitle) {
    const safeTitle = title
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
    const titleWords = safeTitle.split(' ');
    let titleLines: string[] = [];
    let currentLine = '';
    for (const word of titleWords) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      if (testLine.length > 20 && currentLine) {
        titleLines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) titleLines.push(currentLine);
    titleLines = titleLines.slice(0, 3);
    const fontSize = titleLines.length > 2 ? 56 : titleLines.length > 1 ? 72 : 96;
    const lineHeight = fontSize * 1.15;
    const startY = height / 2 - ((titleLines.length - 1) * lineHeight) / 2;
    titleBlock = `
  <!-- Title -->
  <text 
    x="50%" 
    y="${startY}" 
    text-anchor="middle" 
    font-family="${THEME.fonts.serif}, serif" 
    font-size="${fontSize}" 
    font-style="italic"
    font-weight="400"
    fill="white" 
    opacity="0.95"
  >
    ${titleLines.map((line, i) => 
      `<tspan x="50%" dy="${i === 0 ? 0 : lineHeight}">${line}</tspan>`
    ).join('\n    ')}
  </text>`;
  }
  
  if (showMetadata) {
    metaBlock = `
  <!-- Metadata (Year + Type) -->
  <g opacity="0.6">
    ${year ? `
    <text 
      x="60" 
      y="60" 
      font-family="${THEME.fonts.sans}, sans-serif" 
      font-size="20" 
      font-weight="700"
      letter-spacing="3"
      text-transform="uppercase"
      fill="white"
    >${year}</text>
    ` : ''}
    
    <text 
      x="${width - 60}" 
      y="${height - 60}" 
      text-anchor="end"
      font-family="${THEME.fonts.sans}, sans-serif" 
      font-size="16" 
      font-weight="700"
      letter-spacing="3"
      text-transform="uppercase"
      fill="white"
      opacity="0.5"
    >${type}</text>
  </g>`;
  }
  
  // Generate SVG
  const svg = `
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg-gradient-${seed}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${colors.primary};stop-opacity:1" />
      <stop offset="100%" style="stop-color:${colors.secondary};stop-opacity:1" />
    </linearGradient>
    
    <filter id="grain-${seed}">
      <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="4" />
      <feColorMatrix type="saturate" values="0"/>
      <feBlend in="SourceGraphic" mode="multiply" />
    </filter>
  </defs>
  
  <!-- Background -->
  <rect width="${width}" height="${height}" fill="url(#bg-gradient-${seed})" />
  
  <!-- Film grain overlay -->
  <rect width="${width}" height="${height}" filter="url(#grain-${seed})" opacity="0.05" />
  
  <!-- Pattern layer -->
  <g opacity="0.8">
    ${pattern}
  </g>
  ${titleBlock}
  ${metaBlock}
</svg>`.trim();
  
  // Convert to data URL
  const encoded = encodeURIComponent(svg)
    .replace(/'/g, '%27')
    .replace(/"/g, '%22');
  
  return `data:image/svg+xml,${encoded}`;
}

/**
 * Get available variant for a project type (for preview UI)
 */
export function getVariantsForType(type: string): ThumbnailVariant[] {
  return ['geometric', 'minimal', 'film-strip', 'grid', 'radial'];
}
