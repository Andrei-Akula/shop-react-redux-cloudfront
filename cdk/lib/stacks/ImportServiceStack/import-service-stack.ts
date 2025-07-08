import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as path from 'path';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as aws_s3 from 'aws-cdk-lib/aws-s3';
import * as aws_s3_deployment from 'aws-cdk-lib/aws-s3-deployment';
import * as aws_s3_notifications from 'aws-cdk-lib/aws-s3-notifications';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as sns from 'aws-cdk-lib/aws-sns';
import { SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import { EmailSubscription } from 'aws-cdk-lib/aws-sns-subscriptions';

const productsAndStockWritePolicy = new iam.PolicyStatement({
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

const commonLambdaProps = {
  runtime: lambda.Runtime.NODEJS_20_X,
  memorySize: 1024,
  timeout: cdk.Duration.seconds(5),
  code: lambda.Code.fromAsset(path.join(__dirname, '../../lambdas/import-products-file-handler')),
}

function createImportApiEndpoint(scope: Construct, importProductsFileFunction: lambda.Function) {
  const api = new apigateway.RestApi(scope, 'import-api', {
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

  return api;
}

function createUploadedBucket(scope: Construct) {
  const uploadedBucket = new aws_s3.Bucket(scope, 'UploadedBucket', {
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

  new cdk.CfnOutput(scope, 'UploadedBucketName', {
    value: uploadedBucket.bucketName,
    description: 'The name of UploadedBucket',
    exportName: 'UploadedBucketName',
  });

  return uploadedBucket;
}

function createImportFileParserFunction(scope: Construct, lambdaEnv: { [key: string]: string }) {
  return new lambda.Function(scope, 'import-file-parser-function', {
    ...commonLambdaProps,
    handler: 'import-products-file-handler.importFileParser',
    environment: lambdaEnv,
  });
}

function setupImportFileParseFunction(importFileParserFunction: lambda.Function) {
  // Grant Lambda permissions to write to DynamoDB
  importFileParserFunction.addToRolePolicy(productsAndStockWritePolicy);
}

function addS3EventHandling(uploadedBucket: aws_s3.Bucket, importFileParserFunction: lambda.Function) {
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
}

function createImportProductsFileFunction(scope: Construct, lambdaEnv: { [key: string]: string }) {
  return new lambda.Function(scope, 'import-products-file-function', {
    ...commonLambdaProps,
    handler: 'import-products-file-handler.importProductsFile',
    environment: lambdaEnv,
  });
}

function createProductQueue(scope: Construct) {
  const timeout = 60 * 5; // 5 minutes
  const queue = new sqs.Queue(scope, 'product-sqs', {
    visibilityTimeout: cdk.Duration.seconds(timeout)
  });

  new cdk.CfnOutput(scope, 'ProductQueueName', {
    value: queue.queueName,
    description: 'The name of the Product SQS Queue',
    exportName: 'ProductQueueName',
  });

  return queue;
}

function createSNSProductTopic(scope: Construct) {
  const productTopic = new sns.Topic(scope, 'product-topic', {
    displayName: 'Product subscription topic '
  });

  productTopic.addSubscription(new EmailSubscription('andrius.akula@gmail.com'));

  return productTopic;
}

function createImportFileParserWithQueueFunction(scope: Construct, lambdaEnv: { [key: string]: string }) {
  return new lambda.Function(scope, 'import-file-parser-with-queue-function', {
    ...commonLambdaProps,
    handler: 'import-products-file-handler.importFileParserWithQueue',
    environment: lambdaEnv,
  });
}

function setupImportFileParseWithQueueFunction(lambda: lambda.Function, queue: sqs.Queue) {
  queue.grantSendMessages(lambda);
}

function createCatalogBatchProcessFunction(scope: Construct, lambdaEnv: { [key: string]: string }) {
  return new lambda.Function(scope, 'catalog-batch-process-function', {
    ...commonLambdaProps,
    handler: 'import-products-file-handler.catalogBatchProcess',
    environment: lambdaEnv,
  });
}

// TODO: Enable Partial Batch Failure
// https://docs.aws.amazon.com/lambda/latest/dg/with-sqs.html#services-sqs-batchfailurereporting

function addQueueEventSource(lambda: lambda.Function, queue: sqs.Queue) {
  // Add SQS event source to the Lambda function
  lambda.addEventSource(new SqsEventSource(queue, {
    batchSize: 5, // Process up to 5 messages at a time
    maxBatchingWindow: cdk.Duration.seconds(10), // Wait up to 10 seconds
    // reportBatchItemFailures: true // Enable partial failure
  }));
}

function setupCatalogBatchProcessFunction(lambda: lambda.Function, queue: sqs.Queue, snsTopic: sns.Topic) {
  // Grant Lambda permissions to consume messages from the queue
  queue.grantConsumeMessages(lambda);

  // Grant Lambda permissions to write to DynamoDB
  lambda.addToRolePolicy(productsAndStockWritePolicy);

  // Grant Lambda permissions to publish to SNS topic
  lambda.addToRolePolicy(new iam.PolicyStatement({
    actions: ['sns:Publish'],
    resources: [snsTopic.topicArn]
  }));
}


export class ImportServiceStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const uploadedBucket = createUploadedBucket(this);

    const commonLambdaEnvironment = {
      UPLOADED_BUCKET_NAME: uploadedBucket.bucketName,
    };


    // const importFileParserFunction = createImportFileParserFunction(this, commonLambdaEnvironment);
    // setupImportFileParseFunction(importFileParserFunction);
    // addS3EventHandling(uploadedBucket, importFileParserFunction);


    // SQS Queue for processing products
    const productQueue = createProductQueue(this);

    // SNS product topic
    const productTopic = createSNSProductTopic(this);

    const queuesLambdaEnv = {
      PRODUCTS_QUEUE_URL: productQueue.queueUrl,
    };

    const topicLambdaEnv = {
      PRODUCT_TOPIC_ARN: productTopic.topicArn
    };

    const importFileParserWithQueueFunction = createImportFileParserWithQueueFunction(this, { ...commonLambdaEnvironment, ...queuesLambdaEnv });
    setupImportFileParseWithQueueFunction(importFileParserWithQueueFunction, productQueue);
    addS3EventHandling(uploadedBucket, importFileParserWithQueueFunction);

    const catalogBatchProcessFunction = createCatalogBatchProcessFunction(this, { ...commonLambdaEnvironment, ...queuesLambdaEnv, ...topicLambdaEnv });
    setupCatalogBatchProcessFunction(catalogBatchProcessFunction, productQueue, productTopic);
    addQueueEventSource(catalogBatchProcessFunction, productQueue);

    // API Gateway
    const importProductsFileFunction = createImportProductsFileFunction(this, commonLambdaEnvironment);
    createImportApiEndpoint(this, importProductsFileFunction);
  }
}
