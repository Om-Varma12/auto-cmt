/**
 * ai-provider.ts
 *
 * Port of apps/api/src/providers/ollama/index.ts to the MV3 service worker.
 *
 * Deviations from the backend (1:1 behavior preserved in all other respects):
 *  [D1] pdf-parse (Node) → pdf-extractor.ts (pdfjs-dist, browser-native)
 *  [D2] Buffer.from(base64, 'base64') → handled inside pdf-extractor.ts
 *  [D3] process.env.OLLAMA_API_KEY / TAVILY_API_KEY / MODEL_NAME
 *       → chrome.storage reads via key-store.ts / storage module
 *
 * Prompts, constants, thresholds, JSON parsing, retry logic, tool schema,
 * and all validation rules are identical to the backend.
 */

import { DecideRequest, DecideResponse, ExtractPdfResponse } from '@cmt-autofill/contracts';
import { extractTextFromPdfBase64 } from './pdf-extractor';
import { loadApiKey } from './key-store';
import { storage } from '../storage';

// ─────────────────────────────────────────────────────────────────────────────
// JSON parsing — strips markdown code fences the model may wrap output in
// (identical to backend)
// ─────────────────────────────────────────────────────────────────────────────

export function parseModelJson(raw: string): Record<string, any> {
  const trimmed = raw.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```\s*$/i);
  const jsonStr = fenceMatch ? fenceMatch[1].trim() : trimmed;
  try {
    return JSON.parse(jsonStr);
  } catch (err: any) {
    console.error(`[AI PROVIDER] JSON parse failed. Raw content (first 500 chars):\n${raw.substring(0, 500)}`);
    throw new Error(`Model returned invalid JSON: ${err.message}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tavily web search tool
// [D3] process.env.TAVILY_API_KEY → loadApiKey('tavily') from chrome.storage
// ─────────────────────────────────────────────────────────────────────────────

async function tavilySearch(query: string): Promise<string> {
  // [D3] Read from chrome.storage instead of process.env
  const apiKey = await loadApiKey('tavily');
  if (!apiKey) {
    console.warn('[TAVILY] Tavily API key not configured — skipping web search');
    return 'Search unavailable: Tavily API key not configured.';
  }

  console.log(`[TAVILY] Searching: "${query}"`);

  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      max_results: 5,
      include_answer: true,
      search_depth: 'basic',
    }),
  });

  if (!response.ok) {
    const txt = await response.text();
    console.error(`[TAVILY] HTTP ${response.status}: ${txt}`);
    return `Search failed: ${response.status} ${response.statusText}`;
  }

  const data = await response.json();
  console.log(`[TAVILY] Got answer: ${data.answer ? 'yes' : 'no'}, results: ${data.results?.length ?? 0}`);

  if (data.answer) return data.answer;
  return (data.results ?? [])
    .map((r: any) => `${r.title}\n${r.content}`)
    .join('\n\n---\n\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool schema — identical to backend
// ─────────────────────────────────────────────────────────────────────────────

export const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'web_search',
      description:
        'Search the web for information you are uncertain about, such as the meaning of ' +
        'a conference-specific term, a submission requirement, or any question whose context ' +
        'you cannot confidently answer from the paper alone. ' +
        'Always include "2026" in the query to get current results.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description:
              'A focused, specific search query. Must include "2026" to ground results ' +
              'to current year. Example: "CMT conference submission conflict domains format 2026"',
          },
        },
        required: ['query'],
      },
    },
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Prompts — identical to backend
// ─────────────────────────────────────────────────────────────────────────────

export function buildSystemPrompt(): string {
  return `You are an expert academic research assistant specializing in paper submissions to academic conferences using the Microsoft CMT (Conference Management Toolkit) platform.

YOUR ROLE:
You receive a research paper (full title, abstract, keywords, and full text) along with conference metadata and a list of form fields from the CMT submission form. Your job is to determine the best answer for each field based on the paper's content and the conference context.

WHAT YOU MUST DO:
- Analyze the paper carefully before answering any field
- Base ALL answers strictly on the paper content provided — never invent facts
- For each field, provide: a value, a confidence score (0–1), and a brief reason
- If you are unsure what a field is asking or need context about the conference, call web_search

HOW TO USE web_search:
- Use it when a field uses conference-specific terminology you don't recognize
- Use it when you need to understand what a specific question requires in an academic conference context
- ALWAYS include "2026" in your search query for current, relevant results
- Generate a specific, well-formed query — not a vague one

CONFIDENCE SCORING:
- 0.9–1.0 → Answer explicitly stated in the paper
- 0.7–0.89 → Strongly inferred from paper content
- 0.5–0.69 → Reasonable best guess given available context
- < 0.5 → Low confidence — the user should review this field manually

OUTPUT FORMAT:
Return a single valid JSON object only — no markdown, no code fences, no preamble. Keys are field IDs, values are:
{
  "<field_id>": {
    "value": <string | boolean | string[]>,
    "confidence": <number 0.0–1.0>,
    "reason": "<brief explanation>"
  }
}`;
}

export function buildUserPrompt(request: DecideRequest): string {
  const authorsSection = request.authorSummary
    ? `AUTHOR INFORMATION:
Emails: ${request.authorSummary.emails.join(', ')}
Organizations: ${[...new Set(request.authorSummary.organizations)].join(', ')}
Domains: ${[...new Set(request.authorSummary.domains)].join(', ')}`
    : '';

  return `=== PAPER ===
Title: ${request.paper.title}
Keywords: ${request.paper.keywords.join(', ')}

Abstract:
${request.paper.abstract}

Full Text:
${request.paper.fullText}

=== CONFERENCE ===
Name: ${request.conference.name}
${request.conference.welcomeText ? `Instructions / Welcome Message:\n${request.conference.welcomeText}` : ''}

=== AUTHORS ===
${authorsSection}

=== FORM FIELDS TO FILL ===
The following fields appear on the CMT submission form. Fill each one based on the paper above.
${JSON.stringify(request.fields, null, 2)}

Now return a JSON object with an entry for every field ID listed above.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider — identical logic to backend, env vars replaced by storage reads
// ─────────────────────────────────────────────────────────────────────────────

const OLLAMA_API_URL = 'https://ollama.com/api/chat';
const MAX_ITERATIONS = 6; // identical to backend

export class OllamaProvider {
  // [D3] process.env.OLLAMA_API_KEY → chrome.storage read via key-store
  private async getApiKey(): Promise<string> {
    return loadApiKey('ollama');
  }

  // [D3] process.env.MODEL_NAME → chrome.storage.local settings read
  private async getModel(): Promise<string> {
    const settings = await storage.getSettings();
    return settings.modelName || 'gemma4:31b';
  }

  // ── extractPdf ─────────────────────────────────────────────────────────────
  // [D1][D2] pdf-parse + Buffer → pdfjs-dist + Uint8Array (in pdf-extractor.ts)
  async extractPdf(pdfBase64: string): Promise<ExtractPdfResponse> {
    console.log('\n[AI PROVIDER] Starting extractPdf()');

    // [D1][D2] Browser-native PDF text extraction
    let pdfText = '';
    try {
      pdfText = await extractTextFromPdfBase64(pdfBase64);
      console.log(`[AI PROVIDER] Extracted ${pdfText.length} characters from PDF Page 1`);
    } catch (err: any) {
      console.error(`[AI PROVIDER] PDF parsing failed: ${err.message}`);
      throw new Error(`Failed to parse PDF file: ${err.message}`);
    }

    const apiKey = await this.getApiKey();
    const model = await this.getModel();

    // Prompt identical to backend
    const systemPrompt = `You are an expert academic paper metadata extractor.
Analyze the provided text from the first page of a research paper.
Extract the paper title, abstract, and all listed authors with their information.

Return ONLY a valid JSON object matching this exact schema:
{
  "title": "Exact paper title",
  "abstract": "Exact abstract text",
  "authors": [
    {
      "email": "author@domain.com",
      "firstName": "John",
      "lastName": "Doe",
      "organization": "University Name",
      "countryCode": "India"
    }
  ]
}

Rules:
- countryCode MUST be "India" for all authors.
- If email is not explicitly in the text for an author, generate a plausible email based on their name and institution.
- Split full author names accurately into firstName and lastName.
- Extract ALL authors listed.
- Return ONLY valid JSON — no markdown, no code fences, no extra text.`;

    const userPrompt = `Extract paper details and author list from the following text:\n\n${pdfText.substring(0, 4000)}`;

    try {
      const response = await fetch(OLLAMA_API_URL, {
        method: 'POST',
        headers: {
          // NOTE: Direct browser-to-Ollama-Cloud call with user's own key,
          // held locally in encrypted storage. The user has consented to this
          // by entering their key in the extension's options page.
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          stream: false,
          format: 'json',
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Ollama API error: ${response.statusText} - ${errorText}`);
      }

      const data = await response.json();
      const rawContent: string = data.message?.content ?? '';
      console.log('[AI PROVIDER] PDF extraction response received');

      const content = parseModelJson(rawContent);

      return {
        title: content.title || 'Untitled Paper',
        abstract: content.abstract || '',
        authors: Array.isArray(content.authors)
          ? content.authors.map((a: any) => ({
              email: a.email || `${(a.firstName || 'author').toLowerCase()}.${(a.lastName || '').toLowerCase()}@example.com`,
              firstName: a.firstName || 'Author',
              lastName: a.lastName || '',
              organization: a.organization || '',
              countryCode: 'India', // always India per business rule
            }))
          : [],
      };
    } catch (err: any) {
      console.error(`[AI PROVIDER] PDF extraction failed: ${err.message}`);
      throw err;
    }
  }

  // ── decide ─────────────────────────────────────────────────────────────────
  async decide(request: DecideRequest): Promise<DecideResponse> {
    const apiKey = await this.getApiKey();
    const model = await this.getModel();

    // Never log the full key — masked display only (identical to backend)
    const maskedKey = apiKey
      ? `${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 4)}`
      : 'NOT_SET';

    console.log('\n[AI PROVIDER] Starting decide()');
    console.log(`  Model:       ${model}`);
    console.log(`  API Key:     ${maskedKey}`);
    console.log(`  Conference:  ${request.conference.name}`);
    console.log(`  Fields:      ${request.fields.length}`);
    console.log(`  Paper:       "${request.paper.title}"`);

    const messages: any[] = [
      { role: 'system', content: buildSystemPrompt() },
      { role: 'user', content: buildUserPrompt(request) },
    ];

    let iteration = 0;

    try {
      while (iteration < MAX_ITERATIONS) {
        iteration++;
        console.log(`\n[AI PROVIDER] Iteration ${iteration} — sending ${messages.length} messages`);

        const response = await fetch(OLLAMA_API_URL, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            messages,
            tools: TOOLS,
            stream: false,
          }),
        });

        console.log(`[AI PROVIDER] HTTP ${response.status} ${response.statusText}`);

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`[AI PROVIDER ERROR] ${response.status}: ${errorText}`);
          throw new Error(`Ollama API error: ${response.statusText}`);
        }

        const data = await response.json();
        const assistantMsg = data.message;

        if (assistantMsg.tool_calls && assistantMsg.tool_calls.length > 0) {
          console.log(`[AI PROVIDER] Model issued ${assistantMsg.tool_calls.length} tool call(s)`);
          messages.push(assistantMsg);

          for (const toolCall of assistantMsg.tool_calls) {
            const fnName = toolCall.function?.name;
            const args = toolCall.function?.arguments ?? {};

            console.log(`[AI PROVIDER] Tool call: ${fnName}(${JSON.stringify(args)})`);

            let toolResult = '';
            if (fnName === 'web_search') {
              toolResult = await tavilySearch(args.query ?? '');
            } else {
              toolResult = `Unknown tool: ${fnName}`;
              console.warn(`[AI PROVIDER] Unknown tool requested: ${fnName}`);
            }

            messages.push({
              role: 'tool',
              content: toolResult,
              name: fnName,
            });
          }

          continue;
        }

        const rawContent: string = assistantMsg?.content ?? '';
        console.log(`[AI PROVIDER] Final response (first 300 chars): ${rawContent.substring(0, 300)}`);

        const content = parseModelJson(rawContent);
        console.log(`[AI PROVIDER SUCCESS] Decisions for ${Object.keys(content).length} fields`);

        return {
          answers: content,
          model,
          requestId: Math.random().toString(36).substring(7),
        };
      }

      throw new Error(`Ollama exceeded ${MAX_ITERATIONS} tool-call iterations without a final answer`);
    } catch (err: any) {
      console.error(`[AI PROVIDER FAILED] ${err.message}`);
      throw err;
    }
  }

  /**
   * Tests connectivity with the stored Ollama API key.
   * Used by the TEST_CONNECTION service worker message handler.
   * The key is read from storage here — never passed through messages.
   */
  async testConnection(model: string): Promise<{ ok: boolean; model: string; latencyMs: number }> {
    const apiKey = await this.getApiKey();
    if (!apiKey) throw new Error('No Ollama API key configured. Please set it in Options.');

    const t0 = Date.now();
    const response = await fetch(OLLAMA_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'Reply with only the word "ok"' }],
        stream: false,
        options: { num_predict: 4 }, // cap tokens for test call
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Ollama API returned ${response.status}: ${errText.substring(0, 200)}`);
    }

    return { ok: true, model, latencyMs: Date.now() - t0 };
  }
}

export const ollamaProvider = new OllamaProvider();
