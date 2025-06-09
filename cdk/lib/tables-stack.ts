import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import {
  aws_s3,
  aws_s3_deployment,
  CfnOutput,
  RemovalPolicy,
} from "aws-cdk-lib";

const productsSeedsPath = "../table-seeds/products";
const stockSeedsPath = "../table-seeds/stock";

export class TablesStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);


    // Create a DynamoDB table for products
    // First, import the bucket from another stack
    const productsSeedBucket = aws_s3.Bucket.fromBucketName(
      this,
      "ImportedProductsSeedBucket",
      cdk.Fn.importValue("ProductsSeedBucketName") // Assuming the bucket name was exported in the other stack
    );

    const productsTable = new dynamodb.Table(this, "ProductsTable", {
      tableName: "Products",
      partitionKey: { name: "id", type: dynamodb.AttributeType.STRING },
      removalPolicy: cdk.RemovalPolicy.DESTROY, // Only for dev/test environments
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      importSource: {
        compressionType: dynamodb.InputCompressionType.NONE,
        inputFormat: dynamodb.InputFormat.csv({
          delimiter: ",",
        }),
        bucket: productsSeedBucket,
      },
    });

    // Output the table name
    new CfnOutput(this, "ProductsTableName", {
      value: productsTable.tableName,
      description: "The name of the Products DynamoDB table",
      exportName: "ProductsTableName",
    });

    new CfnOutput(this, "ProductsTableArn", {
      value: productsTable.tableArn,
      description: "The Arn of the Products DynamoDB table",
      exportName: "ProductsTableArn",
    });

    // Create a DynamoDB table for stock products
    // First, import the bucket from another stack
    const stockSeedBucket = aws_s3.Bucket.fromBucketName(
      this,
      "ImportedStockSeedBucket",
      cdk.Fn.importValue("StockSeedBucketName") // Assuming the bucket name was exported in the other stack
    );

    const stockTable = new dynamodb.Table(this, "StockTable", {
      tableName: "Stock",
      partitionKey: { name: "product_id", type: dynamodb.AttributeType.STRING },
      removalPolicy: RemovalPolicy.DESTROY, // Only for dev/test environments
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      importSource: {
        compressionType: dynamodb.InputCompressionType.NONE,
        inputFormat: dynamodb.InputFormat.csv({
          delimiter: ",",
        }),
        bucket: stockSeedBucket,
      },
    });

    // Output the table name
    new CfnOutput(this, "StockTableName", {
      value: stockTable.tableName,
      description: "The name of the Stock Products DynamoDB table",
      exportName: "StockTableName",
    });

    new CfnOutput(this, "StockTableArn", {
      value: stockTable.tableArn,
      description: "The Arn of the Stock Products DynamoDB table",
      exportName: "StockTableArn",
    });
  }
}
