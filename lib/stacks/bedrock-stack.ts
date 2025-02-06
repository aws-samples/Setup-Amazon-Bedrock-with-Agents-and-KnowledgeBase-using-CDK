import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as bedrock from 'aws-cdk-lib/aws-bedrock';
import { Construct } from 'constructs';
import { CONFIG } from '../config';

interface BedrockStackProps extends cdk.StackProps {
  collectionArn: string;
  bucketArn: string;
  bedrockRoleArn: string;
}

export class BedrockStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: BedrockStackProps) {
    super(scope, id, props);

    // Agent Role
    const agentRole = new iam.CfnRole(this, 'AgentRole', {
      roleName: 'AmazonBedrockExecutionRoleForAgents_cdk',
      assumeRolePolicyDocument: {
        Statement: [{
          Effect: 'Allow',
          Principal: {
            Service: 'bedrock.amazonaws.com'
          },
          Action: 'sts:AssumeRole'
        }]
      },
      managedPolicyArns: ['arn:aws:iam::aws:policy/AmazonBedrockFullAccess']
    });

    // Knowledge Base
    const knowledgeBase = new bedrock.CfnKnowledgeBase(this, 'KnowledgeBase', {
      name: CONFIG.collectionName,
      description: 'Answers on basis of data in knowledge base',
      roleArn: props.bedrockRoleArn,
      knowledgeBaseConfiguration: {
        type: 'VECTOR',
        vectorKnowledgeBaseConfiguration: {
          embeddingModelArn: `arn:aws:bedrock:${this.region}::foundation-model/amazon.titan-embed-text-v1`
        }
      },
      storageConfiguration: {
        type: 'OPENSEARCH_SERVERLESS',
        opensearchServerlessConfiguration: {
          collectionArn: props.collectionArn,
          vectorIndexName: CONFIG.indexName,
          fieldMapping: {
            vectorField: 'vector',
            textField: 'text',
            metadataField: 'metadata'
          }
        }
      }
    });

    // Data Source
    const dataSource = new bedrock.CfnDataSource(this, 'DataSource', {
      knowledgeBaseId: knowledgeBase.ref,
      name: CONFIG.collectionName,
      dataSourceConfiguration: {
        type: 'S3',
        s3Configuration: {
          bucketArn: props.bucketArn
        }
      }
    });



    const agent = new bedrock.CfnAgent(this, 'Agent', {
      agentName: 'cdk-agent',
      agentResourceRoleArn: agentRole.attrArn,
      autoPrepare: true,
      foundationModel: 'anthropic.claude-v2',
      instruction: `You are an infrastructure expert who helps create AWS CDK templates`,
      description: 'AWS CDK Infrastructure Expert Agent',
      idleSessionTtlInSeconds: 900,
      knowledgeBases: [{
        knowledgeBaseId: knowledgeBase.ref,
        description: 'CDK Patterns Knowledge Base',
        knowledgeBaseState: 'ENABLED'
      }]
    });

    // Outputs
    new cdk.CfnOutput(this, 'KnowledgeBaseId', {
      value: knowledgeBase.ref
    });

    new cdk.CfnOutput(this, 'AgentId', {
      value: agent.ref
    });
  }
}
