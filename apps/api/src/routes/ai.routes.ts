import { Router } from 'express';
import { decideController, extractPdfController } from '../controllers/ai.controller.js';

const router = Router();

router.post('/decide', decideController);
router.post('/extract-pdf', extractPdfController);

export default router;
