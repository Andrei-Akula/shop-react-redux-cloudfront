#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { DeployWebAppStack } from '../lib/stacks/DeployWebAppStack/deploy-web-app-stack';
import { ProductsLambdaStack } from '../lib/stacks/ProductsLambdaStack/products-lambda-stack';
import { TablesStack } from '../lib/stacks/TablesStack/tables-stack';
import { TablesSeedsStack } from '../lib/stacks/TablesSeedsStack/tables-seeds-stack';
import { ImportServiceStack } from '../lib/stacks/ImportServiceStack/import-service-stack';

// Load environment variables from .env file
dotenv.config({ path: path.join(__dirname, '../.env') });

// Create the CDK application
// This is the entry point for the CDK application
// It initializes the CDK app and creates the stacks defined in the application
// Each stack represents a collection of AWS resources that are provisioned together
// The stacks are defined in separate files and imported here

const app = new cdk.App();

new DeployWebAppStack(app, 'DeployWebAppStack', {
  /* If you don't specify 'env', this stack will be environment-agnostic.
   * Account/Region-dependent features and context lookups will not work,
   * but a single synthesized template can be deployed anywhere. */

  /* Uncomment the next line to specialize this stack for the AWS Account
   * and Region that are implied by the current CLI configuration. */
  // env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },

  /* Uncomment the next line if you know exactly what Account and Region you
   * want to deploy the stack to. */
  // env: { account: '123456789012', region: 'us-east-1' },

  /* For more information, see https://docs.aws.amazon.com/cdk/latest/guide/environments.html */
});

new ProductsLambdaStack(app, 'ProductsLambdaStack', {});

new TablesSeedsStack(app, 'TablesSeedsStack', {});

new TablesStack(app, 'TablesStack', {});

new ImportServiceStack(app, 'ImportServiceStack', {});
