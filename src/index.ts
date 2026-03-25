import { app } from './app.js';

const PORT = process.env.PORT ?? 3000;

app.listen(PORT, () => {
  // Plain startup line intentional — structured logging begins per-request.
  process.stdout.write(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'info',
      message: `Fluxora API listening on http://localhost:${PORT}`,
    }) + '\n',
  );
});
