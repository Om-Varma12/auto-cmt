// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';

vi.mock('../background/pdf-extractor', () => ({
  extractTextFromPdfBase64: vi.fn(),
}));
import {
  parseModelJson,
  buildSystemPrompt,
  buildUserPrompt,
  TOOLS,
} from '../background/ai-provider';
import type { DecideRequest } from '@cmt-autofill/contracts';

// ─────────────────────────────────────────────────────────────────────────────
// parseModelJson — pure function, no mocks needed
// ─────────────────────────────────────────────────────────────────────────────

describe('parseModelJson', () => {
  it('parses plain JSON', () => {
    expect(parseModelJson('{"foo": "bar"}')).toEqual({ foo: 'bar' });
  });

  it('strips ```json ... ``` fences', () => {
    expect(parseModelJson('```json\n{"foo": "bar"}\n```')).toEqual({ foo: 'bar' });
  });

  it('strips ``` ... ``` fences (no language tag)', () => {
    expect(parseModelJson('```\n{"foo": "bar"}\n```')).toEqual({ foo: 'bar' });
  });

  it('handles leading/trailing whitespace', () => {
    expect(parseModelJson('  { "x": 1 }  ')).toEqual({ x: 1 });
  });

  it('throws "Model returned invalid JSON" on bad input', () => {
    expect(() => parseModelJson('not json at all')).toThrow('Model returned invalid JSON');
  });

  it('throws on empty string', () => {
    expect(() => parseModelJson('')).toThrow('Model returned invalid JSON');
  });

  it('handles nested confidence structure (representative model output)', () => {
    const raw = JSON.stringify({
      sq_1: { value: true, confidence: 0.95, reason: 'Mentioned in abstract' },
      sq_2: { value: 'AI', confidence: 0.8, reason: 'Keywords contain AI' },
    });
    const result = parseModelJson(raw);
    expect(result.sq_1.value).toBe(true);
    expect(result.sq_1.confidence).toBe(0.95);
    expect(result.sq_2.value).toBe('AI');
  });

  it('parses model output wrapped in fences with trailing whitespace', () => {
    const raw = '```json\n{"a": 1}\n``` ';
    expect(parseModelJson(raw)).toEqual({ a: 1 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildSystemPrompt — pure function
// ─────────────────────────────────────────────────────────────────────────────

describe('buildSystemPrompt', () => {
  it('contains the expected role description', () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toContain('CMT (Conference Management Toolkit)');
  });

  it('contains confidence scoring thresholds (golden values from backend)', () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toContain('0.9–1.0');
    expect(prompt).toContain('0.7–0.89');
    expect(prompt).toContain('0.5–0.69');
    expect(prompt).toContain('< 0.5');
  });

  it('contains web_search tool instruction', () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toContain('web_search');
    expect(prompt).toContain('2026');
  });

  it('specifies the JSON output format', () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toContain('"value"');
    expect(prompt).toContain('"confidence"');
    expect(prompt).toContain('"reason"');
    expect(prompt).toContain('OUTPUT FORMAT');
  });

  it('does not include any placeholder text', () => {
    const prompt = buildSystemPrompt();
    expect(prompt).not.toContain('TODO');
    expect(prompt).not.toContain('undefined');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildUserPrompt — pure function
// ─────────────────────────────────────────────────────────────────────────────

const FIXTURE_REQUEST: DecideRequest = {
  paper: {
    title: 'Deep Learning for Autonomous Vehicles',
    abstract: 'This paper presents a novel approach to autonomous driving using deep neural networks.',
    keywords: ['deep learning', 'autonomous vehicles', 'neural networks'],
    fullText: 'Full text of the paper discussing autonomous driving...',
  },
  conference: {
    name: 'TestConf 2026',
    welcomeText: 'Welcome to TestConf 2026. Please fill all required fields.',
  },
  fields: [
    {
      id: 'sq_topic',
      kind: 'radio',
      label: 'Primary Topic Area',
      required: true,
      choices: [
        { id: 'ai', text: 'Artificial Intelligence' },
        { id: 'cv', text: 'Computer Vision' },
      ],
    },
    {
      id: 'sq_repro',
      kind: 'agreement',
      label: 'Reproducibility agreement',
      required: false,
    },
  ],
  authorSummary: {
    emails: ['alice@mit.edu', 'bob@stanford.edu'],
    organizations: ['MIT', 'Stanford University'],
    domains: ['mit.edu', 'stanford.edu'],
  },
};

describe('buildUserPrompt', () => {
  it('includes paper title', () => {
    expect(buildUserPrompt(FIXTURE_REQUEST)).toContain('Deep Learning for Autonomous Vehicles');
  });

  it('includes paper abstract', () => {
    expect(buildUserPrompt(FIXTURE_REQUEST)).toContain('novel approach to autonomous driving');
  });

  it('includes keywords comma-separated', () => {
    expect(buildUserPrompt(FIXTURE_REQUEST)).toContain('deep learning, autonomous vehicles, neural networks');
  });

  it('includes conference name', () => {
    expect(buildUserPrompt(FIXTURE_REQUEST)).toContain('TestConf 2026');
  });

  it('includes conference welcome text', () => {
    expect(buildUserPrompt(FIXTURE_REQUEST)).toContain('Welcome to TestConf 2026');
  });

  it('includes author emails', () => {
    const prompt = buildUserPrompt(FIXTURE_REQUEST);
    expect(prompt).toContain('alice@mit.edu');
    expect(prompt).toContain('bob@stanford.edu');
  });

  it('includes unique organisations (de-duped)', () => {
    const prompt = buildUserPrompt(FIXTURE_REQUEST);
    expect(prompt).toContain('MIT');
    expect(prompt).toContain('Stanford University');
  });

  it('serializes fields as JSON', () => {
    const prompt = buildUserPrompt(FIXTURE_REQUEST);
    expect(prompt).toContain('sq_topic');
    expect(prompt).toContain('Primary Topic Area');
    expect(prompt).toContain('sq_repro');
  });

  it('handles missing authorSummary gracefully', () => {
    const req: DecideRequest = { ...FIXTURE_REQUEST, authorSummary: undefined };
    const prompt = buildUserPrompt(req);
    expect(prompt).toContain('Deep Learning for Autonomous Vehicles');
    // Should not throw or include "undefined" literally
    expect(prompt).not.toContain('"undefined"');
  });

  it('handles missing welcomeText gracefully', () => {
    const req: DecideRequest = {
      ...FIXTURE_REQUEST,
      conference: { name: 'TestConf 2026', welcomeText: '' },
    };
    const prompt = buildUserPrompt(req);
    expect(prompt).toContain('TestConf 2026');
    // Empty welcomeText branch — no "Instructions" label
    expect(prompt).not.toContain('Instructions / Welcome Message');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TOOLS schema — structure matches backend exactly
// ─────────────────────────────────────────────────────────────────────────────

describe('TOOLS', () => {
  it('defines exactly one tool', () => {
    expect(TOOLS).toHaveLength(1);
  });

  it('tool is type "function"', () => {
    expect(TOOLS[0].type).toBe('function');
  });

  it('tool name is "web_search"', () => {
    expect(TOOLS[0].function.name).toBe('web_search');
  });

  it('query parameter is required', () => {
    expect(TOOLS[0].function.parameters.required).toContain('query');
  });

  it('description mentions 2026 for grounding results', () => {
    expect(TOOLS[0].function.description).toContain('2026');
  });

  it('description mentions query must include 2026', () => {
    expect(TOOLS[0].function.parameters.properties.query.description).toContain('2026');
  });
});
