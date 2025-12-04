// Main application entry point
import { Database, runMigrations } from './database';
import { ConfigurationManagerImpl, getEnvConfig, printConfigSummary } from './config';
import { MessageFilter } from './filter';
import { AutoResponderImpl, ReadTrackerImpl } from './responder';
import { EmailMonitorImpl } from './monitor';
import { createServer, startServer } from './api/server';
import { ActivityLogRepository } from './database/ActivityLogRepository';
import { ReplyRepository } from './database/ReplyRepository';
import { Config } from './models';

// Application state
let emailMonitor: EmailMonitorImpl | null = null;
let configManager: ConfigurationManagerImpl | null = null;
let database: Database | null = null;
let isShuttingDown = false;

/**
 * Initialize the application
 */
async function initialize(): Promise<void> {
  console.log('LazyMailBOSS - Automated Email Response System');
  console.log('Initializing...');

  try {
    // Load environment configuration
    const envConfig = getEnvConfig();
    console.log('✓ Environment configuration loaded');
    printConfigSummary(envConfig);
    console.log('');

    // Initialize database connection
    database = Database.getInstance();
    await database.connect(envConfig.databasePath);
    console.log('✓ Database connected');

    // Run migrations
    await runMigrations(database);
    console.log('✓ Database migrations completed');

    // Initialize ConfigurationManager with encryption key from environment
    configManager = new ConfigurationManagerImpl(
      envConfig.configDatabasePath,
      envConfig.encryptionKey
    );
    console.log('✓ Configuration manager initialized');

    // Load initial configuration and merge with environment overrides
    let config = await configManager.getConfig();
    
    // Apply environment variable overrides if provided
    if (envConfig.email) {
      config = {
        ...config,
        email: {
          ...config.email,
          ...(envConfig.email.imapHost && { imapHost: envConfig.email.imapHost }),
          ...(envConfig.email.imapPort && { imapPort: envConfig.email.imapPort }),
          ...(envConfig.email.imapUser && { username: envConfig.email.imapUser }),
          ...(envConfig.email.imapPassword && { password: envConfig.email.imapPassword }),
          ...(envConfig.email.smtpHost && { smtpHost: envConfig.email.smtpHost }),
          ...(envConfig.email.smtpPort && { smtpPort: envConfig.email.smtpPort }),
        }
      };
    }
    
    if (envConfig.autoReply) {
      config = {
        ...config,
        autoReply: {
          ...config.autoReply,
          ...(envConfig.autoReply.checkInterval !== undefined && { checkInterval: envConfig.autoReply.checkInterval }),
          ...(envConfig.autoReply.manualConfirmation !== undefined && { manualConfirmation: envConfig.autoReply.manualConfirmation }),
          ...(envConfig.autoReply.replyTemplate && { replyTemplate: envConfig.autoReply.replyTemplate }),
        }
      };
    }
    
    if (envConfig.filters) {
      config = {
        ...config,
        filters: {
          ...config.filters,
          ...(envConfig.filters.keywordsEnabled !== undefined && { keywordsEnabled: envConfig.filters.keywordsEnabled }),
          ...(envConfig.filters.keywords && { keywords: envConfig.filters.keywords }),
          ...(envConfig.filters.excludedDomains && { excludedDomains: envConfig.filters.excludedDomains }),
        }
      };
    }
    
    console.log('✓ Configuration loaded');

    // Initialize repositories
    const activityLogRepository = new ActivityLogRepository(database);
    const replyRepository = new ReplyRepository(database);
    console.log('✓ Repositories initialized');

    // Create components based on configuration
    const { messageFilter, autoResponder, readTracker } = createComponents(
      config,
      activityLogRepository,
      replyRepository
    );

    // Subscribe to configuration changes for hot-reload
    configManager.subscribe((newConfig: Config) => {
      console.log('Configuration updated, applying changes...');
      
      // Update MessageFilter
      messageFilter.updateKeywords(newConfig.filters.keywords);
      messageFilter.updateExcludedDomains(newConfig.filters.excludedDomains);
      messageFilter.setKeywordsEnabled(newConfig.filters.keywordsEnabled);
      
      console.log('✓ Configuration hot-reloaded');
    });

    // Create EmailMonitor
    if (config.email.username && config.email.password && config.email.imapHost) {
      emailMonitor = new EmailMonitorImpl({
        imapConfig: {
          user: config.email.username,
          password: config.email.password,
          host: config.email.imapHost,
          port: config.email.imapPort,
          tls: true,
        },
        messageFilter,
        autoResponder,
        readTracker,
        checkInterval: config.autoReply.checkInterval * 1000, // Convert to milliseconds
        onLog: (log) => {
          // Log to database
          activityLogRepository.create(log).catch((err) => {
            console.error('Failed to log activity:', err);
          });
        },
      });
      console.log('✓ Email monitor initialized');
    } else {
      console.log('⚠ Email credentials not configured, monitor not started');
      console.log('  Configure credentials via the web dashboard');
    }

    // Start API server
    const app = createServer(
      {
        configManager,
        activityLogRepository,
        replyRepository,
        autoResponder,
        emailMonitor: emailMonitor || undefined,
      },
      {
        port: envConfig.port,
      }
    );

    await startServer(app, envConfig.port);
    console.log('✓ API server started');

    // Start EmailMonitor if configured
    if (emailMonitor) {
      await emailMonitor.start();
      console.log('✓ Email monitoring started');
    }

    console.log('\n✓ LazyMailBOSS is running!');
    console.log(`  Dashboard: http://localhost:${envConfig.port}`);
    console.log('  Press Ctrl+C to stop\n');
  } catch (error) {
    console.error('Failed to initialize application:', error);
    await shutdown();
    process.exit(1);
  }
}

/**
 * Create components based on configuration
 */
function createComponents(
  config: Config,
  activityLogRepository: ActivityLogRepository,
  replyRepository: ReplyRepository
) {
  // Create MessageFilter
  const messageFilter = new MessageFilter({
    keywordsEnabled: config.filters.keywordsEnabled,
    keywords: config.filters.keywords,
    excludedDomains: config.filters.excludedDomains,
  });

  // Create ReadTracker
  const readTracker = new ReadTrackerImpl({
    user: config.email.username,
    password: config.email.password,
    host: config.email.imapHost,
    port: config.email.imapPort,
    tls: true,
  });

  // Create AutoResponder
  const autoResponder = new AutoResponderImpl({
    smtpConfig: {
      host: config.email.smtpHost,
      port: config.email.smtpPort,
      secure: config.email.smtpPort === 465,
      auth: {
        user: config.email.username,
        pass: config.email.password,
      },
    },
    replyTemplate: config.autoReply.replyTemplate,
    manualConfirmation: config.autoReply.manualConfirmation,
    readTracker,
    onLog: (log) => {
      // Log to database
      activityLogRepository.create(log).catch((err) => {
        console.error('Failed to log activity:', err);
      });
    },
    onReplySave: async (reply) => {
      // Save or update reply in database
      const existing = await replyRepository.getById(reply.id);
      if (existing) {
        await replyRepository.updateStatus(
          reply.id,
          reply.status,
          reply.sentAt,
          reply.approvedBy
        );
      } else {
        await replyRepository.create(reply);
      }
    },
  });

  return { messageFilter, autoResponder, readTracker };
}

/**
 * Graceful shutdown
 */
async function shutdown(): Promise<void> {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  console.log('\nShutting down gracefully...');

  try {
    // Stop EmailMonitor (will complete current email processing)
    if (emailMonitor) {
      await emailMonitor.stop();
      console.log('✓ Email monitor stopped');
    }

    // Close ConfigurationManager
    if (configManager) {
      await configManager.close();
      console.log('✓ Configuration manager closed');
    }

    // Close database connection
    if (database) {
      await database.close();
      console.log('✓ Database connection closed');
    }

    console.log('✓ Shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
}

// Signal handlers for graceful shutdown
process.on('SIGINT', () => {
  console.log('\nReceived SIGINT signal');
  shutdown();
});

process.on('SIGTERM', () => {
  console.log('\nReceived SIGTERM signal');
  shutdown();
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  shutdown();
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
  shutdown();
});

// Start the application
initialize().catch((error) => {
  console.error('Failed to start application:', error);
  process.exit(1);
});
