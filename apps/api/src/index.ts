import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import aiRoutes from './routes/ai.routes.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  const timestamp = new Date().toISOString();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const statusColor = res.statusCode >= 400 ? '\x1b[31m' : '\x1b[32m'; // Red for error, Green for OK
    const resetColor = '\x1b[0m';
    console.log(`[${timestamp}] ${req.method} ${req.url} -> ${statusColor}${res.statusCode}${resetColor} (${duration}ms)`);
  });

  next();
});

app.get('/health', (req: express.Request, res: express.Response) => {
  res.json({ status: 'ok' });
});

app.use('/api/v1/ai', aiRoutes);

app.listen(PORT, () => {
  console.log(`\n==================================================`);
  console.log(`  CMT Autofill Backend Service Running`);
  console.log(`  URL: http://localhost:${PORT}`);
  console.log(`  Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`==================================================\n`);
});
