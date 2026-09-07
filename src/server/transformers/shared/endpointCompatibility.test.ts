import { describe, expect, it } from 'vitest';

import {
  hasEndpointMismatchHint,
  inferRequiredEndpointFromProtocolError,
  inferSuggestedEndpointFromUpstreamError,
  isEndpointDowngradeError,
  promoteRequiredEndpointCandidateAfterProtocolError,
} from './endpointCompatibility.js';

describe('inferRequiredEndpointFromProtocolError', () => {
  it('recognizes messages-required protocol errors', () => {
    expect(inferRequiredEndpointFromProtocolError('messages is required')).toBe('messages');
    expect(inferRequiredEndpointFromProtocolError('{"error":{"message":"messages is required"}}')).toBe('messages');
  });

  it('recognizes responses-input-required protocol errors', () => {
    expect(inferRequiredEndpointFromProtocolError('input is required')).toBe('responses');
    expect(inferRequiredEndpointFromProtocolError('{"error":{"message":"input is required"}}')).toBe('responses');
  });

  it('ignores unrelated protocol errors', () => {
    expect(inferRequiredEndpointFromProtocolError('unsupported endpoint')).toBeNull();
    expect(inferRequiredEndpointFromProtocolError('')).toBeNull();
    expect(inferRequiredEndpointFromProtocolError(null)).toBeNull();
  });
});

describe('inferSuggestedEndpointFromUpstreamError', () => {
  it('prefers required endpoints over generic path mentions', () => {
    expect(inferSuggestedEndpointFromUpstreamError('input is required for /v1/chat/completions')).toBe('responses');
  });

  it('infers suggested endpoints from explicit upstream endpoint mentions', () => {
    expect(inferSuggestedEndpointFromUpstreamError('Unsupported endpoint /v1/messages')).toBe('messages');
    expect(inferSuggestedEndpointFromUpstreamError('POST /v1/responses is not supported')).toBe('responses');
  });

  it('prefers the use-X-instead suggestion over the failing endpoint mention', () => {
    expect(inferSuggestedEndpointFromUpstreamError(
      'model "glm-5.3-flash" is not supported on /v1/responses; use /v1/chat/completions instead (request id: 20260904031220929228727c955d568jy2wnuzo)',
    )).toBe('chat');
    expect(inferSuggestedEndpointFromUpstreamError('{"error":{"message":"model \\"gpt-x\\" is not supported on /v1/messages; use /v1/responses instead","type":"new_api_error"}}')).toBe('responses');
  });
});

describe('isEndpointDowngradeError', () => {
  it('downgrades model-not-supported-on-endpoint errors even without a recognized error type', () => {
    expect(isEndpointDowngradeError(
      400,
      'model "glm-5.3-flash" is not supported on /v1/responses; use /v1/chat/completions instead (request id: 20260904031220929228727c955d568jy2wnuzo)',
    )).toBe(true);
    expect(isEndpointDowngradeError(
      400,
      '{"error":{"message":"model \\"gpt-x\\" is not supported on /v1/responses; use /v1/chat/completions instead","type":"new_api_error"}}',
    )).toBe(true);
  });

  it('downgrades not-supported-on-endpoint errors without an instead suggestion', () => {
    expect(isEndpointDowngradeError(400, 'model "gpt-x" is not supported on the /v1/responses endpoint')).toBe(true);
  });

  it('still ignores plain client errors without endpoint mismatch hints', () => {
    expect(isEndpointDowngradeError(400, 'invalid api key')).toBe(false);
    expect(isEndpointDowngradeError(400, 'messages array must not be empty')).toBe(false);
  });
});

describe('hasEndpointMismatchHint', () => {
  it('recognizes endpoint mismatch vocabulary from raw or parsed errors', () => {
    expect(hasEndpointMismatchHint('Unsupported endpoint /v1/messages')).toBe(true);
    expect(hasEndpointMismatchHint('{"error":{"message":"Unknown endpoint /v1/responses"}}')).toBe(true);
  });

  it('ignores generic upstream errors without endpoint hints', () => {
    expect(hasEndpointMismatchHint('{"error":{"type":"upstream_error","message":"Upstream request failed"}}')).toBe(false);
  });
});

describe('promoteRequiredEndpointCandidateAfterProtocolError', () => {
  it('promotes the required endpoint to the next slot when it appears later in the order', () => {
    const candidates: Array<'chat' | 'messages' | 'responses'> = ['chat', 'messages', 'responses'];

    promoteRequiredEndpointCandidateAfterProtocolError(candidates, {
      currentEndpoint: 'chat',
      upstreamErrorText: 'input is required',
    });

    expect(candidates).toEqual(['chat', 'responses', 'messages']);
  });

  it('does nothing when the required endpoint is already next or missing', () => {
    const alreadyNext: Array<'chat' | 'messages' | 'responses'> = ['chat', 'messages', 'responses'];
    promoteRequiredEndpointCandidateAfterProtocolError(alreadyNext, {
      currentEndpoint: 'chat',
      upstreamErrorText: 'messages is required',
    });
    expect(alreadyNext).toEqual(['chat', 'messages', 'responses']);

    const missingTarget: Array<'chat' | 'messages' | 'responses'> = ['chat', 'messages'];
    promoteRequiredEndpointCandidateAfterProtocolError(missingTarget, {
      currentEndpoint: 'chat',
      upstreamErrorText: 'input is required',
    });
    expect(missingTarget).toEqual(['chat', 'messages']);
  });
});
