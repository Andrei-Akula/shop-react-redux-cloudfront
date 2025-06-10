import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as cdk from 'aws-cdk-lib';
import * as path from 'path';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';
import { IdentitySource, RequestAuthorizer, TokenAuthorizer } from 'aws-cdk-lib/aws-apigateway';

const productsAndStockReadPoliicy = new iam.PolicyStatement({
  actions: ["dynamodb:Scan", "dynamodb:GetItem"],
  resources: [
    cdk.Fn.importValue("ProductsTableArn"),
    cdk.Fn.importValue("StockTableArn"),
  ]
});

const productsAndStockWritePoliicy = new iam.PolicyStatement({
  actions: ["dynamodb:PutItem"],
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

const commonIntegrationGetResponseParameters = {
  "method.response.header.Access-Control-Allow-Origin": "'*'",
  "method.response.header.Access-Control-Allow-Methods": "'GET'",
};

const commonIntegrationGetPostResponseParameters = {
  "method.response.header.Access-Control-Allow-Origin": "'*'",
  "method.response.header.Access-Control-Allow-Methods": "'GET','POST','PUT'",
};

const commonResponseRaparameters = {
  'method.response.header.Access-Control-Allow-Origin': true,
  'method.response.header.Access-Control-Allow-Methods': true,
};

const commonIntegrationResponses = [
  {
    statusCode: "200",
    responseParameters: commonIntegrationGetPostResponseParameters,
  },
  {
    statusCode: "400",
    selectionPattern: ".+is required", // Assuming the Lambda function throws an error with this message
    responseParameters: commonIntegrationGetPostResponseParameters,
  },
  {
    statusCode: "401",
    selectionPattern: ".+is not authorized", // Assuming the Lambda function throws an error with this message
    responseParameters: commonIntegrationGetPostResponseParameters,
  },
  {
    statusCode: "403",
    selectionPattern: ".*(denied|Missing Authentication Token).*", // Assuming the Lambda function throws an error with this message
    responseParameters: commonIntegrationGetPostResponseParameters,
  },
  {
    statusCode: "404",
    selectionPattern: ".+not found", // Assuming the Lambda function throws an error with this message
    responseParameters: commonIntegrationGetPostResponseParameters,
  },
  {
    statusCode: "500",
    selectionPattern: ".+", // Catch-all for any other error
    responseParameters: commonIntegrationGetPostResponseParameters,
  },
];

const commonMethodResponses = [
  {
    statusCode: "200",
    responseModels: {
      "application/json": apigateway.Model.EMPTY_MODEL,
    },
    responseParameters: commonResponseRaparameters,
  },
  {
    statusCode: "400",
    responseModels: {
      "application/json": apigateway.Model.ERROR_MODEL,
    },
    responseParameters: commonResponseRaparameters,
  },
  {
    statusCode: "401",
    responseModels: {
      "application/json": apigateway.Model.ERROR_MODEL,
    },
    responseParameters: commonResponseRaparameters,
  },
  {
    statusCode: "403",
    responseModels: {
      "application/json": apigateway.Model.ERROR_MODEL,
    },
    responseParameters: commonResponseRaparameters,
  },
  {
    statusCode: "404",
    responseModels: {
      "application/json": apigateway.Model.ERROR_MODEL,
    },
    responseParameters: commonResponseRaparameters,
  },
  {
    statusCode: "500",
    responseModels: {
      "application/json": apigateway.Model.ERROR_MODEL,
    },
    responseParameters: commonResponseRaparameters,
  },
];

function addGetProductsList(scope: Construct, productsResource: apigateway.Resource) {
  const getProductsListFunction = new lambda.Function(scope, 'get-products-list', {
      ...commonLambdaFunctionProps,
      handler: 'products-handlers.getProductsList',
    });

    getProductsListFunction.addToRolePolicy(productsAndStockReadPoliicy);

    const getProductsListIntegration = new apigateway.LambdaIntegration(getProductsListFunction, {
      integrationResponses: [
        {
          statusCode: "200",
          responseParameters: commonIntegrationGetResponseParameters,
        },
        {
          statusCode: "401",
          selectionPattern: ".+is not authorized", // Assuming the Lambda function throws an error with this message
          responseParameters: commonIntegrationGetResponseParameters,
        },
        {
          statusCode: "403",
          selectionPattern: ".*(denied|Missing Authentication Token).*", // Assuming the Lambda function throws an error with this message
          responseParameters: commonIntegrationGetPostResponseParameters,
        },
        {
          statusCode: "500",
          selectionPattern: ".+", // Catch-all for any other error
          responseParameters: commonIntegrationGetResponseParameters,
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
          responseParameters: commonResponseRaparameters,
        },
        {
          statusCode: "401",
          responseModels: {
            "application/json": apigateway.Model.ERROR_MODEL
          },
          responseParameters: commonResponseRaparameters,
        },
        {
          statusCode: "403",
          responseModels: {
            "application/json": apigateway.Model.ERROR_MODEL
          },
          responseParameters: commonResponseRaparameters,
        },
        {
          statusCode: "500",
          responseModels: {
            "application/json": apigateway.Model.ERROR_MODEL
          },
          responseParameters: commonResponseRaparameters,
        },
      ]
    });

    return productsResource;
}

function addGetProductById(scope: Construct, resource: apigateway.Resource) {
  const getProductByIdFunction = new lambda.Function(
    scope,
    "get-product-by-id",
    {
      ...commonLambdaFunctionProps,
      handler: "products-handlers.getProductById",
    }
  );

  getProductByIdFunction.addToRolePolicy(productsAndStockReadPoliicy);

  const getProductByIdIntegration = new apigateway.LambdaIntegration(
    getProductByIdFunction,
    {
      integrationResponses: commonIntegrationResponses,
      requestTemplates: {
        "application/json": `{ "id": "$input.params('id')" }`, // Map the path parameter id
      },
      passthroughBehavior: apigateway.PassthroughBehavior.NEVER,
      proxy: false,
    }
  );

  // Create a resource /products/{id} and GET request under it
  resource.addMethod("GET", getProductByIdIntegration, {
    methodResponses: commonMethodResponses,
  });

  return resource;
}

function addCreateProduct(scope: Construct, resource: apigateway.Resource, authorizer: apigateway.IAuthorizer) {
  const createProductFunction = new lambda.Function(
    scope,
    "create-product",
    {
      ...commonLambdaFunctionProps,
      handler: "products-handlers.createProduct",
    }
  );

  createProductFunction.addToRolePolicy(productsAndStockWritePoliicy);

  const createProductIntegration = new apigateway.LambdaIntegration(
    createProductFunction,
    {
      integrationResponses: commonIntegrationResponses,
      requestTemplates: {
        "application/json": `$input.json('$')`, // Pass the entire request body as JSON
      },
      passthroughBehavior: apigateway.PassthroughBehavior.NEVER,
      proxy: false,
    }
  );

  // Create a resource /products and POST request under it
  resource.addMethod("POST", createProductIntegration, {
    methodResponses: commonMethodResponses,
    authorizer,
    authorizationType: apigateway.AuthorizationType.CUSTOM,
  });

  return resource;
}

function addUpdateProductById(scope: Construct, resource: apigateway.Resource, authorizer: apigateway.IAuthorizer) {
  const updateProductByIdFunction = new lambda.Function(
    scope,
    "update-product-by-id",
    {
      ...commonLambdaFunctionProps,
      handler: "products-handlers.updateProductById",
    }
  );

  updateProductByIdFunction.addToRolePolicy(productsAndStockWritePoliicy);

  const updateProductByIdIntegration = new apigateway.LambdaIntegration(
    updateProductByIdFunction,
    {
      integrationResponses: commonIntegrationResponses,
      requestTemplates: {
        "application/json": `{ "id": "$input.params('id')", "product": $input.json('$') }`, // Map the path parameter id and pass the entire request body as JSON
      },
      passthroughBehavior: apigateway.PassthroughBehavior.NEVER,
      proxy: false,
    }
  );

  // Create a resource /products/{id} and PUT request under it
  resource.addMethod("PUT", updateProductByIdIntegration, {
    methodResponses: commonMethodResponses,
    authorizer,
    authorizationType: apigateway.AuthorizationType.CUSTOM,
  });

  return resource;
}

export class ProductsLambdaStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const tokenAuthorizerFunction = new lambda.Function(this, 'token-authorizer-function', {
      runtime: lambda.Runtime.NODEJS_20_X,
      memorySize: 1024,
      timeout: cdk.Duration.seconds(5),
      handler: 'authorizer-handler.tokenAuthorizerHandler',
      code: lambda.Code.fromAsset(path.join(__dirname, './authorizer-handler')),
    });

    const authorizer = new TokenAuthorizer(this, 'TokenAuthorizer', {
      handler: tokenAuthorizerFunction,
    });
    // const authorizer = new RequestAuthorizer(this, 'RequestAuthorizer', {
    //   handler: requestAuthorizerFunction,
    //   identitySources: [IdentitySource.header('Authorization')],
    // });

    const api = new apigateway.RestApi(this, "products-api", {
      restApiName: "Products API Gateway",
      description: "This Products API serves the Lambda functions.",
      defaultMethodOptions: {
        authorizationType: apigateway.AuthorizationType.NONE, // No authorization for simplicity
      }
    });

    // Create a resource /products and GET request under it
    const productsResource = api.root.addResource('products');
    
    productsResource.addCorsPreflight({
      allowOrigins: ['*'], // Replace with your frontend URL
      allowMethods: ['GET,POST'], // Allow GET method
    });

    addGetProductsList(this, productsResource);
    addCreateProduct(this, productsResource, authorizer);

    // Create a resource /products/{id} 
    const productByIdResource = productsResource.addResource('{id}');

    productByIdResource.addCorsPreflight({
      allowOrigins: ['*'], // Replace with your frontend URL
      allowMethods: ['GET,PUT'],
    });

    // GET - get product by id request
    addGetProductById(this, productByIdResource);
    // PUT - update the existing product request
    addUpdateProductById(this, productByIdResource, authorizer);
  }
}

