import { Request, Response } from 'express';
import { AIService } from '../services/ai.service.js';
import { DecideRequestSchema } from '@cmt-autofill/contracts';

const aiService = new AIService();

export const decideController = async (req: Request, res: Response) => {
  console.log(`\n--------------------------------------------------`);
  console.log(`[AI CONTROLLER] Incoming /api/v1/ai/decide request`);

  try {
    const validatedData = DecideRequestSchema.parse(req.body);
    console.log(`[AI CONTROLLER] Payload validated successfully for paper: "${validatedData.paper.title}"`);
    
    const result = await aiService.decide(validatedData);
    res.json(result);
  } catch (error: any) {
    console.error(`[AI CONTROLLER ERROR] ${error.message}`);
    res.status(400).json({ error: error.message });
  }
};

export const extractPdfController = async (req: Request, res: Response) => {
  console.log(`\n--------------------------------------------------`);
  console.log(`[AI CONTROLLER] Incoming /api/v1/ai/extract-pdf request`);

  try {
    const { pdfBase64 } = req.body;
    if (!pdfBase64) {
      res.status(400).json({ error: 'pdfBase64 is required in request body' });
      return;
    }

    const pdfBuffer = Buffer.from(pdfBase64, 'base64');
    console.log(`[AI CONTROLLER] Received PDF payload (${pdfBuffer.length} bytes)`);

    const result = await aiService.extractPdf(pdfBuffer);
    res.json(result);
  } catch (error: any) {
    console.error(`[AI CONTROLLER ERROR] ${error.message}`);
    res.status(400).json({ error: error.message });
  }
};
