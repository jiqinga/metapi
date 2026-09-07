import { describe, expect, it } from 'vitest';
import {
  CODEX_CLI_INSTRUCTIONS_PREFIX,
  applyCodexCloak,
  applyCodexCloakHeaders,
  shouldCloakAsCodex,
} from './codexCloak.js';
import {
  getCloakOverridesFromExtraConfig,
  normalizeCloakOverrideInput,
} from './accountExtraConfig.js';

describe('codexCloak', () => {
  it('skips cloaking when disabled or when the client already is Codex CLI', () => {
    expect(shouldCloakAsCodex({ enabled: false, downstreamHeaders: {} })).toBe(false);
    expect(shouldCloakAsCodex({
      enabled: true,
      downstreamHeaders: { originator: 'codex_cli_rs', 'user-agent': 'codex_cli_rs/0.101.0' },
    })).toBe(false);
    expect(shouldCloakAsCodex({
      enabled: true,
      downstreamHeaders: { 'user-agent': 'cherry-studio/1.0.0' },
    })).toBe(true);
  });

  it('prefixes instructions once and keeps the caller instructions', () => {
    const once = applyCodexCloak({ body: { instructions: 'Only answer in JSON.', input: [] } });
    expect(once.instructions).toBe(`${CODEX_CLI_INSTRUCTIONS_PREFIX}\n\nOnly answer in JSON.`);

    const twice = applyCodexCloak({ body: once });
    expect(twice.instructions).toBe(once.instructions);
  });

  it('replaces the client identity headers but keeps a downstream session id', () => {
    const headers = applyCodexCloakHeaders({
      headers: { 'User-Agent': 'cherry-studio/1.0.0', accept: 'text/event-stream' },
      downstreamHeaders: { 'x-api-key': 'sk-downstream' },
    });

    expect(headers['User-Agent']).toBeUndefined();
    expect(headers['user-agent']).toMatch(/^codex_cli_rs\//);
    expect(headers.originator).toBe('codex_cli_rs');
    expect(headers.accept).toBe('text/event-stream');
    expect(headers.session_id).toMatch(/^[0-9a-f]{8}-/);

    const withSession = applyCodexCloakHeaders({
      headers: {},
      downstreamHeaders: { session_id: 'abc-123' },
    });
    expect(withSession.session_id).toBe('abc-123');
  });
});

describe('account cloak overrides', () => {
  it('maps tri-state input to boolean or inherit', () => {
    expect(normalizeCloakOverrideInput('on')).toBe(true);
    expect(normalizeCloakOverrideInput('off')).toBe(false);
    expect(normalizeCloakOverrideInput('inherit')).toBe(null);
    expect(normalizeCloakOverrideInput(null)).toBe(null);
    expect(normalizeCloakOverrideInput('yes')).toBe(undefined);
  });

  it('reads overrides from extraConfig, defaulting to inherit', () => {
    expect(getCloakOverridesFromExtraConfig('{"claudeCodeCloak":true}')).toEqual({
      claudeCode: true,
      codex: null,
    });
    expect(getCloakOverridesFromExtraConfig({ codexCloak: false })).toEqual({
      claudeCode: null,
      codex: false,
    });
    expect(getCloakOverridesFromExtraConfig(undefined)).toEqual({
      claudeCode: null,
      codex: null,
    });
  });
});
