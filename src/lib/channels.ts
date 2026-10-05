/**
 * Channel grouping logic
 */

import channelsJson from '../../channels.json';
import { CONSTANTS } from '../../wispstat.config';
import type { BeaconPayload } from './types';

interface ChannelMap {
  version: number;
  channels: Record<string, {
    name: string;
    priority?: number;
    medium_patterns?: string[];
    source_aliases?: string[];
    hosts?: string[];
  }>;
  fallback: {
    direct: string;
    own_sites: string;
    referral: string;
    unknown: string;
  };
}

const channelMap = channelsJson as ChannelMap;

export interface Attribution {
  channel: string;
  source: string | null;
  medium: string | null;
  campaign: string | null;
  content: string | null;
  term: string | null;
  ref_host: string | null;
}

// Type for parsed site domains
export interface ParsedSite {
  sid: number;
  site_id: string;
  slug: string | null;
  name: string;
  domains: string[];
  tz: string;
  currency: string;
  honor_dnt: boolean;
  ingest_paused: boolean;
  digest_enabled: boolean;
  sessions_enabled: boolean;
  consent_mode: boolean;
  created_at: number;
}

/**
 * Determine channel from UTM and referrer
 */
export function computeChannel(
  payload: BeaconPayload,
  referrer: string | null,
  ownDomains: string[],
  allSites: ParsedSite[]
): Attribution {
  const utm_source = payload.us || payload.rf || null;
  const utm_medium = payload.um || null;
  const utm_campaign = payload.uc || null;
  const utm_content = payload.ux || null;
  const utm_term = payload.ut || null;
  
  let source: string | null = utm_source;
  let ref_host: string | null = null;
  
  // 1. Check utm_medium patterns (priority)
  if (utm_medium) {
    for (const config of Object.values(channelMap.channels)) {
      if (config.priority && config.medium_patterns) {
        const normalized = utm_medium.toLowerCase();
        if (config.medium_patterns.some((p: string) => normalized.includes(p))) {
          return { channel: config.name, source, medium: utm_medium, campaign: utm_campaign, content: utm_content, term: utm_term, ref_host };
        }
      }
    }
  }
  
  // 2. Check utm_source aliases
  if (utm_source) {
    const normalized = utm_source.toLowerCase();
    for (const config of Object.values(channelMap.channels)) {
      if (config.source_aliases && config.source_aliases.some((alias: string) => normalized.includes(alias))) {
        return { channel: config.name, source, medium: utm_medium, campaign: utm_campaign, content: utm_content, term: utm_term, ref_host };
      }
    }
  }
  
  // 3. Check referrer
  if (referrer) {
    try {
      const refUrl = new URL(referrer);
      ref_host = refUrl.hostname.replace(/^www\./, '');
      
      // Ignore self-referrals
      if (ownDomains.some(d => ref_host === d || ref_host === d.replace(/^www\./, ''))) {
        ref_host = null;
        return { channel: CONSTANTS.CHANNEL_DIRECT, source, medium: utm_medium, campaign: utm_campaign, content: utm_content, term: utm_term, ref_host };
      }
      
      // Check if referrer is another owned site
      const isOwnSite = allSites.some(site => {
        return site.domains.some(d => 
          ref_host === d || ref_host === d.replace(/^www\./, '')
        );
      });
      
      if (isOwnSite) {
        return { 
          channel: CONSTANTS.CHANNEL_OWN_SITES, 
          source: ref_host, 
          medium: utm_medium, 
          campaign: utm_campaign, 
          content: utm_content, 
          term: utm_term, 
          ref_host 
        };
      }
      
      // Check channel map by host
      for (const config of Object.values(channelMap.channels)) {
        if (config.hosts && config.hosts.some(h => ref_host?.includes(h))) {
          return { 
            channel: config.name, 
            source: source || ref_host, 
            medium: utm_medium, 
            campaign: utm_campaign, 
            content: utm_content, 
            term: utm_term, 
            ref_host 
          };
        }
      }
      
      // Fallback: Referral
      return { 
        channel: CONSTANTS.CHANNEL_REFERRAL, 
        source: source || ref_host, 
        medium: utm_medium, 
        campaign: utm_campaign, 
        content: utm_content, 
        term: utm_term, 
        ref_host 
      };
      
    } catch {
      // Invalid URL, treat as direct
    }
  }
  
  // 4. Direct
  return { 
    channel: CONSTANTS.CHANNEL_DIRECT, 
    source, 
    medium: utm_medium, 
    campaign: utm_campaign, 
    content: utm_content, 
    term: utm_term, 
    ref_host 
  };
}
