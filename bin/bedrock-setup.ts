#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { OpenSearchStack } from '../lib/stacks/opensearch-stack';
import { BedrockStack } from '../lib/stacks/bedrock-stack';

const app = new cdk.App();

// Deploy OpenSearch Stack first
const opensearchStack = new OpenSearchStack(app, 'OpenSearchStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1'
  }
});

// Deploy Bedrock Stack second
const bedrockStack = new BedrockStack(app, 'BedrockStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1'
  },
  collectionArn: opensearchStack.collection.attrArn,
  bucketArn: opensearchStack.s3Bucket.attrArn,
  bedrockRoleArn: opensearchStack.bedrockRole.attrArn
});

app.synth();
