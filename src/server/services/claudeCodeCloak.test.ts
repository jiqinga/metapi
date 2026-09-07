import { describe, expect, it } from 'vitest';
import {
  CLAUDE_CODE_SYSTEM_PROMPT,
  applyClaudeCodeCloak,
  buildClaudeCodeUserId,
  shouldCloakAsClaudeCode,
} from './claudeCodeCloak.js';

const claudeCodeHeaders = {
  'user-agent': 'claude-cli/2.1.63 (external, cli)',
  'anthropic-beta': 'claude-code-20250219',
  'anthropic-version': '2023-06-01',
  'x-app': 'cli',
};

describe('claudeCodeCloak', () => {
  it('skips cloaking when disabled or when the client already is Claude Code', () => {
    expect(shouldCloakAsClaudeCode({ enabled: false, downstreamHeaders: {} })).toBe(false);
    expect(shouldCloakAsClaudeCode({ enabled: true, downstreamHeaders: claudeCodeHeaders })).toBe(false);
    expect(shouldCloakAsClaudeCode({
      enabled: true,
      downstreamHeaders: { 'user-agent': 'cherry-studio/1.0.0' },
    })).toBe(true);
  });

  it('prepends the Claude Code system block and keeps the original prompt', () => {
    const cloaked = applyClaudeCodeCloak({
      body: { system: 'You are a helpful assistant.', messages: [] },
      downstreamHeaders: { 'x-api-key': 'sk-downstream' },
    });
    const system = cloaked.system as Record<string, unknown>[];

    expect(system[0]).toEqual({
      type: 'text',
      text: CLAUDE_CODE_SYSTEM_PROMPT,
      cache_control: { type: 'ephemeral' },
    });
    expect(system[1]).toEqual({ type: 'text', text: 'You are a helpful assistant.' });
    expect((cloaked.metadata as Record<string, unknown>).user_id)
      .toMatch(/^user_[0-9a-f]{64}_account__session_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('is idempotent and stable per downstream credential', () => {
    const once = applyClaudeCodeCloak({
      body: { messages: [] },
      downstreamHeaders: { 'x-api-key': 'sk-downstream' },
    });
    const twice = applyClaudeCodeCloak({
      body: once,
      downstreamHeaders: { 'x-api-key': 'sk-downstream' },
    });

    expect((twice.system as unknown[]).length).toBe(1);
    expect(twice.metadata).toEqual(once.metadata);
  });

  it('keeps a user_id that is already in Claude Code shape', () => {
    const userId = buildClaudeCodeUserId('existing-seed');
    const cloaked = applyClaudeCodeCloak({
      body: { metadata: { user_id: userId }, messages: [] },
      downstreamHeaders: { 'x-api-key': 'sk-other' },
    });

    expect((cloaked.metadata as Record<string, unknown>).user_id).toBe(userId);
  });
});
