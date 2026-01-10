# TinyTask MCP Deployment Guide

This guide covers deploying TinyTask MCP in various environments.

## Table of Contents

- [Local Development](#local-development)
- [Docker Deployment](#docker-deployment)
- [Production Deployment](#production-deployment)
- [Cloud Deployment](#cloud-deployment)
- [Security Considerations](#security-considerations)
- [Monitoring](#monitoring)

---

## Local Development

### Prerequisites

- Node.js 18+ or 20+
- npm or yarn
- SQLite3 (included with Node.js)

### Quick Start

```bash
# Clone repository
git clone <repository-url>
cd tinytask-mcp

# Install dependencies
npm install

# Build the project
npm run build

# Run in development mode with auto-reload
npm run dev

# Or run production build (Streamable HTTP)
npm run start:http
```

### Configuration

Create a `.env` file for local development:

```bash
TINYTASK_MODE=both
TINYTASK_PORT=3000
TINYTASK_DB_PATH=./data/tinytask.db
```

---

## Docker Deployment

### Single Container

#### Build and Run

```bash
# Build the image
docker build -t tinytask-mcp .

# Run the container (Streamable HTTP default)
docker run -d \
  --name tinytask-mcp \
  -p 3000:3000 \
  -v $(pwd)/data:/app/data \
  -e TINYTASK_MODE=http \
  -e TINYTASK_PORT=3000 \
  tinytask-mcp

# Legacy SSE mode
docker run -d \
  --name tinytask-mcp-sse \
  -p 3000:3000 \
  -v $(pwd)/data:/app/data \
  -e TINYTASK_MODE=http \
  -e TINYTASK_ENABLE_SSE=true \
  tinytask-mcp
```

#### Using Docker Compose (Recommended)

```bash
# Start services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down

# Stop and remove volumes (WARNING: deletes data)
docker-compose down -v
```

### Docker Compose Configuration

**docker-compose.yml:**

```yaml
version: '3.8'

services:
  tinytask:
    build: .
    container_name: tinytask-mcp
    ports:
      - "3000:3000"
    environment:
      - TINYTASK_MODE=http
      - TINYTASK_PORT=3000
      - TINYTASK_DB_PATH=/app/data/tinytask.db
    volumes:
      - ./data:/app/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
```

### Development with Docker

**docker-compose.dev.yml:**

```yaml
version: '3.8'

services:
  tinytask:
    build:
      context: .
      dockerfile: Dockerfile.dev
    container_name: tinytask-mcp-dev
    ports:
      - "3000:3000"
    environment:
      - TINYTASK_MODE=both
      - TINYTASK_ENABLE_SSE=false
      - TINYTASK_PORT=3000
      - DEBUG=tinytask:*
    volumes:
      - ./data:/app/data
      - ./src:/app/src
    command: npm run dev
```

Use with:
```bash
docker-compose -f docker-compose.dev.yml up
```

---

## Production Deployment

### Prerequisites

- Stable server or cloud instance
- Domain name (optional but recommended)
- SSL/TLS certificate (for HTTPS)
- Reverse proxy (nginx or traefik)

### System Requirements

**Minimum:**
- 1 CPU core
- 512 MB RAM
- 1 GB disk space
- Ubuntu 20.04+ or similar Linux distribution

**Recommended:**
- 2 CPU cores
- 1 GB RAM
- 10 GB disk space
- Ubuntu 22.04 LTS

### Deployment Steps

#### 1. Server Preparation

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Install Docker Compose
sudo apt install docker-compose-plugin

# Create application directory
sudo mkdir -p /opt/tinytask-mcp
cd /opt/tinytask-mcp
```

#### 2. Deploy Application

```bash
# Clone repository
git clone <repository-url> .

# Create data directory
mkdir -p data

# Set permissions
sudo chown -R $(whoami):$(whoami) data/

# Copy production config
cp docker-compose.yml docker-compose.prod.yml
```

#### 3. Configure for Production

Edit `docker-compose.prod.yml`:

```yaml
version: '3.8'

services:
  tinytask:
    image: tinytask-mcp:latest
    container_name: tinytask-mcp
    restart: always
    ports:
      - "127.0.0.1:3000:3000"  # Only expose locally
    environment:
      - TINYTASK_MODE=http
      - TINYTASK_PORT=3000
      - NODE_ENV=production
    volumes:
      - ./data:/app/data
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 512M
        reservations:
          cpus: '0.5'
          memory: 256M
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```

#### 4. Set Up Reverse Proxy (nginx)

```bash
# Install nginx
sudo apt install nginx -y

# Create nginx config
sudo nano /etc/nginx/sites-available/tinytask
```

**nginx configuration:**

```nginx
upstream tinytask {
    server 127.0.0.1:3000;
}

server {
    listen 80;
    server_name tinytask.example.com;

    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name tinytask.example.com;

    # SSL Configuration (use certbot for Let's Encrypt)
    ssl_certificate /etc/letsencrypt/live/tinytask.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/tinytask.example.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Health check endpoint
    location /health {
        proxy_pass http://tinytask;
        access_log off;
    }

    # MCP endpoint
    location /mcp {
        proxy_pass http://tinytask;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # SSE specific settings
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 24h;
    }

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=tinytask_limit:10m rate=10r/s;
    location / {
        limit_req zone=tinytask_limit burst=20 nodelay;
        proxy_pass http://tinytask;
    }
}
```

Enable the site:

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/tinytask /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Reload nginx
sudo systemctl reload nginx
```

#### 5. Set Up SSL with Let's Encrypt

```bash
# Install certbot
sudo apt install certbot python3-certbot-nginx -y

# Get certificate
sudo certbot --nginx -d tinytask.example.com

# Auto-renewal is configured automatically
# Test renewal
sudo certbot renew --dry-run
```

#### 6. Start Application

```bash
# Build and start
docker-compose -f docker-compose.prod.yml up -d

# Check status
docker-compose -f docker-compose.prod.yml ps

# View logs
docker-compose -f docker-compose.prod.yml logs -f
```

### Systemd Service (Alternative to Docker)

If not using Docker, create a systemd service:

```bash
sudo nano /etc/systemd/system/tinytask.service
```

```ini
[Unit]
Description=TinyTask MCP Server
After=network.target

[Service]
Type=simple
User=tinytask
WorkingDirectory=/opt/tinytask-mcp
Environment="TINYTASK_MODE=http"
Environment="TINYTASK_PORT=3000"
Environment="NODE_ENV=production"
ExecStart=/usr/bin/node /opt/tinytask-mcp/build/index.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable tinytask
sudo systemctl start tinytask
sudo systemctl status tinytask
```

---

## Cloud Deployment

### AWS (Amazon Web Services)

#### EC2 Deployment

```bash
# Launch EC2 instance (t2.micro for testing, t2.small for production)
# SSH into instance
ssh -i key.pem ubuntu@<instance-ip>

# Follow production deployment steps above
# Open security group port 80 and 443
```

#### ECS Deployment

1. Create ECR repository
2. Push Docker image
3. Create ECS cluster
4. Define task definition
5. Create service

### Google Cloud Platform

#### Cloud Run Deployment

```bash
# Build and push to GCR
gcloud builds submit --tag gcr.io/PROJECT_ID/tinytask-mcp

# Deploy to Cloud Run
gcloud run deploy tinytask-mcp \
  --image gcr.io/PROJECT_ID/tinytask-mcp \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --memory 512Mi \
  --cpu 1
```

### DigitalOcean

#### Droplet Deployment

```bash
# Create droplet (Ubuntu 22.04)
# SSH into droplet
ssh root@<droplet-ip>

# Follow production deployment steps
# Configure firewall
ufw allow 22
ufw allow 80
ufw allow 443
ufw enable
```

#### App Platform Deployment

Use the web interface or doctl CLI:

```yaml
# app.yaml
name: tinytask-mcp
services:
  - name: web
    github:
      repo: your-username/tinytask-mcp
      branch: main
    build_command: npm run build
    run_command: npm start
    environment_slug: node-js
    envs:
      - key: TINYTASK_MODE
        value: sse
    instance_count: 1
    instance_size_slug: basic-xxs
```

---

## Security Considerations

### Authentication

TinyTask MCP doesn't include built-in authentication. For production:

1. **Use a reverse proxy with authentication:**
   - nginx with basic auth
   - nginx with OAuth2 proxy
   - API gateway with JWT

2. **Network-level security:**
   - VPN access only
   - Private network
   - Firewall rules

### Example: nginx Basic Auth

```bash
# Create password file
sudo htpasswd -c /etc/nginx/.htpasswd admin

# Update nginx config
location /mcp {
    auth_basic "Restricted";
    auth_basic_user_file /etc/nginx/.htpasswd;
    proxy_pass http://tinytask;
}
```

### Database Security

```bash
# Set appropriate file permissions
chmod 600 data/tinytask.db
chown tinytask:tinytask data/tinytask.db

# Regular backups
0 2 * * * /opt/tinytask-mcp/backup.sh
```

### Transport Troubleshooting

- **Verify transport:** `curl http://localhost:3000/health` returns `{ transport: "streamable-http" }` by default or `"sse"` when legacy flag is enabled.
- **Unexpected SSE:** Ensure `TINYTASK_ENABLE_SSE` isn't set to `true` via Docker or host environment.
- **Need SSE temporarily:** Add `TINYTASK_ENABLE_SSE=true`, redeploy, and monitor logs for deprecation warnings.
- **Client mismatch:** Streamable HTTP consolidates GET/POST into a single `/mcp` endpoint; keep legacy clients on SSE until upgraded.

---

## Monitoring

### Health Checks

```bash
# Add to cron
*/5 * * * * curl -f http://localhost:3000/health || systemctl restart tinytask
```

### Logging

```bash
# View logs
docker-compose logs -f --tail=100

# Or for systemd
journalctl -u tinytask -f
```

### Monitoring Tools

- **Prometheus + Grafana**: For metrics
- **Uptime Kuma**: For uptime monitoring
- **Sentry**: For error tracking

### Backup Strategy

```bash
#!/bin/bash
# backup.sh
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/opt/tinytask-mcp/backups"
mkdir -p $BACKUP_DIR

# Backup database
cp /opt/tinytask-mcp/data/tinytask.db $BACKUP_DIR/tinytask_$DATE.db

# Keep only last 7 days
find $BACKUP_DIR -name "tinytask_*.db" -mtime +7 -delete

# Optional: Upload to S3
# aws s3 cp $BACKUP_DIR/tinytask_$DATE.db s3://your-bucket/backups/
```

Make it executable and add to cron:
```bash
chmod +x backup.sh
crontab -e
# Add: 0 2 * * * /opt/tinytask-mcp/backup.sh
```

---

## Updating

### Docker Update

```bash
# Pull latest code
git pull

# Rebuild image
docker-compose build

# Restart with new image
docker-compose down
docker-compose up -d
```

### Manual Update

```bash
# Stop service
sudo systemctl stop tinytask

# Update code
git pull

# Install dependencies
npm install

# Rebuild
npm run build

# Start service
sudo systemctl start tinytask
```

---

## Rollback Procedure

```bash
# Stop service
docker-compose down

# Restore previous version
git checkout <previous-commit>
docker-compose build
docker-compose up -d

# Or restore database backup
cp backups/tinytask_YYYYMMDD.db data/tinytask.db
docker-compose up -d
```

---

## Performance Tuning

### For High Load

```yaml
# docker-compose.yml
services:
  tinytask:
    deploy:
      replicas: 3
      resources:
        limits:
          cpus: '2'
          memory: 1G
```

### Database Optimization

```sql
-- Enable WAL mode for better concurrency
PRAGMA journal_mode=WAL;

-- Set cache size
PRAGMA cache_size=-64000;  -- 64MB
```

---

## Checklist

### Pre-Deployment
- [ ] Code tested thoroughly
- [ ] Dependencies updated
- [ ] Environment variables configured
- [ ] Backup strategy in place
- [ ] Monitoring configured

### Deployment
- [ ] Application deployed
- [ ] Health check passing
- [ ] SSL configured (production)
- [ ] Reverse proxy configured
- [ ] Firewall rules set

### Post-Deployment
- [ ] Verify functionality
- [ ] Check logs for errors
- [ ] Monitor resource usage
- [ ] Test backup restore
- [ ] Document any changes

---

## Support

For deployment issues, refer to:
- [Troubleshooting Guide](troubleshooting.md)
- [Architecture Documentation](technical/architecture.md)
- GitHub Issues
