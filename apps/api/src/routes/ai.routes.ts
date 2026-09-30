import { Router } from 'express';
import { decideController } from '../controllers/ai.controller.js';

const router = Router();

router.post('/decide', decideController);

export default router;
