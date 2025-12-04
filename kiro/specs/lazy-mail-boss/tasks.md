# Implementation Plan

- [x] 1. Set up project structure and dependencies





  - Create Node.js/TypeScript project with package.json
  - Install dependencies: imap, nodemailer, express, fast-check, sqlite3/pg
  - Configure TypeScript with strict mode
  - Set up directory structure: src/{monitor, filter, responder, config, api, models}
  - _Requirements: All_

- [x] 2. Implement core data models and types





  - Create TypeScript interfaces for Email, Reply, ActivityLog, Config
  - Implement validation functions for email addresses and configuration
  - Create type guards for runtime type checking
  - _Requirements: 1.2, 2.1, 6.2_

- [x] 2.1 Write property test for email metadata completeness


  - **Property 2: Email metadata completeness**
  - **Validates: Requirements 1.2**

- [x] 3. Implement Configuration Manager




  - Create ConfigurationManager class with database persistence
  - Implement credential encryption/decryption using crypto module
  - Add configuration validation logic
  - Implement subscriber pattern for hot-reload notifications
  - _Requirements: 6.2, 6.3, 6.4, 6.7, 8.3_

- [x] 3.1 Write property test for credential encryption


  - **Property 18: Credential encryption at rest**
  - **Validates: Requirements 6.2**

- [x] 3.2 Write property test for configuration hot-reload


  - **Property 17: Configuration hot-reload**
  - **Validates: Requirements 5.4, 6.3, 6.4, 6.7, 8.3**

- [x] 4. Implement Message Filter components




  - Create KeywordMatcher class with case-insensitive search
  - Create DomainFilter class with domain extraction logic
  - Create MessageFilter class that coordinates keyword and domain filtering
  - Implement filter decision logic with reason tracking
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 5.1, 5.2, 5.3_

- [x] 4.1 Write property test for domain extraction


  - **Property 15: Domain extraction correctness**
  - **Validates: Requirements 5.1**

- [x] 4.2 Write property test for keyword matching


  - **Property 12: Keyword matching in subject and body**
  - **Validates: Requirements 4.1**

- [x] 4.3 Write property test for keyword filter logic


  - **Property 13: Keyword filter approval logic**
  - **Validates: Requirements 4.2, 4.3**

- [x] 4.4 Write property test for keyword filter bypass


  - **Property 14: Keyword filter bypass**
  - **Validates: Requirements 4.4**

- [x] 4.5 Write property test for domain exclusion


  - **Property 16: Domain exclusion logic**
  - **Validates: Requirements 5.2, 5.3**

- [x] 5. Implement Read Tracker





  - Create ReadTracker class with IMAP integration
  - Implement markAsRead method using IMAP flags
  - Implement isRead query method
  - Add error handling for IMAP operations
  - _Requirements: 3.1, 3.2, 3.4_

- [x] 5.1 Write property test for read status persistence


  - **Property 10: Read status persistence**
  - **Validates: Requirements 3.1, 3.4**

- [x] 5.2 Write property test for unread filtering


  - **Property 11: Unread email filtering**
  - **Validates: Requirements 3.2**

- [x] 6. Implement Auto Responder



  - Create AutoResponder class with reply generation logic
  - Implement template-based reply generation
  - Add SMTP integration using nodemailer
  - Implement manual confirmation queue (in-memory cache)
  - Add approval/rejection workflow methods
  - Implement transaction logging
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_

- [x] 6.1 Write property test for reply generation


  - **Property 4: Reply generation for filtered emails**
  - **Validates: Requirements 2.1**


- [x] 6.2 Write property test for manual confirmation queuing

  - **Property 5: Manual confirmation queuing**
  - **Validates: Requirements 2.2**

- [x] 6.3 Write property test for read marking after processing


  - **Property 6: Email marked as read after processing**
  - **Validates: Requirements 2.3, 2.4**


- [x] 6.4 Write property test for automatic sending

  - **Property 7: Automatic sending in auto mode**
  - **Validates: Requirements 2.5**

- [x] 6.5 Write property test for transaction logging


  - **Property 8: Transaction logging completeness**
  - **Validates: Requirements 2.6**

- [x] 6.6 Write property test for error logging


  - **Property 9: Error logging and continuation**
  - **Validates: Requirements 2.7**

- [x] 7. Implement Email Monitor





  - Create EmailMonitor class with IMAP connection management
  - Implement 10-second polling loop using setInterval
  - Add inbox checking logic to retrieve unread emails
  - Implement processing pipeline: retrieve → filter → respond → mark read
  - Add connection retry logic with error handling
  - Implement graceful shutdown with in-progress email completion
  - _Requirements: 1.1, 1.2, 1.3, 7.1, 7.2, 7.3, 7.4_

- [x] 7.1 Write property test for monitoring interval


  - **Property 1: Monitoring interval consistency**
  - **Validates: Requirements 1.1**

- [x] 7.2 Write property test for connection retry


  - **Property 3: Connection retry on failure**
  - **Validates: Requirements 1.3**

- [x] 7.3 Write property test for continuous monitoring

  - **Property 21: Continuous monitoring operation**
  - **Validates: Requirements 7.2, 7.3**

- [x] 7.4 Write property test for graceful shutdown


  - **Property 22: Graceful shutdown**
  - **Validates: Requirements 7.4**

- [x] 8. Checkpoint - Ensure all tests pass





  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Implement database layer






  - Create database schema for Config, ActivityLog, and Reply tables
  - Implement database connection with connection pooling
  - Create repository classes for each entity
  - Add migration scripts for schema setup
  - _Requirements: 2.6, 6.2, 8.4_

- [x] 9.1 Write property test for log persistence





  - **Property 23: Log persistence and accessibility**
  - **Validates: Requirements 8.4**

- [x] 10. Implement REST API for Web Dashboard








  - Create Express server with route handlers
  - Implement GET /api/status endpoint
  - Implement GET /api/config and PUT /api/config endpoints
  - Implement GET /api/logs endpoint with pagination
  - Implement GET /api/pending-replies endpoint
  - Implement POST /api/replies/:id/approve and POST /api/replies/:id/reject endpoints
  - Add input validation middleware
  - Add error handling middleware
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7_

- [x] 10.1 Write property test for activity log display


  - **Property 19: Activity log display completeness**
  - **Validates: Requirements 6.5**


- [x] 10.2 Write property test for pending reply display






  - **Property 20: Pending reply display**
  - **Validates: Requirements 6.6**

- [x] 10.3 Write unit tests for API endpoints





  - Test status endpoint returns correct format
  - Test config validation and error responses
  - Test pagination in logs endpoint
  - Test approval/rejection workflow via API
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7_

- [x] 11. Implement Web Dashboard UI




  - Create HTML/CSS/JavaScript frontend
  - Build status display component showing monitoring state and reply count
  - Build configuration form for email credentials, keywords, and excluded domains
  - Build activity log viewer with pagination
  - Build pending replies list with approve/reject buttons
  - Add manual confirmation mode toggle
  - Implement API client for backend communication
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7_

- [x] 12. Wire components together in main application





  - Create main application entry point
  - Initialize ConfigurationManager and load config
  - Initialize database connection
  - Create and wire EmailMonitor, MessageFilter, AutoResponder, ReadTracker
  - Start API server
  - Start EmailMonitor
  - Add signal handlers for graceful shutdown
  - _Requirements: All_

- [x] 13. Add environment-based configuration





  - Create .env.example file with all required variables
  - Implement environment variable loading
  - Add validation for required environment variables
  - Document configuration options in README
  - _Requirements: 6.2, 8.1, 8.2_

- [x] 14. Create Docker deployment setup





  - Create Dockerfile for application
  - Create docker-compose.yml for local development
  - Add health check endpoint
  - Configure environment variables for container
  - Add startup script for cloud deployment
  - _Requirements: 8.1, 8.2, 8.3_

- [x] 14.1 Write integration tests for full workflow


  - Test complete auto-reply workflow with test IMAP/SMTP server
  - Test manual confirmation workflow end-to-end
  - Test configuration hot-reload across components
  - Test system restart and recovery
  - _Requirements: All_

- [ ] 15. Final Checkpoint - Ensure all tests pass







  - Ensure all tests pass, ask the user if questions arise.
