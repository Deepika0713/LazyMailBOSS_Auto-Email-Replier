import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// Load .env file if it exists
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

/**
 * Environment configuration with validation
 */
export interface EnvConfig {
  // Server
  port: number;
  nodeEnv: string;
  
  // Security
  encryptionKey: string;
  
  // Database
  databasePath: string;
  configDatabasePath: string;
  
  // Logging
  logLevel: string;
  
  // Optional email configuration
  email?: {
    imapHost?: string;
    imapPort?: number;
    imapUser?: string;
    imapPassword?: string;
    smtpHost?: string;
    smtpPort?: number;
    smtpUser?: string;
    smtpPassword?: string;
  };
  
  // Optional auto-reply configuration
  autoReply?: {
    checkInterval?: number;
    manualConfirmation?: boolean;
    replyTemplate?: string;
  };
  
  // Optional filter configuration
  filters?: {
    keywordsEnabled?: boolean;
    keywords?: string[];
    excludedDomains?: string[];
  };
}

/**
 * Parse boolean from environment variable
 */
function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (!value) return defaultValue;
  return value.toLowerCase() === 'true' || value === '1';
}

/**
 * Parse integer from environment variable
 */
function parseInteger(value: string | undefined, defaultValue: number): number {
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) return defaultValue;
  return parsed;
}

/**
 * Parse comma-separated list from environment variable
 */
function parseList(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  return value.split(',').map(item => item.trim()).filter(item => item.length > 0);
}

/**
 * Validate required environment variables
 */
function validateRequiredEnvVars(): void {
  const errors: string[] = [];
  
  // ENCRYPTION_KEY is required in production
  if (process.env.NODE_ENV === 'production' && !process.env.ENCRYPTION_KEY) {
    errors.push('ENCRYPTION_KEY is required in production environment');
  }
  
  // Warn if using default encryption key
  if (process.env.ENCRYPTION_KEY === 'change-this-to-a-secure-random-key-in-production') {
    console.warn('⚠️  WARNING: Using default ENCRYPTION_KEY. Please set a secure key in production!');
  }
  
  if (errors.length > 0) {
    throw new Error(`Environment validation failed:\n${errors.join('\n')}`);
  }
}

/**
 * Load and validate environment configuration
 */
export function loadEnvConfig(): EnvConfig {
  // Validate required variables
  validateRequiredEnvVars();
  
  const config: EnvConfig = {
    // Server configuration
    port: parseInteger(process.env.PORT, 3000),
    nodeEnv: process.env.NODE_ENV || 'development',
    
    // Security configuration
    encryptionKey: process.env.ENCRYPTION_KEY || 'default-key-change-in-production',
    
    // Database configuration
    databasePath: process.env.DATABASE_PATH || './data/lazymail.db',
    configDatabasePath: process.env.CONFIG_DATABASE_PATH || './data/config.db',
    
    // Logging configuration
    logLevel: process.env.LOG_LEVEL || 'info',
  };
  
  // Optional email configuration
  if (process.env.IMAP_HOST || process.env.SMTP_HOST) {
    config.email = {
      imapHost: process.env.IMAP_HOST,
      imapPort: parseInteger(process.env.IMAP_PORT, 993),
      imapUser: process.env.IMAP_USER,
      imapPassword: process.env.IMAP_PASSWORD,
      smtpHost: process.env.SMTP_HOST,
      smtpPort: parseInteger(process.env.SMTP_PORT, 587),
      smtpUser: process.env.SMTP_USER,
      smtpPassword: process.env.SMTP_PASSWORD,
    };
  }
  
  // Optional auto-reply configuration
  if (process.env.CHECK_INTERVAL || process.env.MANUAL_CONFIRMATION || process.env.REPLY_TEMPLATE) {
    config.autoReply = {
      checkInterval: parseInteger(process.env.CHECK_INTERVAL, 10),
      manualConfirmation: parseBoolean(process.env.MANUAL_CONFIRMATION, true),
      replyTemplate: process.env.REPLY_TEMPLATE,
    };
  }
  
  // Optional filter configuration
  if (process.env.KEYWORDS_ENABLED || process.env.KEYWORDS || process.env.EXCLUDED_DOMAINS) {
    config.filters = {
      keywordsEnabled: parseBoolean(process.env.KEYWORDS_ENABLED, false),
      keywords: parseList(process.env.KEYWORDS),
      excludedDomains: parseList(process.env.EXCLUDED_DOMAINS),
    };
  }
  
  return config;
}

/**
 * Get environment configuration (singleton)
 */
let cachedConfig: EnvConfig | null = null;

export function getEnvConfig(): EnvConfig {
  if (!cachedConfig) {
    cachedConfig = loadEnvConfig();
  }
  return cachedConfig;
}

/**
 * Print configuration summary (without sensitive data)
 */
export function printConfigSummary(config: EnvConfig): void {
  console.log('Configuration Summary:');
  console.log(`  Environment: ${config.nodeEnv}`);
  console.log(`  Port: ${config.port}`);
  console.log(`  Database: ${config.databasePath}`);
  console.log(`  Config DB: ${config.configDatabasePath}`);
  console.log(`  Log Level: ${config.logLevel}`);
  console.log(`  Encryption Key: ${config.encryptionKey ? '***configured***' : 'not set'}`);
  
  if (config.email) {
    console.log('  Email Configuration:');
    console.log(`    IMAP: ${config.email.imapHost || 'not set'}:${config.email.imapPort || 'not set'}`);
    console.log(`    SMTP: ${config.email.smtpHost || 'not set'}:${config.email.smtpPort || 'not set'}`);
    console.log(`    User: ${config.email.imapUser ? '***configured***' : 'not set'}`);
  }
  
  if (config.autoReply) {
    console.log('  Auto-Reply Configuration:');
    console.log(`    Check Interval: ${config.autoReply.checkInterval}s`);
    console.log(`    Manual Confirmation: ${config.autoReply.manualConfirmation}`);
  }
  
  if (config.filters) {
    console.log('  Filter Configuration:');
    console.log(`    Keywords Enabled: ${config.filters.keywordsEnabled}`);
    if (config.filters.keywords) {
      console.log(`    Keywords: ${config.filters.keywords.length} configured`);
    }
    if (config.filters.excludedDomains) {
      console.log(`    Excluded Domains: ${config.filters.excludedDomains.length} configured`);
    }
  }
}
