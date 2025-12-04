import express, { Express } from 'express';
import path from 'path';
import { createApiRouter, ApiDependencies } from './routes';

export interface ServerConfig {
  port: number;
  publicDir?: string;
}

export function createServer(dependencies: ApiDependencies, config: ServerConfig): Express {
  const app = express();

  // Middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // API routes
  app.use('/api', createApiRouter(dependencies));

  // Serve static files from public directory
  const publicDir = config.publicDir || path.join(process.cwd(), 'public');
  app.use(express.static(publicDir));

  // Serve index.html for root path
  app.get('/', (_req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });

  return app;
}

export function startServer(app: Express, port: number): Promise<void> {
  return new Promise((resolve) => {
    app.listen(port, () => {
      console.log(`LazyMailBOSS Dashboard running on http://localhost:${port}`);
      resolve();
    });
  });
}
