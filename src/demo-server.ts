/**
 * Demo server for testing the Web Dashboard UI
 * This file demonstrates how to start the server with all components
 */

import { createServer, startServer } from './api/server';
import { ConfigurationManagerImpl } from './config/ConfigurationManager';
import { ActivityLogRepository } from './database/ActivityLogRepository';
import { ReplyRepository } from './database/ReplyRepository';
import { AutoResponderImpl } from './responder/AutoResponder';
import { ReadTrackerImpl } from './responder/ReadTracker';
import { Database } from './database/connection';

async function main() {
  // Initialize database connection
  const dbPath = process.env.DB_PATH || ':memory:';
  const database = Database.getInstance();
  await database.connect(dbPath);

  // Initialize repositories
  const activityLogRepository = new ActivityLogRepository(database);
  const replyRepository = new ReplyRepository(database);

  // Initialize configuration manager
  const configManager = new ConfigurationManagerImpl();

  // Get config to use for auto responder
  const config = await configManager.getConfig();

  // Initialize read tracker with demo config
  const readTracker = new ReadTrackerImpl({
    user: config.email.username || 'demo@example.com',
    password: config.email.password || 'demo-password',
    host: config.email.imapHost || 'imap.example.com',
    port: config.email.imapPort || 993,
    tls: true
  });

  // Initialize auto responder (with mock SMTP for demo)
  const autoResponder = new AutoResponderImpl({
    smtpConfig: {
      host: config.email.smtpHost || 'smtp.example.com',
      port: config.email.smtpPort || 587,
      secure: false,
      auth: {
        user: config.email.username || 'demo@example.com',
        pass: config.email.password || 'demo-password'
      }
    },
    replyTemplate: config.autoReply.replyTemplate,
    manualConfirmation: config.autoReply.manualConfirmation,
    readTracker,
    onLog: (log) => activityLogRepository.create(log),
    onReplySave: (reply) => replyRepository.create(reply)
  });

  // Create and start server
  const app = createServer(
    {
      configManager,
      activityLogRepository,
      replyRepository,
      autoResponder
    },
    {
      port: 3000
    }
  );

  await startServer(app, 3000);
  
  console.log('Dashboard available at: http://localhost:3000');
  console.log('API endpoints available at: http://localhost:3000/api');
}

main().catch(console.error);
