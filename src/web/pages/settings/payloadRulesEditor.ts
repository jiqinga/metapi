import type { PayloadRuleAction } from './payloadRulesVisual.js';

export type PayloadRulesEditorSectionKey = PayloadRuleAction;
export type PayloadRulesEditorDrafts = Record<PayloadRulesEditorSectionKey, string>;

export const PAYLOAD_RULES_EDITOR_SECTIONS = [
  {
    key: 'default',
    title: 'default',
    description: '字段缺失时才注入，适合补默认参数。',
    placeholder: `[
  {
    "models": [{ "name": "gpt-*", "protocol": "codex" }],
    "params": {
      "reasoning.effort": "high"
    }
  }
]`,
  },
  {
    key: 'default-raw',
    title: 'default-raw',
    description: '字段缺失时注入原始 JSON，适合 schema、复杂对象等值。',
    placeholder: `[
  {
    "models": [{ "name": "gpt-*", "protocol": "codex" }],
    "params": {
      "response_format": "{\"type\":\"json_schema\"}"
    }
  }
]`,
  },
  {
    key: 'override',
    title: 'override',
    description: '无论原请求是否已有该字段，都强制覆盖。',
    placeholder: `[
  {
    "models": [{ "name": "gpt-*", "protocol": "codex" }],
    "params": {
      "text.verbosity": "low"
    }
  }
]`,
  },
  {
    key: 'override-raw',
    title: 'override-raw',
    description: '无论原请求是否已有该字段，都强制覆盖为原始 JSON。',
    placeholder: `[
  {
    "models": [{ "name": "gemini-*", "protocol": "gemini" }],
    "params": {
      "generationConfig.responseJsonSchema": "{\"type\":\"object\"}"
    }
  }
]`,
  },
  {
    key: 'filter',
    title: 'filter',
    description: '删除匹配请求中的字段。',
    placeholder: `[
  {
    "models": [{ "name": "gpt-*", "protocol": "codex" }],
    "params": ["safety_identifier"]
  }
]`,
  },
] as const satisfies ReadonlyArray<{
  key: PayloadRulesEditorSectionKey;
  title: string;
  description: string;
  placeholder: string;
}>;

export const PAYLOAD_RULE_ACTION_OPTIONS: Array<{ value: PayloadRuleAction; label: string }> = [
  { value: 'default', label: '默认注入' },
  { value: 'default-raw', label: '默认注入 JSON' },
  { value: 'override', label: '强制覆盖' },
  { value: 'override-raw', label: '强制覆盖 JSON' },
  { value: 'filter', label: '删除字段' },
];

export const PAYLOAD_RULE_VALUE_MODE_OPTIONS: Array<{ value: 'text' | 'json'; label: string }> = [
  { value: 'text', label: '文本' },
  { value: 'json', label: 'JSON' },
];

export function createEmptyPayloadRuleDrafts(): PayloadRulesEditorDrafts {
  return {
    default: '',
    'default-raw': '',
    override: '',
    'override-raw': '',
    filter: '',
  };
}

export function formatPayloadRuleSectionForEditor(value: unknown): string {
  if (value == null) return '';
  if (Array.isArray(value) && value.length <= 0) return '';
  return JSON.stringify(value, null, 2);
}

export function normalizePayloadRulesForEditor(value: unknown): PayloadRulesEditorDrafts {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return createEmptyPayloadRuleDrafts();
  }

  const record = value as Record<string, unknown>;
  return {
    default: formatPayloadRuleSectionForEditor(record.default),
    'default-raw': formatPayloadRuleSectionForEditor(record.defaultRaw ?? record['default-raw']),
    override: formatPayloadRuleSectionForEditor(record.override),
    'override-raw': formatPayloadRuleSectionForEditor(record.overrideRaw ?? record['override-raw']),
    filter: formatPayloadRuleSectionForEditor(record.filter),
  };
}

export function parsePayloadRulesFromDrafts(
  drafts: PayloadRulesEditorDrafts,
): { success: true; value: Record<string, unknown> } | { success: false; message: string } {
  const next: Record<string, unknown> = {};

  for (const section of PAYLOAD_RULES_EDITOR_SECTIONS) {
    const raw = drafts[section.key].trim();
    if (!raw) continue;
    try {
      next[section.key] = JSON.parse(raw);
    } catch (error: any) {
      return {
        success: false,
        message: `Payload 规则 ${section.title} 不是合法 JSON：${error?.message || '解析失败'}`,
      };
    }
  }

  return {
    success: true,
    value: next,
  };
}
