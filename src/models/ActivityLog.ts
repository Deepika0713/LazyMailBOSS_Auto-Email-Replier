export type ActivityLogType = 'reply_sent' | 'reply_failed' | 'email_filtered' | 'error';

export interface ActivityLog {
  id: string;
  timestamp: Date;
  type: ActivityLogType;
  emailId: string;
  replyId?: string;
  details: string;
  metadata?: Record<string, any>;
}
