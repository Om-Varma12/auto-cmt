import { DecideRequest, DecideResponse } from '@cmt-autofill/contracts';

export interface OllamaProvider {
  decide(request: DecideRequest): Promise<DecideResponse>;
}

/**
 * Robustly parses the LLM response content into JSON.
 * Handles:
 *   - Raw JSON strings
 *   - Markdown-fenced ```json ... ``` blocks
 *   - Markdown-fenced ``` ... ``` blocks (no language tag)
 *   - Leading/trailing whitespace
 */
function parseModelJson(raw: string): Record<string, any> {
  const trimmed = raw.trim();

  // Strip ```json ... ``` or ``` ... ``` fences
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```\s*$/i);
  const jsonStr = fenceMatch ? fenceMatch[1].trim() : trimmed;

  try {
    return JSON.parse(jsonStr);
  } catch (err: any) {
    console.error(`[OLLAMA PROVIDER] Failed to parse model response as JSON.`);
    console.error(`[OLLAMA PROVIDER] Raw content (first 500 chars): ${raw.substring(0, 500)}`);
    throw new Error(`Model returned invalid JSON: ${err.message}`);
  }
}

export class OllamaCloudProvider implements OllamaProvider {
  private get apiKey(): string {
    return process.env.OLLAMA_API_KEY || '';
  }

  private get model(): string {
    return process.env.MODEL_NAME || 'gemma4:31b';
  }

  async decide(request: DecideRequest): Promise<DecideResponse> {
    const hasApiKey = Boolean(this.apiKey && this.apiKey.trim() !== '');
    const maskedKey = hasApiKey
      ? `${this.apiKey.substring(0, 4)}...${this.apiKey.substring(this.apiKey.length - 4)}`
      : 'NOT_SET';

    console.log(`\n[OLLAMA PROVIDER] Sending request to Ollama Cloud`);
    console.log(`  Target Model: ${this.model}`);
    console.log(`  API Key: ${maskedKey}`);
    console.log(`  Conference: ${request.conference.name}`);
    console.log(`  Fields Count: ${request.fields.length}`);

    const prompt = this.buildPrompt(request);

    try {
      const response = await fetch('https://ollama.com/api/chat', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            {
              role: 'system',
              content: 'You are an expert academic assistant. Your task is to fill out a CMT conference submission form based on the provided paper text. Return ONLY a valid JSON object — no markdown, no code fences, no extra text. Keys are field IDs and values are objects with fields: value (string | boolean | string[]), confidence (number 0-1), reason (string).',
            },
            { role: 'user', content: prompt },
          ],
          stream: false,
          format: 'json',
        }),
      });

      console.log(`[OLLAMA PROVIDER] Ollama Cloud HTTP Response Status: ${response.status} ${response.statusText}`);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[OLLAMA PROVIDER ERROR] ${response.status} ${response.statusText}: ${errorText}`);
        throw new Error(`Ollama API error: ${response.statusText}`);
      }

      const data = await response.json();
      const rawContent: string = data.message?.content ?? '';
      console.log(`[OLLAMA PROVIDER] Raw model response (first 300 chars): ${rawContent.substring(0, 300)}`);

      const content = parseModelJson(rawContent);
      console.log(`[OLLAMA PROVIDER SUCCESS] Received decisions for ${Object.keys(content).length} fields`);

      return {
        answers: content,
        model: this.model,
        requestId: Math.random().toString(36).substring(7),
      };
    } catch (err: any) {
      console.error(`[OLLAMA PROVIDER FAILED] ${err.message}`);
      throw err;
    }
  }

  private buildPrompt(request: DecideRequest): string {
    return `
Paper Title: ${request.paper.title}
Abstract: ${request.paper.abstract}
Keywords: ${request.paper.keywords.join(', ')}
Full Text: ${request.paper.fullText}

Conference: ${request.conference.name}
Welcome Text: ${request.conference.welcomeText}

Fields to fill:
${JSON.stringify(request.fields, null, 2)}

Return a JSON object only. For each field ID, provide:
- value: the answer (string, boolean, or array of strings depending on field type)
- confidence: number between 0 and 1
- reason: brief explanation
`;
  }
}
