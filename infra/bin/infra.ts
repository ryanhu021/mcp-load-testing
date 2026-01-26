#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { McpInspectorStack } from "../lib/infra-stack";

const app = new cdk.App();

new McpInspectorStack(app, "McpInspectorStack", {
  /* Uncomment to specify the AWS account/region for deployment */
  // env: {
  //   account: process.env.CDK_DEFAULT_ACCOUNT,
  //   region: process.env.CDK_DEFAULT_REGION,
  // },
  /* Stack configuration options */
  // createVpc: true,          // Create a new VPC (default)
  // existingVpcId: 'vpc-xxx', // Or use an existing VPC
  // desiredCount: 2,          // Number of Fargate tasks
  // cpu: 512,                 // Fargate CPU units
  // memoryLimitMiB: 1024,     // Fargate memory
  // certificateArn: 'arn:aws:acm:...', // For HTTPS on ALB
});
