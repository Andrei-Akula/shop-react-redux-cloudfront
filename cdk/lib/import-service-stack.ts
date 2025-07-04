import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as path from 'path';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as aws_s3 from 'aws-cdk-lib/aws-s3';
import * as aws_s3_deployment from 'aws-cdk-lib/aws-s3-deployment';
import * as aws_s3_notifications from 'aws-cdk-lib/aws-s3-notifications';
import * as iam from 'aws-cdk-lib/aws-iam';

const productsAndStockWritePoliicy = new iam.PolicyStatement({
  actions: ["dynamodb:PutItem"],
  resources: [
    cdk.Fn.importValue("ProductsTableArn"),
    cdk.Fn.importValue("StockTableArn"),
  ]
});

const commonIntegrationGetResponseParameters = {
  "method.response.header.Access-Control-Allow-Origin": "'*'",
  "method.response.header.Access-Control-Allow-Methods": "'GET'",
};

const commonResponseRaparameters = {
  'method.response.header.Access-Control-Allow-Origin': true,
  'method.response.header.Access-Control-Allow-Methods': true,
};

const commmonLambdaProps = {
  runtime: lambda.Runtime.NODEJS_20_X,
  memorySize: 1024,
  timeout: cdk.Duration.seconds(5),
  code: lambda.Code.fromAsset(path.join(__dirname, './import-products-file-handler')),
}

export class ImportServiceStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // bucket
    const uploadedBucket = new aws_s3.Bucket(this, 'UploadedBucket', {
      autoDeleteObjects: true,
      blockPublicAccess: new aws_s3.BlockPublicAccess({ restrictPublicBuckets: true }),
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      cors: [{
        allowedMethods: [aws_s3.HttpMethods.GET, aws_s3.HttpMethods.PUT],
        allowedOrigins: ['*'],
        allowedHeaders: ['*'],
      }],
      lifecycleRules: [{
        id: 'DeleteUploadedFiles',
        enabled: true,
        prefix: 'uploaded/',
        expiration: cdk.Duration.days(1), // Automatically delete files after 1 day
      }],
      versioned: false,
    });

    uploadedBucket.addToResourcePolicy(new cdk.aws_iam.PolicyStatement({
      actions: ['s3:PutObject'],
      resources: [`${uploadedBucket.bucketArn}/uploaded/*`],
      principals: [new cdk.aws_iam.AnyPrincipal()],
    }));

    new cdk.CfnOutput(this, 'UploadedBucketName', {
      value: uploadedBucket.bucketName,
      description: 'The name of UploadedBucket',
      exportName: 'UploadedBucketName',
    });

    // lambdas
    const commonLambdaEnvironment = {
      UPLOADED_BUCKET_NAME: uploadedBucket.bucketName,
    };

    const importProductsFileFunction = new lambda.Function(this, 'import-products-file-function', {
      ...commmonLambdaProps,
      handler: 'import-products-file-handler.importProductsFile',
      environment: commonLambdaEnvironment,
    });

    const importFileParserFunction = new lambda.Function(this, 'import-file-parser-function', {
      ...commmonLambdaProps,
      handler: 'import-products-file-handler.importFileParser',
      environment: commonLambdaEnvironment,
    });

    // Grant Lambda permissions to write to DynamoDB
    importFileParserFunction.addToRolePolicy(productsAndStockWritePoliicy);

    // Grant Lambda permissions to read from S3
    uploadedBucket.grantRead(importFileParserFunction);

     // Add S3 notification for the uploaded/ prefix
    uploadedBucket.addEventNotification(
      aws_s3.EventType.OBJECT_CREATED, 
      new aws_s3_notifications.LambdaDestination(importFileParserFunction),
      {
        prefix: 'uploaded/', // Only trigger for objects in the 'uploaded/' prefix);
      }
    );

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
