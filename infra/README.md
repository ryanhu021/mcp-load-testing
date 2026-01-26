# MCP Inspector AWS CDK Infrastructure

This CDK stack deploys the MCP Inspector to AWS with the following architecture:

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                           CloudFront                                 │
│  (HTTPS, Caching, SPA Routing)                                      │
└─────────────────────────────────────────────────────────────────────┘
                    │                           │
                    ▼                           ▼
        ┌───────────────────┐       ┌───────────────────────┐
        │   S3 Bucket       │       │  Application Load     │
        │   (Static Files)  │       │  Balancer (ALB)       │
        │                   │       │                       │
        │   - index.html    │       │  /mcp, /sse, /stdio   │
        │   - assets/*      │       │  /message, /health    │
        └───────────────────┘       └───────────────────────┘
                                              │
                                              ▼
                                    ┌───────────────────────┐
                                    │   ECS Fargate         │
                                    │   (MCP Proxy Server)  │
                                    │                       │
                                    │   - Sticky sessions   │
                                    │   - Auto-scaling      │
                                    │   - Health checks     │
                                    └───────────────────────┘
```

## Components

- **CloudFront Distribution**: CDN for the frontend with HTTPS and SPA routing
- **S3 Bucket**: Hosts the static React frontend
- **Application Load Balancer**: Routes API traffic to Fargate with sticky sessions
- **ECS Fargate**: Runs the MCP proxy server containers
- **Secrets Manager**: Stores the proxy authentication token

## Prerequisites

1. **AWS CLI** configured with appropriate credentials
2. **Node.js 22+** installed
3. **Docker** installed and running (for building the server image)
4. **AWS CDK CLI** installed: `npm install -g aws-cdk`

## Deployment

### 1. Build the Frontend

```bash
cd ../client
npm run build
```

### 2. Bootstrap CDK (first time only)

```bash
cd ../infra
npx cdk bootstrap
```

### 3. Deploy the Stack

```bash
npx cdk deploy
```

### 4. Get the Proxy Auth Token

After deployment, retrieve the authentication token:

```bash
aws secretsmanager get-secret-value \
  --secret-id <SECRET_ARN_FROM_OUTPUT> \
  --query SecretString \
  --output text
```

## Configuration Options

Edit `bin/infra.ts` to customize:

```typescript
new McpInspectorStack(app, "McpInspectorStack", {
  // Use existing VPC instead of creating new one
  createVpc: false,
  existingVpcId: "vpc-xxxxxxxx",

  // Fargate configuration
  desiredCount: 2, // Number of tasks
  cpu: 512, // CPU units (256, 512, 1024, 2048, 4096)
  memoryLimitMiB: 1024, // Memory in MB

  // HTTPS configuration (requires ACM certificate)
  certificateArn: "arn:aws:acm:us-east-1:xxx:certificate/xxx",
});
```

## Outputs

After deployment, you'll see:

- **CloudFrontUrl**: The URL to access the MCP Inspector UI
- **AlbUrl**: Direct URL to the backend (for debugging)
- **ProxyAuthTokenSecret**: ARN of the Secrets Manager secret
- **GetProxyAuthTokenCommand**: CLI command to retrieve the token

## Using the Deployed Inspector

1. Open the CloudFront URL in your browser
2. The proxy server URL will be the CloudFront URL (same origin)
3. Enter the proxy auth token from Secrets Manager
4. Connect to your MCP server

## Costs

Estimated monthly costs (us-east-1):

- **CloudFront**: ~$0.085/GB transfer + $0.0075/10k requests
- **S3**: ~$0.023/GB storage
- **ALB**: ~$16/month base + $0.008/LCU-hour
- **Fargate**: ~$30-60/month (2 tasks × 0.5 vCPU × 1GB)
- **NAT Gateway**: ~$32/month + $0.045/GB
- **Secrets Manager**: ~$0.40/month

**Total**: ~$80-120/month for basic setup

## Cleanup

To delete all resources:

```bash
npx cdk destroy
```

## Troubleshooting

### SSE Connections Dropping

The ALB is configured with a 1-hour idle timeout. If connections still drop:

- Check CloudFront timeout settings
- Verify sticky sessions are working

### 502 Bad Gateway

- Check Fargate task logs in CloudWatch
- Verify the container health check is passing
- Check security group rules

### CORS Errors

The server allows all origins by default when deployed. If you need to restrict:

- Set `ALLOWED_ORIGINS` environment variable in the task definition

## Security Considerations

1. **Authentication**: The proxy requires a token (stored in Secrets Manager)
2. **HTTPS**: CloudFront enforces HTTPS
3. **VPC**: Fargate tasks run in private subnets
4. **IAM**: Minimal permissions for all roles

For production use, consider:

- Adding WAF rules to CloudFront
- Restricting ALLOWED_ORIGINS
- Using a custom domain with ACM certificate
- Enabling VPC Flow Logs
