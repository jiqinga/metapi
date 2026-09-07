import { createHash } from 'node:crypto';
import { claudeCodeCliProfile, extractClaudeCodeSessionId } from '../proxy-core/cliProfiles/claudeCodeProfile.js';
import { getInputHeader, uuidFromSeed } from '../proxy-core/providers/headerUtils.js';

export const CLAUDE_CODE_SYSTEM_PROMPT = "You are Claude Code, Anthropic's official CLI for Claude.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function isClaudeCodeDownstreamRequest(input: {
  headers?: Record<string, unknown>;
  body?: unknown;
}): boolean {
  return !!claudeCodeCliProfile.detect({
    downstreamPath: '/v1/messages',
    headers: input.headers,
    body: input.body,
  });
}

export function shouldCloakAsClaudeCode(input: {
  enabled: boolean;
  downstreamHeaders?: Record<string, unknown>;
  downstreamBody?: unknown;
}): boolean {
  if (!input.enabled) return false;
  return !isClaudeCodeDownstreamRequest({
    headers: input.downstreamHeaders,
    body: input.downstreamBody,
  });
}

function normalizeSystemBlocks(system: unknown): Record<string, unknown>[] {
  if (typeof system === 'string') {
    return system.trim() ? [{ type: 'text', text: system }] : [];
  }
  if (!Array.isArray(system)) return [];
  return system.filter(isRecord);
}

function isClaudeCodeSystemBlock(block: Record<string, unknown>): boolean {
  return typeof block.text === 'string' && block.text.trim() === CLAUDE_CODE_SYSTEM_PROMPT;
}

function withClaudeCodeSystemPrompt(system: unknown): Record<string, unknown>[] {
  const blocks = normalizeSystemBlocks(system);
  if (blocks[0] && isClaudeCodeSystemBlock(blocks[0])) return blocks;

  return [
    {
      type: 'text',
      text: CLAUDE_CODE_SYSTEM_PROMPT,
      cache_control: { type: 'ephemeral' },
    },
    ...blocks.filter((block) => !isClaudeCodeSystemBlock(block)),
  ];
}

// ponytail: one synthetic session per downstream credential; thread a per-conversation
// key in here if an upstream ever rejects reused session ids.
export function resolveDownstreamCredentialSeed(downstreamHeaders?: Record<string, unknown>): string {
  const credential = (
    getInputHeader(downstreamHeaders, 'x-api-key')
    || getInputHeader(downstreamHeaders, 'authorization')
    || 'anonymous'
  );
  return createHash('sha256').update(`metapi-claude-cloak:${credential}`).digest('hex');
}

export function buildClaudeCodeUserId(seed: string): string {
  const account = createHash('sha256').update(`metapi-claude-cloak-account:${seed}`).digest('hex');
  return `user_${account}_account__session_${uuidFromSeed(`metapi-claude-cloak-session:${seed}`)}`;
}

function withClaudeCodeMetadata(metadata: unknown, seed: string): Record<string, unknown> {
  const base = isRecord(metadata) ? { ...metadata } : {};
  const currentUserId = typeof base.user_id === 'string' ? base.user_id : '';
  if (currentUserId && extractClaudeCodeSessionId(currentUserId)) return base;

  base.user_id = buildClaudeCodeUserId(seed);
  return base;
}

/**
 * Rewrites an Anthropic messages body so the upstream sees the Claude Code CLI shape:
 * the official CLI system prompt as the first cached system block, plus a
 * Claude Code style `metadata.user_id`. Headers are already forged by
 * `buildClaudeRuntimeHeaders`.
 */
export function applyClaudeCodeCloak(input: {
  body: Record<string, unknown>;
  downstreamHeaders?: Record<string, unknown>;
}): Record<string, unknown> {
  const seed = resolveDownstreamCredentialSeed(input.downstreamHeaders);
  return {
    ...input.body,
    system: withClaudeCodeSystemPrompt(input.body.system),
    metadata: withClaudeCodeMetadata(input.body.metadata, seed),
  };
}
