import { DecideRequest, DecideResponse } from '@cmt-autofill/contracts';
import { OllamaCloudProvider } from '../providers/ollama/index.js';

export class AIService {
  private provider = new OllamaCloudProvider();

  async decide(request: DecideRequest): Promise<DecideResponse> {
    return this.provider.decide(request);
  }
}
