import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { runMigrations } from './db/index.js';
import { restoreActiveSessions } from './services/sessionManager.js';
import authRouter from './routes/auth.js';
import whatsappRouter from './routes/whatsapp.js';
import filtersRouter from './routes/filters.js';
import messagesRouter from './routes/messages.js';

const app = express();
const PORT = parseInt(process.env.PORT ?? '4000', 10);

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRouter);
app.use('/api/whatsapp', whatsappRouter);
app.use('/api/filters', filtersRouter);
app.use('/api/messages', messagesRouter);

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

async function main(): Promise<void> {
  await runMigrations();
  await restoreActiveSessions();

  app.listen(PORT, () => {
    console.log(`Mobile server listening on port ${PORT}`);
  });
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
