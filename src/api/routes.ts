import { Router, Request, Response, NextFunction } from 'express';
import { ConfigurationManager } from '../config';
import { ActivityLogRepository } from '../database/ActivityLogRepository';
import { ReplyRepository } from '../database/ReplyRepository';
import { AutoResponder } from '../responder';
import { EmailMonitor } from '../monitor';

export interface ApiDependencies {
  configManager: ConfigurationManager;
  activityLogRepository: ActivityLogRepository;
  replyRepository: ReplyRepository;
  autoResponder: AutoResponder;
  emailMonitor?: EmailMonitor;
}

// Validation middleware
function validateConfigUpdate(req: Request, res: Response, next: NextFunction): void {
  const { email, filters, autoReply } = req.body;

  // Validate email config if provided
  if (email) {
    if (email.imapHost !== undefined && typeof email.imapHost !== 'string') {
      res.status(400).json({ error: 'Invalid imapHost: must be a string' });
      return;
    }
    if (email.imapPort !== undefined && (typeof email.imapPort !== 'number' || email.imapPort <= 0)) {
      res.status(400).json({ error: 'Invalid imapPort: must be a positive number' });
      return;
    }
    if (email.smtpHost !== undefined && typeof email.smtpHost !== 'string') {
      res.status(400).json({ error: 'Invalid smtpHost: must be a string' });
      return;
    }
    if (email.smtpPort !== undefined && (typeof email.smtpPort !== 'number' || email.smtpPort <= 0)) {
      res.status(400).json({ error: 'Invalid smtpPort: must be a positive number' });
      return;
    }
    if (email.username !== undefined && typeof email.username !== 'string') {
      res.status(400).json({ error: 'Invalid username: must be a string' });
      return;
    }
    if (email.password !== undefined && typeof email.password !== 'string') {
      res.status(400).json({ error: 'Invalid password: must be a string' });
      return;
    }
  }

  // Validate filters config if provided
  if (filters) {
    if (filters.keywordsEnabled !== undefined && typeof filters.keywordsEnabled !== 'boolean') {
      res.status(400).json({ error: 'Invalid keywordsEnabled: must be a boolean' });
      return;
    }
    if (filters.keywords !== undefined && !Array.isArray(filters.keywords)) {
      res.status(400).json({ error: 'Invalid keywords: must be an array' });
      return;
    }
    if (filters.excludedDomains !== undefined && !Array.isArray(filters.excludedDomains)) {
      res.status(400).json({ error: 'Invalid excludedDomains: must be an array' });
      return;
    }
  }

  // Validate autoReply config if provided
  if (autoReply) {
    if (autoReply.manualConfirmation !== undefined && typeof autoReply.manualConfirmation !== 'boolean') {
      res.status(400).json({ error: 'Invalid manualConfirmation: must be a boolean' });
      return;
    }
    if (autoReply.replyTemplate !== undefined && typeof autoReply.replyTemplate !== 'string') {
      res.status(400).json({ error: 'Invalid replyTemplate: must be a string' });
      return;
    }
    if (autoReply.checkInterval !== undefined && (typeof autoReply.checkInterval !== 'number' || autoReply.checkInterval <= 0)) {
      res.status(400).json({ error: 'Invalid checkInterval: must be a positive number' });
      return;
    }
  }

  next();
}

// Error handling middleware
function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
  console.error('API Error:', err);
  
  const statusCode = res.statusCode !== 200 ? res.statusCode : 500;
  res.status(statusCode).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
}

export function createApiRouter(dependencies: ApiDependencies): Router {
  const router = Router();
  const { configManager, activityLogRepository, replyRepository, autoResponder, emailMonitor } = dependencies;

  // GET /api/health - Health check endpoint for Docker/cloud deployments
  router.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    });
  });

  // GET /api/status - Get system status
  router.get('/status', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const config = await configManager.getConfig();
      const pendingReplies = await replyRepository.getByStatus('pending');
      const sentReplies = await replyRepository.getByStatus('sent');
      
      res.json({
        monitoring: emailMonitor ? true : false,
        manualConfirmationEnabled: config.autoReply.manualConfirmation,
        pendingRepliesCount: pendingReplies.length,
        totalRepliesSent: sentReplies.length,
        checkInterval: config.autoReply.checkInterval
      });
    } catch (error) {
      next(error);
    }
  });

  // GET /api/config - Get current configuration
  router.get('/config', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const config = await configManager.getConfig();
      
      // Don't send the password in the response
      const safeConfig = {
        ...config,
        email: {
          ...config.email,
          password: config.email.password ? '********' : ''
        }
      };
      
      res.json(safeConfig);
    } catch (error) {
      next(error);
    }
  });

  // PUT /api/config - Update configuration
  router.put('/config', validateConfigUpdate, async (req: Request, res: Response, next: NextFunction) => {
    try {
      await configManager.updateConfig(req.body);
      const updatedConfig = await configManager.getConfig();
      
      // Don't send the password in the response
      const safeConfig = {
        ...updatedConfig,
        email: {
          ...updatedConfig.email,
          password: updatedConfig.email.password ? '********' : ''
        }
      };
      
      res.json({
        message: 'Configuration updated successfully',
        config: safeConfig
      });
    } catch (error) {
      next(error);
    }
  });

  // GET /api/logs - Get activity logs with pagination
  router.get('/logs', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const limitParam = req.query.limit as string;
      const offsetParam = req.query.offset as string;
      
      const limit = limitParam ? parseInt(limitParam) : 100;
      const offset = offsetParam ? parseInt(offsetParam) : 0;
      
      // Validate pagination parameters
      if (isNaN(limit) || limit < 1 || limit > 1000) {
        res.status(400).json({ error: 'Invalid limit: must be between 1 and 1000' });
        return;
      }
      if (isNaN(offset) || offset < 0) {
        res.status(400).json({ error: 'Invalid offset: must be non-negative' });
        return;
      }
      
      const logs = await activityLogRepository.getAll(limit, offset);
      
      res.json({
        logs,
        pagination: {
          limit,
          offset,
          count: logs.length
        }
      });
    } catch (error) {
      next(error);
    }
  });

  // GET /api/pending-replies - Get pending replies for manual confirmation
  router.get('/pending-replies', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const pendingReplies = await replyRepository.getByStatus('pending');
      
      res.json({
        replies: pendingReplies,
        count: pendingReplies.length
      });
    } catch (error) {
      next(error);
    }
  });

  // POST /api/replies/:id/approve - Approve a pending reply
  router.post('/replies/:id/approve', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      
      // Get the reply
      const reply = await replyRepository.getById(id);
      
      if (!reply) {
        res.status(404).json({ error: 'Reply not found' });
        return;
      }
      
      if (reply.status !== 'pending') {
        res.status(400).json({ error: `Reply is not pending (current status: ${reply.status})` });
        return;
      }
      
      // Process the approval through AutoResponder
      await autoResponder.processConfirmation(id, true);
      
      res.json({
        message: 'Reply approved and sent successfully',
        replyId: id
      });
    } catch (error) {
      next(error);
    }
  });

  // POST /api/replies/:id/reject - Reject a pending reply
  router.post('/replies/:id/reject', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      
      // Get the reply
      const reply = await replyRepository.getById(id);
      
      if (!reply) {
        res.status(404).json({ error: 'Reply not found' });
        return;
      }
      
      if (reply.status !== 'pending') {
        res.status(400).json({ error: `Reply is not pending (current status: ${reply.status})` });
        return;
      }
      
      // Process the rejection through AutoResponder
      await autoResponder.processConfirmation(id, false);
      
      res.json({
        message: 'Reply rejected successfully',
        replyId: id
      });
    } catch (error) {
      next(error);
    }
  });

  // Apply error handling middleware
  router.use(errorHandler);

  return router;
}
