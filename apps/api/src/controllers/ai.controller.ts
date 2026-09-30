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
