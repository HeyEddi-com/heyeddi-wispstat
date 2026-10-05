/**
 * Branding & Naming Configuration
 * 
 * SINGLE SOURCE OF TRUTH for product naming.
 * When the final name is decided, update only this file.
 * 
 * Current status: Using neutral placeholder pending rename decision.
 */

export const BRANDING = {
  /**
   * Product name (user-facing)
   * Used in: dashboard UI, README, docs, error messages
   */
  PRODUCT_NAME: 'EdgeMetrics',
  
  /**
   * Package name (technical, lowercase, no spaces)
   * Used in: package.json, npm scripts, CLI commands
   */
  PACKAGE_NAME: 'edgemetrics',
  
  /**
   * Tracker script global variable name
   * Used in: tracker script, documentation examples
   * Example: window.edgemetrics('pageview')
   */
  TRACKER_GLOBAL: 'edgemetrics',
  
  /**
   * Tracker script filename (without extension)
   * Used in: build output, documentation snippets
   * Example: em.js
   */
  TRACKER_FILENAME: 'em',
  
  /**
   * API key prefixes
   */
  KEY_PREFIXES: {
    READ: 'emk',      // EdgeMetrics Key (read)
    SERVER: 'ems',    // EdgeMetrics Server (write)
  },
  
  /**
   * Cookie/storage prefixes (local auth only)
   */
  COOKIE_PREFIX: '__Host-em_',
  
  /**
   * Database/binding name stems
   */
  DB_NAMES: {
    CORE: 'edgemetrics-core',
    INGEST: 'edgemetrics-ingest',
  },
  
  /**
   * KV/R2 namespace names
   */
  NAMESPACE_NAMES: {
    SALTS: 'edgemetrics-salts',
    BACKUPS: 'edgemetrics-backups',
  },
} as const;

/**
 * Helper to get branded strings for common patterns
 */
export const getBranded = {
  workerName: () => BRANDING.PACKAGE_NAME,
  sessionCookie: () => `${BRANDING.COOKIE_PREFIX}session`,
  trackerScript: (consented = false) => 
    `${BRANDING.TRACKER_FILENAME}${consented ? '-consent' : ''}.js`,
  apiKeyFormat: (type: 'read' | 'server', siteId: string) =>
    `${type === 'read' ? BRANDING.KEY_PREFIXES.READ : BRANDING.KEY_PREFIXES.SERVER}_${siteId}_<secret>`,
} as const;
