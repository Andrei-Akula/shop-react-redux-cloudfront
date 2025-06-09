import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as cdk from 'aws-cdk-lib';
import * as path from 'path';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';

const productsAndStockPoliicy = new iam.PolicyStatement({
  actions: ["dynamodb:Scan", "dynamodb:GetItem"],
  resources: [
    cdk.Fn.importValue("ProductsTableArn"),
    cdk.Fn.importValue("StockTableArn"),
  ]
});

const commonLambdaFunctionProps = {
  runtime: lambda.Runtime.NODEJS_20_X,
  memorySize: 1024,
  timeout: cdk.Duration.seconds(5),
  code: lambda.Code.fromAsset(path.join(__dirname, './products-lambda-handlers')),
};

function addGetProductsList(scope: Construct, productsResource: apigateway.Resource) {
  const getProductsListFunction = new lambda.Function(scope, 'get-products-list', {
      ...commonLambdaFunctionProps,
      handler: 'products-handlers.getProductsList',
    });

    getProductsListFunction.addToRolePolicy(productsAndStockPoliicy);

    const getProductsListIntegration = new apigateway.LambdaIntegration(getProductsListFunction, {
      integrationResponses: [
        {
          statusCode: "200",
          responseParameters: {
            'method.response.header.Access-Control-Allow-Origin': "'*'",
            'method.response.header.Access-Control-Allow-Methods': "'GET'",
          },
        },
        {
          statusCode: "403",
          selectionPattern: ".+is not authorized", // Assuming the Lambda function throws an error with this message
          responseParameters: {
            "method.response.header.Access-Control-Allow-Origin": "'*'",
            "method.response.header.Access-Control-Allow-Methods": "'GET'",
          },
        },
      ],
      requestTemplates: {
        "application/json": `{}` // No request body needed for this endpoint
      },
      passthroughBehavior: apigateway.PassthroughBehavior.NEVER,
      proxy: false,
    });

    // Create a resource /products and GET request under it
    productsResource.addMethod('GET', getProductsListIntegration, {
      methodResponses: [
        {
          statusCode: "200",
          responseModels: {
            "application/json": apigateway.Model.EMPTY_MODEL
          },
          responseParameters: {
            'method.response.header.Access-Control-Allow-Origin': true,
            'method.response.header.Access-Control-Allow-Methods': true,
          },
        },
        {
          statusCode: "403",
          responseModels: {
            "application/json": apigateway.Model.ERROR_MODEL
          },
          responseParameters: {
            'method.response.header.Access-Control-Allow-Origin': true,
            'method.response.header.Access-Control-Allow-Methods': true,
          },
        },
      ]
    });

    productsResource.addCorsPreflight({
      allowOrigins: ['*'], // Replace with your frontend URL
      allowMethods: ['GET'], // Allow GET method
    });

    return productsResource;
}

function addGetProductById(scope: Construct, resource: apigateway.Resource) {
  const getProductByIdFunction = new lambda.Function(scope, 'get-product-by-id', {
      ...commonLambdaFunctionProps,
      handler: 'products-handlers.getProductById',
    });

    getProductByIdFunction.addToRolePolicy(productsAndStockPoliicy);

    const getProductByIdIntegration = new apigateway.LambdaIntegration(
      getProductByIdFunction,
      {
        integrationResponses: [
          {
            statusCode: "200",
            responseParameters: {
              "method.response.header.Access-Control-Allow-Origin": "'*'",
              "method.response.header.Access-Control-Allow-Methods": "'GET'",
            },
          },
          {
            statusCode: "400",
            selectionPattern: ".+is required", // Assuming the Lambda function throws an error with this message
            responseParameters: {
              "method.response.header.Access-Control-Allow-Origin": "'*'",
              "method.response.header.Access-Control-Allow-Methods": "'GET'",
            },
          },
          {
            statusCode: "403",
            selectionPattern: ".+is not authorized", // Assuming the Lambda function throws an error with this message
            responseParameters: {
              "method.response.header.Access-Control-Allow-Origin": "'*'",
              "method.response.header.Access-Control-Allow-Methods": "'GET'",
            },
          },
          {
            statusCode: "404",
            selectionPattern: ".+not found", // Assuming the Lambda function throws an error with this message
            responseParameters: {
              "method.response.header.Access-Control-Allow-Origin": "'*'",
              "method.response.header.Access-Control-Allow-Methods": "'GET'",
            },
          },
        ],
        requestTemplates: {
          "application/json": `{ "id": "$input.params('id')" }`, // Map the path parameter id
        },
        passthroughBehavior: apigateway.PassthroughBehavior.NEVER,
        proxy: false,
      }
    );

    // Create a resource /products/{id} and GET request under it
    resource.addMethod('GET', getProductByIdIntegration, {
      methodResponses: [
        {
          statusCode: "200",
          responseModels: {
            "application/json": apigateway.Model.EMPTY_MODEL
          },
          responseParameters: {
            'method.response.header.Access-Control-Allow-Origin': true,
            'method.response.header.Access-Control-Allow-Methods': true,
          },
        },
        {
          statusCode: "400",
          responseModels: {
            "application/json": apigateway.Model.ERROR_MODEL
          },
          responseParameters: {
            'method.response.header.Access-Control-Allow-Origin': true,
            'method.response.header.Access-Control-Allow-Methods': true,
          },
        },
        {
          statusCode: "403",
          responseModels: {
            "application/json": apigateway.Model.ERROR_MODEL
          },
          responseParameters: {
            'method.response.header.Access-Control-Allow-Origin': true,
            'method.response.header.Access-Control-Allow-Methods': true,
          },
        },
        {
          statusCode: "404",
          responseModels: {
            "application/json": apigateway.Model.ERROR_MODEL
          },
          responseParameters: {
            'method.response.header.Access-Control-Allow-Origin': true,
            'method.response.header.Access-Control-Allow-Methods': true,
          },
        }
      ],
      // requestParameters
    });

    resource.addCorsPreflight({
      allowOrigins: ['*'], // Replace with your frontend URL
      allowMethods: ['GET'], // Allow GET method
    });

    return resource;
}

export class ProductsLambdaStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const api = new apigateway.RestApi(this, "products-api", {
      restApiName: "Products API Gateway",
      description: "This Products API serves the Lambda functions."
    });

    // Create a resource /products and GET request under it
    const productsResource = api.root.addResource('products');
    addGetProductsList(this, productsResource);

    // Create a resource /products/{id} and GET request under it
    const productByIdResource = productsResource.addResource('{id}');
    addGetProductById(this, productByIdResource);
  }
}