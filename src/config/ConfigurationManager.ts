import { Config } from '../models';
import * as crypto from 'crypto';
import * as sqlite3 from 'sqlite3';

export interface ConfigurationManager {
  getConfig(): Promise<Config>;
  updateConfig(updates: Partial<Config>): Promise<void>;
  subscribe(listener: (config: Config) => void): void;
}

type ConfigListener = (config: Config) => void;

export class ConfigurationManagerImpl implements ConfigurationManager {
  private db: sqlite3.Database;
  private listeners: ConfigListener[] = [];
  private encryptionKey: Buffer;
  private algorithm = 'aes-256-cbc';
  private currentConfig: Config | null = null;

  private dbReady: Promise<void>;

  constructor(dbPath: string = './config.db', encryptionKey?: string) {
    this.db = new sqlite3.Database(dbPath);
    
    // Use provided key or generate from environment variable
    const keyString = encryptionKey || process.env.ENCRYPTION_KEY || 'default-key-change-in-production';
    this.encryptionKey = crypto.scryptSync(keyString, 'salt', 32);
    
    this.dbReady = this.initializeDatabase();
  }

  private async initializeDatabase(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(`
        CREATE TABLE IF NOT EXISTS config (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          data TEXT NOT NULL
        )
      `, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  private encrypt(text: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm, this.encryptionKey, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  }

  private decrypt(encryptedText: string): string {
    const parts = encryptedText.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    const decipher = crypto.createDecipheriv(this.algorithm, this.encryptionKey, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  private validateConfig(config: Partial<Config>): void {
    if (config.email) {
      if (config.email.imapHost && typeof config.email.imapHost !== 'string') {
        throw new Error('Invalid imapHost: must be a string');
      }
      if (config.email.imapPort && (typeof config.email.imapPort !== 'number' || config.email.imapPort <= 0)) {
        throw new Error('Invalid imapPort: must be a positive number');
      }
      if (config.email.smtpHost && typeof config.email.smtpHost !== 'string') {
        throw new Error('Invalid smtpHost: must be a string');
      }
      if (config.email.smtpPort && (typeof config.email.smtpPort !== 'number' || config.email.smtpPort <= 0)) {
        throw new Error('Invalid smtpPort: must be a positive number');
      }
      if (config.email.username && typeof config.email.username !== 'string') {
        throw new Error('Invalid username: must be a string');
      }
      if (config.email.password && typeof config.email.password !== 'string') {
        throw new Error('Invalid password: must be a string');
      }
    }

    if (config.filters) {
      if (config.filters.keywordsEnabled !== undefined && typeof config.filters.keywordsEnabled !== 'boolean') {
        throw new Error('Invalid keywordsEnabled: must be a boolean');
      }
      if (config.filters.keywords && !Array.isArray(config.filters.keywords)) {
        throw new Error('Invalid keywords: must be an array');
      }
      if (config.filters.excludedDomains && !Array.isArray(config.filters.excludedDomains)) {
        throw new Error('Invalid excludedDomains: must be an array');
      }
    }

    if (config.autoReply) {
      if (config.autoReply.manualConfirmation !== undefined && typeof config.autoReply.manualConfirmation !== 'boolean') {
        throw new Error('Invalid manualConfirmation: must be a boolean');
      }
      if (config.autoReply.replyTemplate && typeof config.autoReply.replyTemplate !== 'string') {
        throw new Error('Invalid replyTemplate: must be a string');
      }
      if (config.autoReply.checkInterval && (typeof config.autoReply.checkInterval !== 'number' || config.autoReply.checkInterval <= 0)) {
        throw new Error('Invalid checkInterval: must be a positive number');
      }
    }
  }

  async getConfig(): Promise<Config> {
    await this.dbReady;
    
    if (this.currentConfig) {
      return this.currentConfig;
    }

    return new Promise((resolve, reject) => {
      this.db.get('SELECT data FROM config WHERE id = 1', (err, row: any) => {
        if (err) {
          reject(err);
          return;
        }

        if (!row) {
          // Return default config if none exists
          const defaultConfig: Config = {
            email: {
              imapHost: '',
              imapPort: 993,
              smtpHost: '',
              smtpPort: 587,
              username: '',
              password: ''
            },
            filters: {
              keywordsEnabled: false,
              keywords: [],
              excludedDomains: []
            },
            autoReply: {
              manualConfirmation: true,
              replyTemplate: 'Thank you for your email. I will respond shortly.',
              checkInterval: 10
            }
          };
          this.currentConfig = defaultConfig;
          resolve(defaultConfig);
          return;
        }

        try {
          const decrypted = this.decrypt(row.data);
          const config = JSON.parse(decrypted);
          this.currentConfig = config;
          resolve(config);
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  async updateConfig(updates: Partial<Config>): Promise<void> {
    await this.dbReady;
    
    // Validate the updates
    this.validateConfig(updates);

    // Get current config and merge with updates
    const currentConfig = await this.getConfig();
    const newConfig: Config = {
      email: { ...currentConfig.email, ...updates.email },
      filters: { ...currentConfig.filters, ...updates.filters },
      autoReply: { ...currentConfig.autoReply, ...updates.autoReply }
    };

    // Encrypt and save
    const encrypted = this.encrypt(JSON.stringify(newConfig));

    return new Promise((resolve, reject) => {
      this.db.run(
        'INSERT OR REPLACE INTO config (id, data) VALUES (1, ?)',
        [encrypted],
        (err) => {
          if (err) {
            reject(err);
            return;
          }

          // Update cached config
          this.currentConfig = newConfig;

          // Notify all subscribers
          this.notifyListeners(newConfig);

          resolve();
        }
      );
    });
  }

  subscribe(listener: ConfigListener): void {
    this.listeners.push(listener);
  }

  private notifyListeners(config: Config): void {
    for (const listener of this.listeners) {
      try {
        listener(config);
      } catch (error) {
        console.error('Error notifying config listener:', error);
      }
    }
  }

  async close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}
