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

export class TablesSeedsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const productsSeedBucket = new aws_s3.Bucket(this, "ProductsSeedBucket", {
      blockPublicAccess: aws_s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    new aws_s3_deployment.BucketDeployment(
      this,
      "ProductsSeedBucketDeployment",
      {
        sources: [aws_s3_deployment.Source.asset(productsSeedsPath)],
        destinationBucket: productsSeedBucket,
      }
    );

    new CfnOutput(this, "ProductsSeedBucketName", {
      value: productsSeedBucket.bucketName,
      description: "The name of the ProductsSeedBucket S3 bucket",
      exportName: "ProductsSeedBucketName",
    });

    const stockSeedBucket = new aws_s3.Bucket(this, "StockSeedBucket", {
      blockPublicAccess: aws_s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    new aws_s3_deployment.BucketDeployment(
      this,
      "StockSeedBucketDeployment",
      {
        sources: [aws_s3_deployment.Source.asset(stockSeedsPath)],
        destinationBucket: stockSeedBucket,
      }
    );

    new CfnOutput(this, "StockSeedBucketName", {
      value: stockSeedBucket.bucketName,
      description: "The name of the StockSeedBucket S3 bucket",
      exportName: "StockSeedBucketName",
    });
  }
}