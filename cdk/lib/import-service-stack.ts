import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as path from 'path';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as aws_s3 from 'aws-cdk-lib/aws-s3';
import * as aws_s3_deployment from 'aws-cdk-lib/aws-s3-deployment';
import { CfnOutput, RemovalPolicy } from 'aws-cdk-lib';

const commonIntegrationGetResponseParameters = {
  "method.response.header.Access-Control-Allow-Origin": "'*'",
  "method.response.header.Access-Control-Allow-Methods": "'GET'",
};

const commonResponseRaparameters = {
  'method.response.header.Access-Control-Allow-Origin': true,
  'method.response.header.Access-Control-Allow-Methods': true,
};


export class ImportServiceStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // bucket
    const uploadedBucket = new aws_s3.Bucket(this, 'UploadedBucket', {
      autoDeleteObjects: true,
      blockPublicAccess: new aws_s3.BlockPublicAccess({ restrictPublicBuckets: true }),
      removalPolicy: RemovalPolicy.DESTROY,
      cors: [{
        allowedMethods: [aws_s3.HttpMethods.GET, aws_s3.HttpMethods.PUT],
        allowedOrigins: ['*'],
        allowedHeaders: ['*'],
      }],
    });

    uploadedBucket.addToResourcePolicy(new cdk.aws_iam.PolicyStatement({
      actions: ['s3:PutObject'],
      resources: [`${uploadedBucket.bucketArn}/uploaded/*`],
      principals: [new cdk.aws_iam.AnyPrincipal()],
    }));

    new CfnOutput(this, 'UploadedBucketName', {
      value: uploadedBucket.bucketName,
      description: 'The name of UploadedBucket',
      exportName: 'UploadedBucketName',
    });

    // lambda
    const importProductsFileFunction = new lambda.Function(this, 'import-products-file-function', {
      runtime: lambda.Runtime.NODEJS_20_X,
      memorySize: 1024,
      timeout: cdk.Duration.seconds(5),
      handler: 'import-products-file-handler.importProductsFile',
      code: lambda.Code.fromAsset(path.join(__dirname, './import-products-file-handler')),
      environment: {
        UPLOADED_BUCKET_NAME: uploadedBucket.bucketName,
      },
    });

    // API Gateway
    const api = new apigateway.RestApi(this, 'import-api', {
      restApiName: 'Import API Gateway',
    });

    const importResource = api.root.addResource('import');

    importResource.addCorsPreflight({
      allowOrigins: ['*'],
      allowMethods: ['GET']
    });

    // lambda integration
    const importProductsFileIntegration = new apigateway.LambdaIntegration(importProductsFileFunction, {
      integrationResponses: [
        {
          statusCode: '200',
          responseParameters: commonIntegrationGetResponseParameters,
        },
        {
          statusCode: '400',
          selectionPattern: '.+is required',
          responseParameters: commonIntegrationGetResponseParameters,
        },
        {
          statusCode: '500',
          selectionPattern: '.+', // Catch-all for any other error
          responseParameters: commonIntegrationGetResponseParameters,
        }
      ],
      requestTemplates: {
        'application/json': `{ "fileName": "$input.params('fileName')" }`,
      },
      passthroughBehavior: apigateway.PassthroughBehavior.NEVER,
      proxy: false,
    });

    importResource.addMethod('GET', importProductsFileIntegration, {
      methodResponses: [
        {
          statusCode: '200',
          responseParameters: commonResponseRaparameters,
          responseModels: {
            'application/json': apigateway.Model.EMPTY_MODEL,
          },
        },
        {
          statusCode: '400',
          responseParameters: commonResponseRaparameters,
          responseModels: {
            'application/json': apigateway.Model.ERROR_MODEL,
          }
        },
        {
          statusCode: '500',
          responseParameters: commonResponseRaparameters,
          responseModels: {
            'application/json': apigateway.Model.ERROR_MODEL,
          }
        }
      ]
    });
  }
}
