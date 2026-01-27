import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ecrassets from "aws-cdk-lib/aws-ecr-assets";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as logs from "aws-cdk-lib/aws-logs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";
import * as path from "path";

export interface McpInspectorStackProps extends cdk.StackProps {
  /**
   * Whether to create a new VPC or use an existing one
   * @default true
   */
  createVpc?: boolean;

  /**
   * Existing VPC ID to use (if createVpc is false)
   */
  existingVpcId?: string;

  /**
   * Number of Fargate tasks to run
   * @default 2
   */
  desiredCount?: number;

  /**
   * Fargate CPU units (256, 512, 1024, 2048, 4096)
   * @default 512
   */
  cpu?: number;

  /**
   * Fargate memory in MB
   * @default 1024
   */
  memoryLimitMiB?: number;

  /**
   * Enable HTTPS on ALB (requires certificate ARN)
   */
  certificateArn?: string;

  /**
   * Custom domain name for CloudFront
   */
  domainName?: string;
}

export class McpInspectorStack extends cdk.Stack {
  public readonly cloudFrontUrl: cdk.CfnOutput;
  public readonly albUrl: cdk.CfnOutput;
  public readonly proxyAuthToken: cdk.CfnOutput;

  constructor(scope: Construct, id: string, props?: McpInspectorStackProps) {
    super(scope, id, props);

    const {
      createVpc = true,
      existingVpcId,
      desiredCount = 2,
      cpu = 512,
      memoryLimitMiB = 1024,
      certificateArn,
    } = props ?? {};

    // ============================================
    // VPC Configuration
    // ============================================
    let vpc: ec2.IVpc;

    if (createVpc) {
      vpc = new ec2.Vpc(this, "McpInspectorVpc", {
        maxAzs: 2,
        natGateways: 1,
        subnetConfiguration: [
          {
            name: "Public",
            subnetType: ec2.SubnetType.PUBLIC,
            cidrMask: 24,
          },
          {
            name: "Private",
            subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
            cidrMask: 24,
          },
        ],
      });
    } else if (existingVpcId) {
      vpc = ec2.Vpc.fromLookup(this, "ExistingVpc", {
        vpcId: existingVpcId,
      });
    } else {
      throw new Error(
        "Either createVpc must be true or existingVpcId must be provided",
      );
    }

    // ============================================
    // Secrets for Proxy Authentication
    // ============================================
    const proxyAuthSecret = new secretsmanager.Secret(
      this,
      "McpProxyAuthSecret",
      {
        description: "MCP Inspector Proxy Authentication Token",
        generateSecretString: {
          excludePunctuation: true,
          passwordLength: 64,
        },
      },
    );

    // ============================================
    // ECS Cluster & Fargate Service (Backend)
    // ============================================
    const cluster = new ecs.Cluster(this, "McpInspectorCluster", {
      vpc,
      containerInsightsV2: ecs.ContainerInsights.ENABLED,
    });

    // Task Definition
    const taskDefinition = new ecs.FargateTaskDefinition(
      this,
      "McpProxyTaskDef",
      {
        memoryLimitMiB,
        cpu,
      },
    );

    // Log Group
    const logGroup = new logs.LogGroup(this, "McpProxyLogs", {
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Container Definition
    const container = taskDefinition.addContainer("McpProxyContainer", {
      // Build from the server directory
      image: ecs.ContainerImage.fromAsset(
        path.join(__dirname, "../../server"),
        {
          file: "Dockerfile",
          platform: ecrassets.Platform.LINUX_AMD64,
        },
      ),
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: "mcp-proxy",
        logGroup,
      }),
      environment: {
        HOST: "0.0.0.0",
        SERVER_PORT: "6277",
        // Allow requests from CloudFront
        ALLOWED_ORIGINS: "*", // Will be restricted by CloudFront
      },
      secrets: {
        MCP_PROXY_AUTH_TOKEN: ecs.Secret.fromSecretsManager(proxyAuthSecret),
      },
      portMappings: [
        {
          containerPort: 6277,
          protocol: ecs.Protocol.TCP,
        },
      ],
      healthCheck: {
        command: [
          "CMD-SHELL",
          "curl -f http://localhost:6277/health || exit 1",
        ],
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        retries: 3,
        startPeriod: cdk.Duration.seconds(60),
      },
    });

    // Security Group for ALB
    const albSecurityGroup = new ec2.SecurityGroup(this, "AlbSecurityGroup", {
      vpc,
      description: "Security group for MCP Inspector ALB",
      allowAllOutbound: true,
    });
    albSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(80),
      "Allow HTTP",
    );
    if (certificateArn) {
      albSecurityGroup.addIngressRule(
        ec2.Peer.anyIpv4(),
        ec2.Port.tcp(443),
        "Allow HTTPS",
      );
    }

    // Security Group for Fargate Tasks
    const fargateSecurityGroup = new ec2.SecurityGroup(
      this,
      "FargateSecurityGroup",
      {
        vpc,
        description: "Security group for MCP Proxy Fargate tasks",
        allowAllOutbound: true,
      },
    );
    fargateSecurityGroup.addIngressRule(
      albSecurityGroup,
      ec2.Port.tcp(6277),
      "Allow traffic from ALB",
    );

    // Fargate Service
    const fargateService = new ecs.FargateService(this, "McpProxyService", {
      cluster,
      taskDefinition,
      desiredCount,
      assignPublicIp: false,
      securityGroups: [fargateSecurityGroup],
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
    });

    // Application Load Balancer
    const alb = new elbv2.ApplicationLoadBalancer(this, "McpProxyAlb", {
      vpc,
      internetFacing: true,
      securityGroup: albSecurityGroup,
    });

    // Target Group with sticky sessions for SSE connections
    const targetGroup = new elbv2.ApplicationTargetGroup(
      this,
      "McpProxyTargetGroup",
      {
        vpc,
        port: 6277,
        protocol: elbv2.ApplicationProtocol.HTTP,
        targetType: elbv2.TargetType.IP,
        healthCheck: {
          path: "/health",
          interval: cdk.Duration.seconds(30),
          timeout: cdk.Duration.seconds(5),
          healthyThresholdCount: 2,
          unhealthyThresholdCount: 3,
        },
        // Enable sticky sessions for SSE/streaming connections
        stickinessCookieDuration: cdk.Duration.hours(1),
      },
    );

    // Attach Fargate service to target group
    fargateService.attachToApplicationTargetGroup(targetGroup);

    // HTTP Listener
    const httpListener = alb.addListener("HttpListener", {
      port: 80,
      defaultTargetGroups: [targetGroup],
    });

    // Configure idle timeout for long-running SSE connections
    alb.setAttribute("idle_timeout.timeout_seconds", "3600");

    // ============================================
    // S3 Bucket for Frontend (Static Website)
    // ============================================
    const websiteBucket = new s3.Bucket(this, "McpInspectorWebsite", {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
    });

    // ============================================
    // CloudFront Distribution
    // ============================================

    // Origin Access Control for S3
    const oac = new cloudfront.S3OriginAccessControl(this, "McpInspectorOAC", {
      signing: cloudfront.Signing.SIGV4_ALWAYS,
    });

    // CloudFront Function to handle SPA routing
    const spaRoutingFunction = new cloudfront.Function(
      this,
      "SpaRoutingFunction",
      {
        code: cloudfront.FunctionCode.fromInline(`
function handler(event) {
  var request = event.request;
  var uri = request.uri;
  
  // Check if the URI has a file extension
  if (uri.includes('.')) {
    return request;
  }
  
  // For SPA routing, redirect to index.html
  request.uri = '/index.html';
  return request;
}
`),
        runtime: cloudfront.FunctionRuntime.JS_2_0,
      },
    );

    // CloudFront Distribution
    const distribution = new cloudfront.Distribution(
      this,
      "McpInspectorDistribution",
      {
        defaultBehavior: {
          origin: origins.S3BucketOrigin.withOriginAccessControl(
            websiteBucket,
            {
              originAccessControl: oac,
            },
          ),
          viewerProtocolPolicy:
            cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
          functionAssociations: [
            {
              function: spaRoutingFunction,
              eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
            },
          ],
        },
        additionalBehaviors: {
          // Proxy API requests to the ALB
          "/mcp": {
            origin: new origins.HttpOrigin(alb.loadBalancerDnsName, {
              protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
            }),
            viewerProtocolPolicy:
              cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
            cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
            originRequestPolicy:
              cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
            allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          },
          "/mcp/*": {
            origin: new origins.HttpOrigin(alb.loadBalancerDnsName, {
              protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
            }),
            viewerProtocolPolicy:
              cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
            cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
            originRequestPolicy:
              cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
            allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          },
          "/stdio": {
            origin: new origins.HttpOrigin(alb.loadBalancerDnsName, {
              protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
            }),
            viewerProtocolPolicy:
              cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
            cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
            originRequestPolicy:
              cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
            allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          },
          "/sse": {
            origin: new origins.HttpOrigin(alb.loadBalancerDnsName, {
              protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
            }),
            viewerProtocolPolicy:
              cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
            cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
            originRequestPolicy:
              cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
            allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          },
          "/message": {
            origin: new origins.HttpOrigin(alb.loadBalancerDnsName, {
              protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
            }),
            viewerProtocolPolicy:
              cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
            cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
            originRequestPolicy:
              cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
            allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          },
          "/health": {
            origin: new origins.HttpOrigin(alb.loadBalancerDnsName, {
              protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
            }),
            viewerProtocolPolicy:
              cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
            cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
            originRequestPolicy:
              cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
            allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
          },
          "/config": {
            origin: new origins.HttpOrigin(alb.loadBalancerDnsName, {
              protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
            }),
            viewerProtocolPolicy:
              cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
            cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
            originRequestPolicy:
              cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
            allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
          },
        },
        defaultRootObject: "index.html",
        errorResponses: [
          {
            httpStatus: 404,
            responseHttpStatus: 200,
            responsePagePath: "/index.html",
            ttl: cdk.Duration.seconds(0),
          },
          {
            httpStatus: 403,
            responseHttpStatus: 200,
            responsePagePath: "/index.html",
            ttl: cdk.Duration.seconds(0),
          },
        ],
      },
    );

    // Grant CloudFront access to S3 bucket
    websiteBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        actions: ["s3:GetObject"],
        resources: [websiteBucket.arnForObjects("*")],
        principals: [new iam.ServicePrincipal("cloudfront.amazonaws.com")],
        conditions: {
          StringEquals: {
            "AWS:SourceArn": `arn:aws:cloudfront::${this.account}:distribution/${distribution.distributionId}`,
          },
        },
      }),
    );

    // ============================================
    // Deploy Frontend Assets
    // ============================================
    new s3deploy.BucketDeployment(this, "DeployWebsite", {
      sources: [
        s3deploy.Source.asset(path.join(__dirname, "../../client/dist")),
      ],
      destinationBucket: websiteBucket,
      distribution,
      distributionPaths: ["/*"],
    });

    // ============================================
    // Outputs
    // ============================================
    this.cloudFrontUrl = new cdk.CfnOutput(this, "CloudFrontUrl", {
      value: `https://${distribution.distributionDomainName}`,
      description: "CloudFront Distribution URL (Frontend)",
    });

    this.albUrl = new cdk.CfnOutput(this, "AlbUrl", {
      value: `http://${alb.loadBalancerDnsName}`,
      description: "Application Load Balancer URL (Backend API)",
    });

    this.proxyAuthToken = new cdk.CfnOutput(this, "ProxyAuthTokenSecret", {
      value: proxyAuthSecret.secretArn,
      description:
        "Secrets Manager ARN containing the proxy authentication token",
    });

    new cdk.CfnOutput(this, "GetProxyAuthTokenCommand", {
      value: `aws secretsmanager get-secret-value --secret-id ${proxyAuthSecret.secretArn} --query SecretString --output text`,
      description: "AWS CLI command to retrieve the proxy authentication token",
    });
  }
}
