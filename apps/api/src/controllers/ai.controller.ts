import { Request, Response } from 'express';
import { AIService } from '../services/ai.service.js';
import { DecideRequestSchema } from '@cmt-autofill/contracts';

const aiService = new AIService();

export const decideController = async (req: Request, res: Response) => {
  try {
    const validatedData = DecideRequestSchema.parse(req.body);
    const result = await aiService.decide(validatedData);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};
