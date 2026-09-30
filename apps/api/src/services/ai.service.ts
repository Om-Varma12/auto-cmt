import { DecideRequest, DecideResponse, ExtractPdfResponse } from '@cmt-autofill/contracts';
import { OllamaCloudProvider } from '../providers/ollama/index.js';

export class AIService {
  private provider = new OllamaCloudProvider();

  async decide(request: DecideRequest): Promise<DecideResponse> {
    return this.provider.decide(request);
  }

  async extractPdf(pdfBuffer: Buffer): Promise<ExtractPdfResponse> {
    return this.provider.extractPdf(pdfBuffer);
  }
}
