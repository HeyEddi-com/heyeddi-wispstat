/**
 * Central configuration module
 * THE ONLY config module - all defaults and env parsing in one place
 */

export interface Config {
  // Instance settings
  publicBaseUrl?: string;
  defaultTz: string;
  authProviders: ('local' | 'firebase')[];
  
  // Firebase Auth (if enabled)
  firebaseProjectId?: string;
  firebaseWebConfig?: Record<string, unknown>;
  
  // Security
  setupToken: string;
  sessionSecret?: string;
  tokenKey?: string;
  pbkdf2Iterations: number;
  
  // Integrations
  slackWebhookUrl?: string;
  cfApiToken?: string;
  cfAccountId?: string;
  
  // Limits & caps
  limits: {
    beaconMaxBytes: number;
    pathMaxLength: number;
    utmMaxLength: number;
    eventNameMaxLength: number;
    eventNamesPerSiteDay: number;
    rateLimit: {
      perSitePeriod: 60;
      perSiteLimit: 1000;
      perIpPeriod: 60;
      perIpLimit: 100;
    };
  };
  
  // Retention
  retention: {
    rawPartitionDays: number;
    statsHourlyDays: number;
    r2DailyCount: number;
    r2MonthlyCount: number;
  };
  
  // Rollup schedules (derived from cron)
  schedules: {
    hourly: string;
    nightly: string;
    weekly: string;
  };
}

/**
 * Parse environment and return validated config
 */
export function getConfig(env: Record<string, string | undefined>): Config {
  const authProvidersStr = env.AUTH_PROVIDERS || 'local';
  const authProviders = authProvidersStr.split(',').map(p => p.trim()) as ('local' | 'firebase')[];
  
  if (authProviders.length === 0 || !authProviders.every(p => p === 'local' || p === 'firebase')) {
    throw new Error('AUTH_PROVIDERS must be "local", "firebase", or "local,firebase"');
  }
  
  if (!env.SETUP_TOKEN || env.SETUP_TOKEN.length < 32) {
    throw new Error('SETUP_TOKEN must be set and at least 32 characters');
  }
  
  if (authProviders.includes('firebase') && !env.FIREBASE_PROJECT_ID) {
    throw new Error('FIREBASE_PROJECT_ID required when AUTH_PROVIDERS includes firebase');
  }
  
  return {
    publicBaseUrl: env.PUBLIC_BASE_URL,
    defaultTz: env.DEFAULT_TZ || 'UTC',
    authProviders,
    
    firebaseProjectId: env.FIREBASE_PROJECT_ID,
    firebaseWebConfig: env.FIREBASE_WEB_CONFIG ? JSON.parse(env.FIREBASE_WEB_CONFIG) : undefined,
    
    setupToken: env.SETUP_TOKEN,
    sessionSecret: env.SESSION_SECRET,
    tokenKey: env.TOKEN_KEY,
    pbkdf2Iterations: 100_000,
    
    slackWebhookUrl: env.SLACK_WEBHOOK_URL,
    cfApiToken: env.CF_API_TOKEN,
    cfAccountId: env.CF_ACCOUNT_ID,
    
    limits: {
      beaconMaxBytes: 2048,
      pathMaxLength: 256,
      utmMaxLength: 100,
      eventNameMaxLength: 64,
      eventNamesPerSiteDay: 100,
      rateLimit: {
        perSitePeriod: 60,
        perSiteLimit: 1000,
        perIpPeriod: 60,
        perIpLimit: 100,
      },
    },
    
    retention: {
      rawPartitionDays: 3,
      statsHourlyDays: 90,
      r2DailyCount: 30,
      r2MonthlyCount: 12,
    },
    
    schedules: {
      hourly: '5 * * * *',
      nightly: '0 9 * * *',
      weekly: '0 15 * * MON',
    },
  };
}

/**
 * Constants that don't vary per environment
 */
export const CONSTANTS = {
  SITE_ID_PREFIX: 's_',
  SITE_ID_LENGTH: 16,
  VISITOR_HASH_BYTES: 16,
  SALT_BYTES: 32,
  SESSION_TOKEN_BYTES: 32,
  VISIT_TOKEN_MAX_HOURS: 2,
  
  // Channels
  CHANNEL_DIRECT: 'Direct',
  CHANNEL_ORGANIC: 'Organic Search',
  CHANNEL_PAID: 'Paid',
  CHANNEL_EMAIL: 'Email',
  CHANNEL_OWN_SITES: 'Own sites',
  CHANNEL_REFERRAL: 'Referral',
  CHANNEL_UNKNOWN: '(unknown)',
  
  // Special dimension values
  DIM_TOTAL: 'total',
  DIM_OTHER: '(other)',
} as const;
