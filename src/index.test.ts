import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Database, runMigrations } from './database';
import { ConfigurationManagerImpl } from './config';
import * as fs from 'fs';
import * as path from 'path';

describe('Main Application Integration', () => {
  const testDbPath = './test-main-app.db';
  const testConfigPath = './test-main-config.db';
  let database: Database;
  let configManager: ConfigurationManagerImpl;

  beforeEach(async () => {
    // Clean up any existing test databases
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    if (fs.existsSync(testConfigPath)) {
      fs.unlinkSync(testConfigPath);
    }

    // Initialize database
    database = Database.getInstance();
    await database.connect(testDbPath);
    await runMigrations(database);

    // Initialize configuration manager
    configManager = new ConfigurationManagerImpl(testConfigPath);
  });

  afterEach(async () => {
    // Clean up
    await database.close();
    await configManager.close();

    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    if (fs.existsSync(testConfigPath)) {
      fs.unlinkSync(testConfigPath);
    }
  });

  it('should initialize database and run migrations', async () => {
    // Verify tables exist by querying them
    const tables = await database.all<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table'",
      []
    );

    const tableNames = tables.map(t => t.name);
    expect(tableNames).toContain('config');
    expect(tableNames).toContain('activity_log');
    expect(tableNames).toContain('reply');
  });

  it('should load default configuration', async () => {
    const config = await configManager.getConfig();

    expect(config).toBeDefined();
    expect(config.email).toBeDefined();
    expect(config.filters).toBeDefined();
    expect(config.autoReply).toBeDefined();
    expect(config.autoReply.checkInterval).toBe(10);
    expect(config.autoReply.manualConfirmation).toBe(true);
  });

  it('should update configuration and trigger hot-reload', async () => {
    let reloadTriggered = false;
    let reloadedConfig = null;

    // Subscribe to configuration changes
    configManager.subscribe((config) => {
      reloadTriggered = true;
      reloadedConfig = config;
    });

    // Update configuration
    await configManager.updateConfig({
      filters: {
        keywordsEnabled: true,
        keywords: ['urgent', 'important'],
        excludedDomains: ['spam.com'],
      },
    });

    // Verify hot-reload was triggered
    expect(reloadTriggered).toBe(true);
    expect(reloadedConfig).toBeDefined();
    expect((reloadedConfig as any).filters.keywordsEnabled).toBe(true);
    expect((reloadedConfig as any).filters.keywords).toEqual(['urgent', 'important']);
  });

  it('should create components with valid configuration', async () => {
    // Update configuration with valid email settings
    await configManager.updateConfig({
      email: {
        imapHost: 'imap.example.com',
        imapPort: 993,
        smtpHost: 'smtp.example.com',
        smtpPort: 587,
        username: 'test@example.com',
        password: 'testpassword',
      },
    });

    const config = await configManager.getConfig();

    // Verify configuration is valid for component creation
    expect(config.email.imapHost).toBe('imap.example.com');
    expect(config.email.username).toBe('test@example.com');
    expect(config.email.password).toBe('testpassword');
  });
});
