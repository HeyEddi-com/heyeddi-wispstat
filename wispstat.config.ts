/**
 * HeyEddi Wispstat - Central configuration module
 * THE ONLY config module - all defaults and env parsing in one place
 */

export interface Config {
  publicBaseUrl?: string;
  defaultTz: string;
  authProviders: string[];

  setupToken: string;
  sessionSecret?: string;
  tokenKey?: string;
  pbkdf2Iterations: number;

  cfApiToken?: string;
  cfAccountId?: string;

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

  retention: {
    rawPartitionDays: number;
    statsHourlyDays: number;
    r2DailyCount: number;
    r2MonthlyCount: number;
  };

  schedules: {
    hourly: string;
    nightly: string;
  };
}

/**
 * Parse environment and return validated config
 */
export function getConfig(env: any): Config {
  if (!env.SETUP_TOKEN || env.SETUP_TOKEN.length < 32) {
    throw new Error('SETUP_TOKEN must be set and at least 32 characters');
  }

  return {
    publicBaseUrl: env.PUBLIC_BASE_URL,
    defaultTz: env.DEFAULT_TZ || 'UTC',
    authProviders: [
      'local',
      ...(env.FIREBASE_PROJECT_ID ? ['firebase'] : []),
      ...(env.ACCESS_TEAM_DOMAIN && env.ACCESS_AUD ? ['access'] : []),
    ],

    setupToken: env.SETUP_TOKEN,
    sessionSecret: env.SESSION_SECRET,
    tokenKey: env.TOKEN_KEY,
    pbkdf2Iterations: 100_000,

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
    },
  };
}

export const CONSTANTS = {
  SITE_ID_PREFIX: 's_',
  SITE_ID_LENGTH: 16,
  VISITOR_HASH_BYTES: 16,
  SALT_BYTES: 32,
  SESSION_TOKEN_BYTES: 32,
  VISIT_TOKEN_MAX_HOURS: 2,
  SESSION_GAP_SECONDS: 1800,

  CHANNEL_DIRECT: 'Direct',
  CHANNEL_ORGANIC: 'Organic Search',
  CHANNEL_PAID: 'Paid',
  CHANNEL_EMAIL: 'Email',
  CHANNEL_OWN_SITES: 'Own sites',
  CHANNEL_REFERRAL: 'Referral',
  CHANNEL_UNKNOWN: '(unknown)',

  DIM_TOTAL: 'total',
  DIM_OTHER: '(other)',
} as const;
