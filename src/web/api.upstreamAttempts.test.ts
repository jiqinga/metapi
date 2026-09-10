import { describe, expect, it } from 'vitest';
import { formatUpstreamAttemptsSection } from './api.js';

describe('formatUpstreamAttemptsSection', () => {
  it('returns an empty string when no attempts are present', () => {
    expect(formatUpstreamAttemptsSection({ error: { message: 'boom' } })).toBe('');
    expect(formatUpstreamAttemptsSection({ upstreamAttempts: [] })).toBe('');
    expect(formatUpstreamAttemptsSection(null)).toBe('');
  });

  it('renders one line per attempt with prefix stripped', () => {
    const section = formatUpstreamAttemptsSection({
      upstreamAttempts: [
        { endpoint: 'chat', path: '/v1/chat/completions', status: 500, message: '[upstream:/v1/chat/completions] no active accounts' },
        { endpoint: 'responses', path: '/v1/responses', status: 429, message: '[upstream:/v1/responses] rate limited' },
      ],
    });

    expect(section).toContain('上游尝试链路（共 2 次）');
    expect(section).toContain('· chat → /v1/chat/completions → 500: no active accounts');
    expect(section).toContain('· responses → /v1/responses → 429: rate limited');
    expect(section).not.toContain('[upstream:');
  });

  it('tolerates malformed entries and missing fields', () => {
    const section = formatUpstreamAttemptsSection({
      upstreamAttempts: [
        null,
        'not-an-object',
        { endpoint: 'chat', status: '500' },
      ],
    });

    expect(section).toContain('上游尝试链路（共 1 次）');
    expect(section).toContain('· chat → ?');
  });
});
