import { Email } from './Email';
import { Reply } from './Reply';
import { ActivityLog } from './ActivityLog';
import { Config, EmailConfig, FilterConfig, AutoReplyConfig } from './Config';

/**
 * Email address validation using RFC 5322 simplified pattern
 */
export function isValidEmail(email: string): boolean {
  if (!email || typeof email !== 'string') {
    return false;
  }
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validates that a port number is within valid range
 */
export function isValidPort(port: number): boolean {
  return Number.isInteger(port) && port > 0 && port <= 65535;
}

/**
 * Validates EmailConfig object
 */
export function isValidEmailConfig(config: any): config is EmailConfig {
  return (
    config !== null &&
    typeof config === 'object' &&
    typeof config.imapHost === 'string' &&
    config.imapHost.length > 0 &&
    isValidPort(config.imapPort) &&
    typeof config.smtpHost === 'string' &&
    config.smtpHost.length > 0 &&
    isValidPort(config.smtpPort) &&
    typeof config.username === 'string' &&
    config.username.length > 0 &&
    typeof config.password === 'string' &&
    config.password.length > 0
  );
}

/**
 * Validates FilterConfig object
 */
export function isValidFilterConfig(config: any): config is FilterConfig {
  return (
    config !== null &&
    typeof config === 'object' &&
    typeof config.keywordsEnabled === 'boolean' &&
    Array.isArray(config.keywords) &&
    config.keywords.every((k: any) => typeof k === 'string') &&
    Array.isArray(config.excludedDomains) &&
    config.excludedDomains.every((d: any) => typeof d === 'string')
  );
}

/**
 * Validates AutoReplyConfig object
 */
export function isValidAutoReplyConfig(config: any): config is AutoReplyConfig {
  return (
    config !== null &&
    typeof config === 'object' &&
    typeof config.manualConfirmation === 'boolean' &&
    typeof config.replyTemplate === 'string' &&
    config.replyTemplate.length > 0 &&
    typeof config.checkInterval === 'number' &&
    config.checkInterval > 0
  );
}

/**
 * Validates complete Config object
 */
export function isValidConfig(config: any): config is Config {
  return (
    config !== null &&
    typeof config === 'object' &&
    isValidEmailConfig(config.email) &&
    isValidFilterConfig(config.filters) &&
    isValidAutoReplyConfig(config.autoReply)
  );
}

/**
 * Type guard for Email object
 */
export function isEmail(obj: any): obj is Email {
  return (
    obj !== null &&
    typeof obj === 'object' &&
    typeof obj.id === 'string' &&
    obj.id.length > 0 &&
    typeof obj.from === 'string' &&
    isValidEmail(obj.from) &&
    typeof obj.to === 'string' &&
    isValidEmail(obj.to) &&
    typeof obj.subject === 'string' &&
    typeof obj.body === 'string' &&
    obj.receivedAt instanceof Date &&
    typeof obj.isRead === 'boolean'
  );
}

/**
 * Type guard for Reply object
 */
export function isReply(obj: any): obj is Reply {
  const validStatuses = ['pending', 'approved', 'rejected', 'sent', 'failed'];
  
  return (
    obj !== null &&
    typeof obj === 'object' &&
    typeof obj.id === 'string' &&
    obj.id.length > 0 &&
    typeof obj.originalEmailId === 'string' &&
    obj.originalEmailId.length > 0 &&
    typeof obj.to === 'string' &&
    isValidEmail(obj.to) &&
    typeof obj.subject === 'string' &&
    typeof obj.body === 'string' &&
    obj.generatedAt instanceof Date &&
    validStatuses.includes(obj.status) &&
    (obj.sentAt === undefined || obj.sentAt instanceof Date) &&
    (obj.approvedBy === undefined || typeof obj.approvedBy === 'string')
  );
}

/**
 * Type guard for ActivityLog object
 */
export function isActivityLog(obj: any): obj is ActivityLog {
  const validTypes = ['reply_sent', 'reply_failed', 'email_filtered', 'error'];
  
  return (
    obj !== null &&
    typeof obj === 'object' &&
    typeof obj.id === 'string' &&
    obj.id.length > 0 &&
    obj.timestamp instanceof Date &&
    validTypes.includes(obj.type) &&
    typeof obj.emailId === 'string' &&
    obj.emailId.length > 0 &&
    (obj.replyId === undefined || typeof obj.replyId === 'string') &&
    typeof obj.details === 'string' &&
    (obj.metadata === undefined || 
     (typeof obj.metadata === 'object' && obj.metadata !== null))
  );
}
