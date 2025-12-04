import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadEnvConfig } from './env';

describe('Environment Configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment before each test
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  it('should load default configuration when no env vars are set', () => {
    // Clear relevant env vars
    delete process.env.PORT;
    delete process.env.NODE_ENV;
    delete process.env.ENCRYPTION_KEY;

    const config = loadEnvConfig();

    expect(config.port).toBe(3000);
    expect(config.nodeEnv).toBe('development');
    expect(config.databasePath).toBe('./data/lazymail.db');
    expect(config.configDatabasePath).toBe('./data/config.db');
    expect(config.logLevel).toBe('info');
  });

  it('should load custom port from environment', () => {
    process.env.PORT = '8080';

    const config = loadEnvConfig();

    expect(config.port).toBe(8080);
  });

  it('should load custom database paths from environment', () => {
    process.env.DATABASE_PATH = '/custom/path/db.db';
    process.env.CONFIG_DATABASE_PATH = '/custom/path/config.db';

    const config = loadEnvConfig();

    expect(config.databasePath).toBe('/custom/path/db.db');
    expect(config.configDatabasePath).toBe('/custom/path/config.db');
  });

  it('should load email configuration when IMAP_HOST is set', () => {
    process.env.IMAP_HOST = 'imap.example.com';
    process.env.IMAP_PORT = '993';
    process.env.IMAP_USER = 'user@example.com';
    process.env.IMAP_PASSWORD = 'password123';
    process.env.SMTP_HOST = 'smtp.example.com';
    process.env.SMTP_PORT = '587';

    const config = loadEnvConfig();

    expect(config.email).toBeDefined();
    expect(config.email?.imapHost).toBe('imap.example.com');
    expect(config.email?.imapPort).toBe(993);
    expect(config.email?.imapUser).toBe('user@example.com');
    expect(config.email?.imapPassword).toBe('password123');
    expect(config.email?.smtpHost).toBe('smtp.example.com');
    expect(config.email?.smtpPort).toBe(587);
  });

  it('should not include email config when no email env vars are set', () => {
    delete process.env.IMAP_HOST;
    delete process.env.SMTP_HOST;

    const config = loadEnvConfig();

    expect(config.email).toBeUndefined();
  });

  it('should load auto-reply configuration from environment', () => {
    process.env.CHECK_INTERVAL = '30';
    process.env.MANUAL_CONFIRMATION = 'false';
    process.env.REPLY_TEMPLATE = 'Custom template';

    const config = loadEnvConfig();

    expect(config.autoReply).toBeDefined();
    expect(config.autoReply?.checkInterval).toBe(30);
    expect(config.autoReply?.manualConfirmation).toBe(false);
    expect(config.autoReply?.replyTemplate).toBe('Custom template');
  });

  it('should parse boolean values correctly', () => {
    process.env.MANUAL_CONFIRMATION = 'true';
    process.env.KEYWORDS_ENABLED = '1';

    const config = loadEnvConfig();

    expect(config.autoReply?.manualConfirmation).toBe(true);
    expect(config.filters?.keywordsEnabled).toBe(true);
  });

  it('should parse comma-separated lists correctly', () => {
    process.env.KEYWORDS = 'urgent, important, meeting';
    process.env.EXCLUDED_DOMAINS = 'noreply.com, spam.com';

    const config = loadEnvConfig();

    expect(config.filters?.keywords).toEqual(['urgent', 'important', 'meeting']);
    expect(config.filters?.excludedDomains).toEqual(['noreply.com', 'spam.com']);
  });

  it('should load filter configuration from environment', () => {
    process.env.KEYWORDS_ENABLED = 'true';
    process.env.KEYWORDS = 'test,demo';
    process.env.EXCLUDED_DOMAINS = 'example.com';

    const config = loadEnvConfig();

    expect(config.filters).toBeDefined();
    expect(config.filters?.keywordsEnabled).toBe(true);
    expect(config.filters?.keywords).toEqual(['test', 'demo']);
    expect(config.filters?.excludedDomains).toEqual(['example.com']);
  });

  it('should use encryption key from environment', () => {
    process.env.ENCRYPTION_KEY = 'my-secure-key-123';

    const config = loadEnvConfig();

    expect(config.encryptionKey).toBe('my-secure-key-123');
  });

  it('should throw error when ENCRYPTION_KEY is missing in production', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.ENCRYPTION_KEY;

    expect(() => loadEnvConfig()).toThrow('ENCRYPTION_KEY is required in production');
  });

  it('should allow missing ENCRYPTION_KEY in development', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.ENCRYPTION_KEY;

    expect(() => loadEnvConfig()).not.toThrow();
  });

  it('should handle invalid port gracefully', () => {
    process.env.PORT = 'invalid';

    const config = loadEnvConfig();

    expect(config.port).toBe(3000); // Falls back to default
  });

  it('should handle invalid check interval gracefully', () => {
    process.env.CHECK_INTERVAL = 'invalid';

    const config = loadEnvConfig();

    expect(config.autoReply?.checkInterval).toBe(10); // Falls back to default
  });
});
