/**
 * Core type definitions
 */

export interface Env {
  // Bindings
  CORE: D1Database;
  INGEST: D1Database;
  SALTS: KVNamespace;
  BACKUPS?: R2Bucket;
  ASSETS?: Fetcher;
  
  // Secrets
  SETUP_TOKEN: string;
  SESSION_SECRET?: string;
  TOKEN_KEY?: string;
  
  // Optional
  PUBLIC_BASE_URL?: string;
  DEFAULT_TZ?: string;
  CF_API_TOKEN?: string;
  CF_ACCOUNT_ID?: string;
  D1_CORE_DATABASE_ID?: string;
  SLACK_WEBHOOK_URL?: string;
  FIREBASE_PROJECT_ID?: string;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
}

export interface Site {
  sid: number;
  site_id: string;
  slug: string | null;
  name: string;
  domains: string; // JSON string, parsed to string[] when needed
  tz: string;
  currency: string;
  honor_dnt: boolean;
  ingest_paused: boolean;
  digest_enabled: boolean;
  sessions_enabled: boolean;
  upgrade_direct: boolean;
  consent_mode: boolean;
  reporting_currency?: string;
  created_at: number;
}

export interface Goal {
  goal_id: number;
  sid: number;
  name: string;
  kind: 'event' | 'path';
  match_type: 'exact' | 'prefix';
  pattern: string;
  active: boolean;
  created_at: number;
}

export interface User {
  user_id: string;
  provider: string;
  email: string | null;
  pw_hash: string | null;
  role: 'owner' | 'viewer';
  created_at: number;
}

export interface BeaconPayload {
  s: string;        // site_id
  k: 'pv' | 'ev';   // kind
  n?: string;       // event name
  p: string;        // path
  r?: string;       // referrer
  l?: string;       // language
  v?: number;       // value
  us?: string;      // utm_source
  um?: string;      // utm_medium
  uc?: string;      // utm_campaign
  ut?: string;      // utm_term
  ux?: string;      // utm_content
  rf?: string;      // ref/via fallback
  props?: Record<string, unknown>; // v1.3 capped props
  cid?: string;     // v1.4 consented first-party id (hex)
}

export interface VisitorAttrs {
  vh: Uint8Array;
  channel: string;
  source: string | null;
  medium: string | null;
  campaign: string | null;
  content: string | null;
  term: string | null;
  ref_host: string | null;
  entry_path: string;
  country: string;
  lang: string;
  device: string;
  browser: string;
  os: string;
}

export interface AuthContext {
  userId: string;
  authTime: number;
  role: 'owner' | 'viewer';
}

export interface ApiKey {
  key_id: string;
  sid: number;
  kind: 'read' | 'server';
  label: string | null;
  key_hash: Uint8Array;
  scopes: string[];
  allowed_origins: string[];
  created_at: number;
  last_used_day: string | null;
  revoked_at: number | null;
}
