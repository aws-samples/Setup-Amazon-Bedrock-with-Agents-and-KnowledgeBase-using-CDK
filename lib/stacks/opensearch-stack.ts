import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as opensearchserverless from 'aws-cdk-lib/aws-opensearchserverless';
import { Construct } from 'constructs';
import { CONFIG } from '../config';

export class OpenSearchStack extends cdk.Stack {
  public readonly collection: opensearchserverless.CfnCollection;
  public readonly s3Bucket: s3.CfnBucket;
  public readonly bedrockRole: iam.CfnRole;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Encryption Policy
    const encryptionPolicy = new opensearchserverless.CfnSecurityPolicy(this, 'EncryptionPolicy', {
      name: `${CONFIG.collectionName}-security-policy`,
      type: 'encryption',
      description: 'Encryption policy for OpenSearch Serverless collection',
      policy: JSON.stringify({
        Rules: [{
          ResourceType: 'collection',
          Resource: [`collection/${CONFIG.collectionName}`]
        }],
        AWSOwnedKey: true
      })
    });

    // Network Policy
    const networkPolicy = new opensearchserverless.CfnSecurityPolicy(this, 'NetworkPolicy', {
      name: `${CONFIG.collectionName}-network-policy`,
      type: 'network',
      description: 'Network policy for OpenSearch Serverless collection',
      policy: JSON.stringify([{
        Rules: [
          { ResourceType: 'collection', Resource: [`collection/${CONFIG.collectionName}`] },
          { ResourceType: 'dashboard', Resource: [`collection/${CONFIG.collectionName}`] }
        ],
        AllowFromPublic: true
      }])
    });



    // Bedrock Role
    this.bedrockRole = new iam.CfnRole(this, 'BedrockRole', {
        roleName: `AmazonBedrockExecutionRoleForKB-${CONFIG.collectionName}`,
        assumeRolePolicyDocument: {
          Statement: [{
            Effect: 'Allow',
            Principal: {
              Service: 'bedrock.amazonaws.com'
            },
            Action: 'sts:AssumeRole',
            Condition: {
              StringEquals: {
                'aws:SourceAccount': this.account
              },
              ArnLike: {
                'aws:SourceArn': `arn:aws:bedrock:${this.region}:${this.account}:knowledge-base/*`
              }
            }
          }]
        },
        policies: [
            {
                policyName: 'OpensearchServerlessAccessPolicy',
                policyDocument: {
                  Version: '2012-10-17',
                  Statement: [
                    {
                      Effect: 'Allow',
                      Action: [
                        'aoss:APIAccessAll',
                        'aoss:DashboardsAccessAll',
                      ],
                      Resource: `arn:aws:aoss:${this.region}:${this.account}:collection/*`
                    }
                  ]
                }
              },
              {
                policyName: 'BedrockAccessPolicy',
                policyDocument: {
                  Version: '2012-10-17',
                  Statement: [
                    {
                      Effect: 'Allow',
                      Action: [
                        'bedrock:ListCustomModels',
                        'bedrock:InvokeModel'
                      ],
                      Resource: `arn:aws:bedrock:${this.region}::foundation-model/*'`
                    }
                  ]
                }
              },
              {
                policyName: 'S3AccessForKnowledgeBase',
                policyDocument: {
                  Version: '2012-10-17',
                  Statement: [
                    {
                      Effect: 'Allow',
                      Action: [
                        's3:Get',
                        's3:List*',
                        's3:Describe*',
                        's3-object-lambda:Get*',
                        's3-object-lambda:List*'
                      ],
                      Resource: [ 
                      `arn:aws:s3:::${CONFIG.collectionName}-${this.account}`,
                      `arn:aws:s3:::${CONFIG.collectionName}-${this.account}/*`]
        
                    }
                  ]
                }
              },
        ]
      });
  

    const dataAccessPolicy = new opensearchserverless.CfnAccessPolicy(this, 'DataAccessPolicy', {
        name: `${CONFIG.collectionName}-access-policy`,
        type: 'data',
        description: 'Data access policy for OpenSearch Serverless collection',
        policy: JSON.stringify([
          {
            Description: "Provided Access for Bedrock and IAM user",
            Rules: [
              {
                ResourceType: 'index',
                Resource: ['index/*/*'],
                Permission: [
                  'aoss:ReadDocument',
                  'aoss:WriteDocument',
                  'aoss:CreateIndex',
                  'aoss:DeleteIndex',
                  'aoss:UpdateIndex',
                  'aoss:DescribeIndex'
                ]
              },
              {
                ResourceType: 'collection',
                Resource: [`collection/${CONFIG.collectionName}`],
                Permission: [
                  'aoss:CreateCollectionItems',
                  'aoss:DeleteCollectionItems',
                  'aoss:UpdateCollectionItems',
                  'aoss:DescribeCollectionItems'
                ]
              }
            ],
            Principal: [
              CONFIG.iamUserArn,
              this.bedrockRole.attrArn,
              `arn:aws:iam::${this.account}:role/aws-service-role/bedrock.amazonaws.com/AWSServiceRoleForAmazonBedrock`
            ]
          }
        ])
      });

    // S3 Bucket
    this.s3Bucket = new s3.CfnBucket(this, 'S3Bucket', {
      bucketName: `${CONFIG.collectionName}-${this.account}`,
      accessControl: 'Private' ,
      publicAccessBlockConfiguration: {
        blockPublicAcls: true,
        blockPublicPolicy: true,
        ignorePublicAcls: true,
        restrictPublicBuckets: true
      },
      versioningConfiguration: { status: "Enabled" },
      bucketEncryption: {
        serverSideEncryptionConfiguration: [{
          serverSideEncryptionByDefault: {
            sseAlgorithm: 'AES256'
          }
        }]
      }
    });

    // S3 bucket to allow deletion
    this.s3Bucket.cfnOptions.deletionPolicy = cdk.CfnDeletionPolicy.DELETE;

    // Collection
    this.collection = new opensearchserverless.CfnCollection(this, 'Collection', {
      name: CONFIG.collectionName,
      type: 'VECTORSEARCH',
      description: 'Collection for vector search data'
    });

    this.collection.addDependency(encryptionPolicy);
    this.collection.addDependency(networkPolicy);

    // Outputs
    new cdk.CfnOutput(this, 'CollectionArn', {
      value: this.collection.attrArn,
      exportName: 'OpenSearchCollectionArn'
    });

    new cdk.CfnOutput(this, 'BucketArn', {
      value: this.s3Bucket.attrArn,
      exportName: 'OpenSearchBucketArn'
    });

    new cdk.CfnOutput(this, 'BedrockRoleArn', {
      value: this.bedrockRole.attrArn,
      exportName: 'BedrockRoleArn'
    });

    new cdk.CfnOutput(this, 'BucketName', {
      value: this.s3Bucket.ref,
      exportName: 'BucketName'
    });
  }
}
