# LazyMailBOSS Deployment Guide

This guide covers deploying LazyMailBOSS using Docker in various environments.

## Table of Contents

- [Local Development with Docker](#local-development-with-docker)
- [Production Deployment](#production-deployment)
- [Cloud Platform Deployment](#cloud-platform-deployment)
- [Environment Variables](#environment-variables)
- [Health Checks](#health-checks)

## Local Development with Docker

### Prerequisites

- Docker and Docker Compose installed
- `.env` file configured (copy from `.env.example`)

### Quick Start

1. **Clone the repository and navigate to the project directory**

2. **Create your `.env` file:**
   ```bash
   cp .env.example .env
   ```

3. **Generate a secure encryption key:**
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
   
   Add this to your `.env` file as `ENCRYPTION_KEY`

4. **Start the application:**
   ```bash
   docker-compose up -d
   ```

5. **Access the dashboard:**
   Open http://localhost:3000 in your browser

6. **View logs:**
   ```bash
   docker-compose logs -f lazymail
   ```

7. **Stop the application:**
   ```bash
   docker-compose down
   ```

### Rebuilding After Code Changes

```bash
docker-compose up -d --build
```

## Production Deployment

### Building the Docker Image

```bash
docker build -t lazymail-boss:latest .
```

### Running the Container

```bash
docker run -d \
  --name lazymail-boss \
  -p 3000:3000 \
  -e ENCRYPTION_KEY="your-secure-key-here" \
  -e IMAP_HOST="imap.gmail.com" \
  -e IMAP_PORT=993 \
  -e IMAP_USER="your-email@gmail.com" \
  -e IMAP_PASSWORD="your-app-password" \
  -e SMTP_HOST="smtp.gmail.com" \
  -e SMTP_PORT=587 \
  -v lazymail-data:/app/data \
  lazymail-boss:latest
```

### Using the Startup Script

The startup script validates environment variables and provides better logging:

```bash
docker run -d \
  --name lazymail-boss \
  -p 3000:3000 \
  -e ENCRYPTION_KEY="your-secure-key-here" \
  -v lazymail-data:/app/data \
  --entrypoint /bin/sh \
  lazymail-boss:latest \
  /app/start.sh
```

## Cloud Platform Deployment

### AWS ECS/Fargate

1. **Push image to ECR:**
   ```bash
   aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <account-id>.dkr.ecr.us-east-1.amazonaws.com
   docker tag lazymail-boss:latest <account-id>.dkr.ecr.us-east-1.amazonaws.com/lazymail-boss:latest
   docker push <account-id>.dkr.ecr.us-east-1.amazonaws.com/lazymail-boss:latest
   ```

2. **Create ECS Task Definition** with:
   - Container image: Your ECR image URL
   - Port mappings: 3000
   - Environment variables (see below)
   - Health check: `/api/health`
   - Mount EFS volume for `/app/data` (for persistence)

3. **Create ECS Service** with:
   - Load balancer (optional)
   - Auto-scaling (optional)
   - CloudWatch logs

### Google Cloud Run

1. **Build and push to Google Container Registry:**
   ```bash
   gcloud builds submit --tag gcr.io/PROJECT-ID/lazymail-boss
   ```

2. **Deploy to Cloud Run:**
   ```bash
   gcloud run deploy lazymail-boss \
     --image gcr.io/PROJECT-ID/lazymail-boss \
     --platform managed \
     --region us-central1 \
     --allow-unauthenticated \
     --set-env-vars ENCRYPTION_KEY=your-key-here \
     --port 3000
   ```

### Heroku

1. **Create a `heroku.yml` file:**
   ```yaml
   build:
     docker:
       web: Dockerfile
   ```

2. **Deploy:**
   ```bash
   heroku create your-app-name
   heroku stack:set container
   heroku config:set ENCRYPTION_KEY=your-key-here
   git push heroku main
   ```

### DigitalOcean App Platform

1. **Create app from Docker Hub or GitHub**
2. **Configure environment variables** in the App Platform dashboard
3. **Set health check path:** `/api/health`
4. **Deploy**

## Environment Variables

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `ENCRYPTION_KEY` | Encryption key for credentials | Generate with crypto |

### Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | 3000 |
| `NODE_ENV` | Environment | production |
| `DATABASE_PATH` | Main database path | /app/data/lazymail.db |
| `CONFIG_DATABASE_PATH` | Config database path | /app/data/config.db |
| `IMAP_HOST` | IMAP server hostname | - |
| `IMAP_PORT` | IMAP server port | 993 |
| `IMAP_USER` | Email username | - |
| `IMAP_PASSWORD` | Email password | - |
| `SMTP_HOST` | SMTP server hostname | - |
| `SMTP_PORT` | SMTP server port | 587 |
| `CHECK_INTERVAL` | Check interval (seconds) | 10 |
| `MANUAL_CONFIRMATION` | Require manual approval | true |
| `REPLY_TEMPLATE` | Default reply template | - |
| `KEYWORDS_ENABLED` | Enable keyword filtering | false |
| `KEYWORDS` | Comma-separated keywords | - |
| `EXCLUDED_DOMAINS` | Comma-separated domains | - |
| `LOG_LEVEL` | Logging level | info |

## Health Checks

The application exposes a health check endpoint at `/api/health`.

### Health Check Response

```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "uptime": 3600.5
}
```

### Docker Health Check

The Dockerfile includes a built-in health check:
- **Interval:** 30 seconds
- **Timeout:** 10 seconds
- **Start period:** 40 seconds
- **Retries:** 3

### Kubernetes Health Check Example

```yaml
livenessProbe:
  httpGet:
    path: /api/health
    port: 3000
  initialDelaySeconds: 40
  periodSeconds: 30
  timeoutSeconds: 10
  failureThreshold: 3

readinessProbe:
  httpGet:
    path: /api/health
    port: 3000
  initialDelaySeconds: 10
  periodSeconds: 10
  timeoutSeconds: 5
  failureThreshold: 3
```

## Data Persistence

### Volume Mounting

The application stores data in `/app/data`. Ensure this directory is persisted:

**Docker:**
```bash
-v lazymail-data:/app/data
```

**Docker Compose:**
```yaml
volumes:
  - lazymail-data:/app/data
```

**Kubernetes:**
```yaml
volumeMounts:
  - name: data
    mountPath: /app/data
volumes:
  - name: data
    persistentVolumeClaim:
      claimName: lazymail-data-pvc
```

## Troubleshooting

### Container won't start

1. Check logs: `docker logs lazymail-boss`
2. Verify `ENCRYPTION_KEY` is set
3. Ensure port 3000 is not in use

### Health check failing

1. Check if application is listening on port 3000
2. Verify `/api/health` endpoint is accessible
3. Check application logs for errors

### Database issues

1. Ensure `/app/data` directory is writable
2. Check volume permissions
3. Verify database files are persisted

### Email monitoring not working

1. Verify email credentials are correct
2. Check IMAP/SMTP server settings
3. Review application logs for connection errors
4. Ensure firewall allows outbound connections

## Security Best Practices

1. **Never commit `.env` files** to version control
2. **Use strong encryption keys** (32+ random bytes)
3. **Use app-specific passwords** for email accounts
4. **Enable 2FA** on email accounts
5. **Restrict container permissions** (runs as non-root user)
6. **Use secrets management** in production (AWS Secrets Manager, etc.)
7. **Enable HTTPS** with reverse proxy (nginx, Traefik)
8. **Regular updates** of base images and dependencies

## Monitoring

### Logs

View application logs:
```bash
docker logs -f lazymail-boss
```

### Metrics

Monitor container metrics:
```bash
docker stats lazymail-boss
```

### Alerts

Set up alerts for:
- Container health check failures
- High memory/CPU usage
- Email connection failures
- Database errors

## Scaling Considerations

LazyMailBOSS is designed as a single-instance application because:
- It monitors a single email inbox
- Uses local SQLite database
- Maintains in-memory state for pending replies

For high-availability:
- Use container orchestration (ECS, Kubernetes) with auto-restart
- Implement database backups
- Monitor health checks
- Set up alerting

## Backup and Recovery

### Backup Database

```bash
docker cp lazymail-boss:/app/data ./backup/
```

### Restore Database

```bash
docker cp ./backup/lazymail.db lazymail-boss:/app/data/
docker cp ./backup/config.db lazymail-boss:/app/data/
docker restart lazymail-boss
```

### Automated Backups

Use volume backup tools or cloud provider backup services:
- AWS: EBS snapshots
- Google Cloud: Persistent disk snapshots
- DigitalOcean: Volume snapshots
