import { Database } from './connection';
import { Config } from '../models/Config';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default-key-change-in-production-32';
const ALGORITHM = 'aes-256-cbc';

function encrypt(text: string): string {
  const iv = randomBytes(16);
  const key = Buffer.from(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32));
  const cipher = createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decrypt(text: string): string {
  const parts = text.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const encryptedText = parts[1];
  const key = Buffer.from(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32));
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

interface ConfigRow {
  id: number;
  imap_host: string;
  imap_port: number;
  smtp_host: string;
  smtp_port: number;
  username: string;
  password: string;
  keywords_enabled: number;
  keywords: string;
  excluded_domains: string;
  manual_confirmation: number;
  reply_template: string;
  check_interval: number;
  updated_at: string;
}

export class ConfigRepository {
  constructor(private db: Database) {}

  async getConfig(): Promise<Config | null> {
    const row = await this.db.get<ConfigRow>(
      'SELECT * FROM config WHERE id = 1'
    );

    if (!row) return null;

    return {
      email: {
        imapHost: row.imap_host,
        imapPort: row.imap_port,
        smtpHost: row.smtp_host,
        smtpPort: row.smtp_port,
        username: row.username,
        password: decrypt(row.password),
      },
      filters: {
        keywordsEnabled: row.keywords_enabled === 1,
        keywords: JSON.parse(row.keywords),
        excludedDomains: JSON.parse(row.excluded_domains),
      },
      autoReply: {
        manualConfirmation: row.manual_confirmation === 1,
        replyTemplate: row.reply_template,
        checkInterval: row.check_interval,
      },
    };
  }

  async saveConfig(config: Config): Promise<void> {
    const encryptedPassword = encrypt(config.email.password);

    await this.db.run(
      `INSERT OR REPLACE INTO config (
        id, imap_host, imap_port, smtp_host, smtp_port, username, password,
        keywords_enabled, keywords, excluded_domains,
        manual_confirmation, reply_template, check_interval, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [
        1,
        config.email.imapHost,
        config.email.imapPort,
        config.email.smtpHost,
        config.email.smtpPort,
        config.email.username,
        encryptedPassword,
        config.filters.keywordsEnabled ? 1 : 0,
        JSON.stringify(config.filters.keywords),
        JSON.stringify(config.filters.excludedDomains),
        config.autoReply.manualConfirmation ? 1 : 0,
        config.autoReply.replyTemplate,
        config.autoReply.checkInterval,
      ]
    );
  }

  async updateConfig(updates: Partial<Config>): Promise<void> {
    const current = await this.getConfig();
    if (!current) {
      throw new Error('No configuration exists to update');
    }

    const merged: Config = {
      email: { ...current.email, ...updates.email },
      filters: { ...current.filters, ...updates.filters },
      autoReply: { ...current.autoReply, ...updates.autoReply },
    };

    await this.saveConfig(merged);
  }
}
