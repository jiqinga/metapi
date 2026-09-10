import { describe, expect, it } from 'vitest';
import {
  attachUpstreamAttemptTrailForTester,
  type SurfaceUpstreamAttemptTrailEntry,
} from './upstreamAttemptTrail.js';

const attempts: SurfaceUpstreamAttemptTrailEntry[] = [
  { endpoint: 'chat', path: '/v1/chat/completions', status: 500, message: '[upstream:/v1/chat/completions] no active accounts' },
  { endpoint: 'messages', path: '/v1/messages', status: 500, message: '[upstream:/v1/messages] no active accounts' },
  { endpoint: 'responses', path: '/v1/responses', status: 500, message: '[upstream:/v1/responses] no active accounts' },
];

describe('attachUpstreamAttemptTrailForTester', () => {
  it('attaches the attempt chain for tester requests', () => {
    const payload = { error: { message: '[upstream:/v1/responses] no active accounts', type: 'server_error' } };
    const wrapped = attachUpstreamAttemptTrailForTester(payload, {
      isTesterRequest: true,
      attempts,
    }) as Record<string, unknown>;

    expect(wrapped.error).toEqual(payload.error);
    expect(wrapped.upstreamAttempts).toHaveLength(3);
    expect(wrapped.upstreamAttempts![0]).toMatchObject({ endpoint: 'chat', status: 500 });
  });

  it('returns the payload untouched for non-tester requests', () => {
    const payload = { error: { message: 'boom', type: 'server_error' } };
    expect(attachUpstreamAttemptTrailForTester(payload, {
      isTesterRequest: false,
      attempts,
    })).toEqual(payload);
  });

  it('returns the payload untouched when no attempts were recorded', () => {
    const payload = { error: { message: 'boom', type: 'server_error' } };
    expect(attachUpstreamAttemptTrailForTester(payload, {
      isTesterRequest: true,
      attempts: [],
    })).toEqual(payload);
  });

  it('passes through non-object payloads', () => {
    expect(attachUpstreamAttemptTrailForTester('plain error', {
      isTesterRequest: true,
      attempts,
    })).toBe('plain error');
  });

  it('caps the trail to 12 entries and truncates long messages', () => {
    const longMessage = `[upstream:/v1/chat/completions] ${'x'.repeat(500)}`;
    const many: SurfaceUpstreamAttemptTrailEntry[] = Array.from({ length: 20 }, () => ({
      endpoint: 'chat',
      path: '/v1/chat/completions',
      status: 500,
      message: longMessage,
    }));

    const wrapped = attachUpstreamAttemptTrailForTester({ error: {} }, {
      isTesterRequest: true,
      attempts: many,
    }) as { upstreamAttempts: Array<{ message: string }> };

    expect(wrapped.upstreamAttempts).toHaveLength(12);
    expect(wrapped.upstreamAttempts[0].message.length).toBeLessThanOrEqual(240);
  });
});
