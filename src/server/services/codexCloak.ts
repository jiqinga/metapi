import { CODEX_DEFAULT_USER_AGENT, getInputHeader, uuidFromSeed } from '../proxy-core/providers/headerUtils.js';
import { isCodexOfficialClientHeaders } from '../shared/codexClientFamily.js';
import { resolveDownstreamCredentialSeed } from './claudeCodeCloak.js';

/**
 * Opening paragraph of the Codex CLI instructions (codex-rs/core/gpt_5_codex_prompt.md).
 * Only the marker paragraph is injected — the caller's own instructions are kept so the
 * request still does what the client asked for.
 */
export const CODEX_CLI_INSTRUCTIONS_PREFIX = "You are Codex, based on GPT-5. You are running as a coding agent in the Codex CLI on a user's computer.";

const CODEX_CLI_ORIGINATOR = 'codex_cli_rs';
const CODEX_IDENTITY_HEADER_KEYS = new Set([
  'originator',
  'user-agent',
  'session_id',
  'session-id',
]);

export function shouldCloakAsCodex(input: {
  enabled: boolean;
  downstreamHeaders?: Record<string, unknown>;
}): boolean {
  if (!input.enabled) return false;
  return !isCodexOfficialClientHeaders(input.downstreamHeaders);
}

export function applyCodexCloak(input: {
  body: Record<string, unknown>;
}): Record<string, unknown> {
  const current = typeof input.body.instructions === 'string' ? input.body.instructions.trim() : '';
  if (current.startsWith(CODEX_CLI_INSTRUCTIONS_PREFIX)) return input.body;

  return {
    ...input.body,
    instructions: current
      ? `${CODEX_CLI_INSTRUCTIONS_PREFIX}\n\n${current}`
      : CODEX_CLI_INSTRUCTIONS_PREFIX,
  };
}

/**
 * Replaces the downstream client identity with the Codex CLI one. A downstream
 * `session_id` is kept when present so multi-turn conversations stay on one session.
 */
export function applyCodexCloakHeaders(input: {
  headers: Record<string, string>;
  downstreamHeaders?: Record<string, unknown>;
}): Record<string, string> {
  const next: Record<string, string> = {};
  for (const [key, value] of Object.entries(input.headers)) {
    if (CODEX_IDENTITY_HEADER_KEYS.has(key.toLowerCase())) continue;
    next[key] = value;
  }

  const seed = resolveDownstreamCredentialSeed(input.downstreamHeaders);
  next.originator = CODEX_CLI_ORIGINATOR;
  next['user-agent'] = CODEX_DEFAULT_USER_AGENT;
  next.session_id = (
    getInputHeader(input.downstreamHeaders, 'session_id')
    || getInputHeader(input.downstreamHeaders, 'session-id')
    || uuidFromSeed(`metapi-codex-cloak-session:${seed}`)
  );
  return next;
}
