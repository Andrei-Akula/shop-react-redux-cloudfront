import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

export class TablesStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create a DynamoDB table for products
    const productsTable = new dynamodb.Table(this, 'ProductsTable', {
      tableName: 'Products',
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'title', type: dynamodb.AttributeType.STRING }, // Optional, if you want to sort by title
      removalPolicy: cdk.RemovalPolicy.DESTROY, // Only for dev/test environments
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    });

    // Output the table name
    new cdk.CfnOutput(this, 'ProductsTableName', {
      value: productsTable.tableName,
      description: 'The name of the Products DynamoDB table',
      exportName: 'ProductsTableName',
    });

    // Create a DynamoDB table for stock products
    const stockTable = new dynamodb.Table(this, 'StockTable', {
      tableName: 'Stock',
      partitionKey: { name: 'product_id', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'count', type: dynamodb.AttributeType.NUMBER }, // Optional, if you want to sort by count
      removalPolicy: cdk.RemovalPolicy.DESTROY, // Only for dev/test environments
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    });

    // Output the table name
    new cdk.CfnOutput(this, 'StockTableName', {
      value: stockTable.tableName,
      description: 'The name of the Stock Products DynamoDB table',
      exportName: 'StockTableName',
    });
  }
}
