import { DecideRequest, DecideResponse, Decision } from '@cmt-autofill/contracts';

export interface OllamaProvider {
  decide(request: DecideRequest): Promise<DecideResponse>;
}

export class OllamaCloudProvider implements OllamaProvider {
  private apiKey: string;
  private model: string;

  constructor() {
    this.apiKey = process.env.OLLAMA_API_KEY || '';
    this.model = process.env.MODEL_NAME || 'gemma4:31b';
  }

  async decide(request: DecideRequest): Promise<DecideResponse> {
    const prompt = this.buildPrompt(request);

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
            content: 'You are an expert academic assistant. Your task is to fill out a CMT conference submission form based on the provided paper text. Return ONLY a JSON object where keys are field IDs and values are objects containing {value, confidence, reason}.'
          },
          { role: 'user', content: prompt },
        ],
        stream: false,
        format: 'json',
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.statusText}`);
    }

    const data = await response.json();
    const content = JSON.parse(data.message.content);

    return {
      answers: content,
      model: this.model,
      requestId: Math.random().toString(36).substring(7),
    };
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

Please provide the answers in JSON format. For each field:
- value: the answer (string, boolean, or array of strings)
- confidence: 0 to 1
- reason: short explanation
`;
  }
}
