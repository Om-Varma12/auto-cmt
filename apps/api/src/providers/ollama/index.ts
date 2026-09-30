import { DecideRequest, DecideResponse } from '@cmt-autofill/contracts';

// ─────────────────────────────────────────────────────────────────────────────
// Interfaces
// ─────────────────────────────────────────────────────────────────────────────

export interface OllamaProvider {
  decide(request: DecideRequest): Promise<DecideResponse>;
}

// ─────────────────────────────────────────────────────────────────────────────
// JSON parsing — strips markdown code fences the model may wrap output in
// ─────────────────────────────────────────────────────────────────────────────

function parseModelJson(raw: string): Record<string, any> {
  const trimmed = raw.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```\s*$/i);
  const jsonStr = fenceMatch ? fenceMatch[1].trim() : trimmed;
  try {
    return JSON.parse(jsonStr);
  } catch (err: any) {
    console.error(`[OLLAMA PROVIDER] JSON parse failed. Raw content (first 500 chars):\n${raw.substring(0, 500)}`);
    throw new Error(`Model returned invalid JSON: ${err.message}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tavily web search tool
// ─────────────────────────────────────────────────────────────────────────────

async function tavilySearch(query: string): Promise<string> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    console.warn('[TAVILY] TAVILY_API_KEY not set — returning empty search result');
    return 'Search unavailable: TAVILY_API_KEY not configured.';
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

  // Return the AI-synthesized answer if available, otherwise concatenate top results
  if (data.answer) return data.answer;
  return (data.results ?? [])
    .map((r: any) => `${r.title}\n${r.content}`)
    .join('\n\n---\n\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool schema passed to Ollama
// ─────────────────────────────────────────────────────────────────────────────

const TOOLS = [
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
// System prompt
// ─────────────────────────────────────────────────────────────────────────────

function buildSystemPrompt(): string {
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

FIELD TYPE RULES:
- "agreement" (checkbox): Suggest true/false; the user must confirm legal/ethical declarations
- "radio": Return the EXACT id value of the matching radio option from the choices list
- "dropdown"/"listbox": Return the EXACT id/value of the matching option
- "text"/"textarea": Return a string answer appropriate for academic writing style
- "repro": Return a string justification for the reproducibility question

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

// ─────────────────────────────────────────────────────────────────────────────
// User prompt — includes full paper + all field context
// ─────────────────────────────────────────────────────────────────────────────

function buildUserPrompt(request: DecideRequest): string {
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
// OllamaCloudProvider
// ─────────────────────────────────────────────────────────────────────────────

export class OllamaCloudProvider implements OllamaProvider {
  private get apiKey(): string {
    return process.env.OLLAMA_API_KEY || '';
  }

  private get model(): string {
    return process.env.MODEL_NAME || 'gemma4:31b';
  }

  async decide(request: DecideRequest): Promise<DecideResponse> {
    const hasApiKey = Boolean(this.apiKey?.trim());
    const maskedKey = hasApiKey
      ? `${this.apiKey.substring(0, 4)}...${this.apiKey.substring(this.apiKey.length - 4)}`
      : 'NOT_SET';

    console.log(`\n[OLLAMA PROVIDER] Starting decide()`);
    console.log(`  Model:       ${this.model}`);
    console.log(`  API Key:     ${maskedKey}`);
    console.log(`  Conference:  ${request.conference.name}`);
    console.log(`  Fields:      ${request.fields.length}`);
    console.log(`  Paper:       "${request.paper.title}"`);

    const messages: any[] = [
      { role: 'system', content: buildSystemPrompt() },
      { role: 'user', content: buildUserPrompt(request) },
    ];

    const MAX_ITERATIONS = 6; // max tool-call rounds before forcing final answer
    let iteration = 0;

    try {
      while (iteration < MAX_ITERATIONS) {
        iteration++;
        console.log(`\n[OLLAMA PROVIDER] Iteration ${iteration} — sending ${messages.length} messages`);

        const response = await fetch('https://ollama.com/api/chat', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: this.model,
            messages,
            tools: TOOLS,
            stream: false,
          }),
        });

        console.log(`[OLLAMA PROVIDER] HTTP ${response.status} ${response.statusText}`);

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`[OLLAMA PROVIDER ERROR] ${response.status}: ${errorText}`);
          throw new Error(`Ollama API error: ${response.statusText}`);
        }

        const data = await response.json();
        const assistantMsg = data.message;

        // ── Tool calls? Execute them and loop ─────────────────────────────
        if (assistantMsg.tool_calls && assistantMsg.tool_calls.length > 0) {
          console.log(`[OLLAMA PROVIDER] Model issued ${assistantMsg.tool_calls.length} tool call(s)`);

          // Push the assistant's tool-call message into history
          messages.push(assistantMsg);

          for (const toolCall of assistantMsg.tool_calls) {
            const fnName = toolCall.function?.name;
            const args   = toolCall.function?.arguments ?? {};

            console.log(`[OLLAMA PROVIDER] Tool call: ${fnName}(${JSON.stringify(args)})`);

            let toolResult = '';
            if (fnName === 'web_search') {
              toolResult = await tavilySearch(args.query ?? '');
            } else {
              toolResult = `Unknown tool: ${fnName}`;
              console.warn(`[OLLAMA PROVIDER] Unknown tool requested: ${fnName}`);
            }

            messages.push({
              role: 'tool',
              content: toolResult,
              name: fnName,
            });
          }

          // Continue loop to let the model use the search results
          continue;
        }

        // ── No tool calls — parse the final JSON answer ───────────────────
        const rawContent: string = assistantMsg?.content ?? '';
        console.log(`[OLLAMA PROVIDER] Final response (first 300 chars): ${rawContent.substring(0, 300)}`);

        const content = parseModelJson(rawContent);
        console.log(`[OLLAMA PROVIDER SUCCESS] Decisions for ${Object.keys(content).length} fields`);

        return {
          answers: content,
          model: this.model,
          requestId: Math.random().toString(36).substring(7),
        };
      }

      throw new Error(`Ollama exceeded ${MAX_ITERATIONS} tool-call iterations without a final answer`);

    } catch (err: any) {
      console.error(`[OLLAMA PROVIDER FAILED] ${err.message}`);
      throw err;
    }
  }
}
