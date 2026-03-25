import { createApp } from './app.js';
import { logger } from './logging/logger.js';

const app = createApp();
const PORT = process.env.PORT ?? 3000;

app.listen(PORT, () => {
  logger.info(`Fluxora API listening on http://localhost:${PORT}`);
});
