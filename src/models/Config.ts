export interface EmailConfig {
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
  username: string;
  password: string;
}

export interface FilterConfig {
  keywordsEnabled: boolean;
  keywords: string[];
  excludedDomains: string[];
}

export interface AutoReplyConfig {
  manualConfirmation: boolean;
  replyTemplate: string;
  checkInterval: number;
}

export interface Config {
  email: EmailConfig;
  filters: FilterConfig;
  autoReply: AutoReplyConfig;
}
