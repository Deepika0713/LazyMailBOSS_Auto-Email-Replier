export type ReplyStatus = 'pending' | 'approved' | 'rejected' | 'sent' | 'failed';

export interface Reply {
  id: string;
  originalEmailId: string;
  to: string;
  subject: string;
  body: string;
  generatedAt: Date;
  status: ReplyStatus;
  sentAt?: Date;
  approvedBy?: string;
}
