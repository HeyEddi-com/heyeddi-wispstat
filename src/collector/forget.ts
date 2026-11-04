/**
 * POST /c/forget — erase a consented visitor by cid (v1.4).
 */

import type { Env } from '../lib/types';
import { getConfig } from '../../wispstat.config';
import { isValidSiteId, errorResponse } from '../lib/utils';
import { hashCid, isValidCid } from '../lib/consent';
import { corsHeaders, getSiteCached } from './index';

export async function handleForget(request: Request, env: Env): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  if (request.method !== 'POST') {
    return errorResponse('method_not_allowed', 'POST required', 405);
  }

  let body: { s?: string; cid?: string };
  try {
    body = await request.json() as { s?: string; cid?: string };
  } catch {
    return errorResponse('invalid_json', 'Invalid JSON', 400);
  }

  if (!body.s || !isValidSiteId(body.s) || !isValidCid(body.cid)) {
    return errorResponse('invalid_request', 'site_id and cid required', 400);
  }

  const site = await getSiteCached(env, body.s);
  if (!site || !site.consent_mode) {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }

  const config = getConfig(env);
  const pepper = config.sessionSecret || config.setupToken;
  const cidHash = await hashCid(pepper, site.sid, body.cid!);
  const hex = Array.from(cidHash).map((b) => b.toString(16).padStart(2, '0')).join('');

  await env.CORE.prepare(
    `DELETE FROM consented_visitors WHERE sid = ? AND cid_hash = x'${hex}'`
  ).bind(site.sid).run();

  return Response.json({ forgotten: true }, { headers: corsHeaders(request) });
}
