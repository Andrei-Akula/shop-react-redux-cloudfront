import { S3Event, S3EventRecord, SQSEvent, SQSRecord } from 'aws-lambda';
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { randomUUID } from "crypto";
import { DynamoDBDocumentClient,  PutCommand,   } from "@aws-sdk/lib-dynamodb";
import { DeleteMessageCommand, SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import { PublishCommand, SNSClient } from "@aws-sdk/client-sns";

const client = new DynamoDBClient({ });
const docClient = DynamoDBDocumentClient.from(client);

async function  createPresignedUrl({ bucket, key }: { bucket: string; key: string }) {
  const client = new S3Client({ });
  const command = new PutObjectCommand({ Bucket: bucket, Key: key });
  const expiresIn = 60 * 5; // 5 minutes
  return getSignedUrl(client, command, { expiresIn });
}

export async function importProductsFile({ fileName }: { fileName: string }): Promise<{ presignedUrl: string }> {
  if (!fileName) {
    throw new Error("File name is required");
  }
  if (!fileName.endsWith('.csv')) {
    throw new Error("CSV file is required");
  }

  const bucket = process.env.UPLOADED_BUCKET_NAME;
  if (!bucket) {
    throw new Error("UPLOADED_BUCKET_NAME environment variable is not set");
  }

  const key = `uploaded/${fileName}`;

  const presignedUrl = await createPresignedUrl({ bucket, key });

  return {
    presignedUrl
  }
}

type Product = {
  id: string;
  title: string;
  description: string;
  price: number;
};

type Stock = {
    product_id: string;
    count: number;
};

type AvailableProduct = Product & {
    count: number;
};

export function parseProductCsvLine(line: string): AvailableProduct | undefined {
  const trimmedLine = line.trim();
  if (!trimmedLine) return undefined;

  const columns = trimmedLine.split(',');
  if (columns.length < 4) return undefined; // At least id, title, description, and price are required

  const [id, title, description, priceStr, countStr] = columns.map(col => col.trim());
  if (!id || !title || !description || !priceStr) return undefined;

  const price = Number(priceStr);
  if (isNaN(price)) return undefined;

  const count = countStr ? Number(countStr) : 0; // Default count to 0 if not provided

  return { id, title, description, price, count };
}

export interface ActionOptions {
  throw?: boolean
}

export async function addProductToDatabase(product: AvailableProduct, options?: ActionOptions) {
  if (!product.title || !product.price) {
    console.log("Product title and price are required", product.id);
    return product;
  }

  const newProduct: AvailableProduct = {
    ...product,
    id: product.id || randomUUID(),
  };

  const addProduct = new PutCommand({
    TableName: "Products",
    Item: {
      id: newProduct.id,
      title: newProduct.title,
      description: newProduct.description,
      price: newProduct.price.toString(),
    },
  });

  const addStock = new PutCommand({
    TableName: "Stock",
    Item: {
      product_id: newProduct.id,
      count: product.count,
    },
  });

  console.log(`Adding product to DB: ${JSON.stringify(newProduct)}`);

  try {
    await docClient.send(addProduct);
    await docClient.send(addStock);
    console.log(`New product added to DB: ${JSON.stringify(newProduct)}`);
  } catch (error) {
    console.error("Error adding product to database:", error);
    if (options?.throw) {
      throw error;
    }
  }

  return newProduct;
}

export function processCsvLine(line: string, index: number) {
  const product = parseProductCsvLine(line);
  if (!product) {
    console.log(`No valid product data found in line: ${line}`);
    return;
  }

  console.log(`Line "${index}" processed successfully`);
  console.log(`Parsed product: ${JSON.stringify(product)}`);

  return product;
}

export async function processCsvLines(lines: string[]) {
  return Promise.all(lines.map((line, index) => {
    const product = processCsvLine(line, index);
    return product ? addProductToDatabase(product) : Promise.resolve();
  }));
}

export async function getLinesFromRecord(s3Client: S3Client, record: S3EventRecord) {
  const bucket = record.s3.bucket.name;
  const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));

  console.log(`Processing file: ${key} from bucket: ${bucket}`);

  try {
    // Get the file from S3
    const getObjectCommand = new GetObjectCommand({ Bucket: bucket, Key: key });
    const response = await s3Client.send(getObjectCommand);

    console.log(`File retrieved successfully: ${key}`);

    const bodyContents = await response.Body?.transformToString();
    if (!bodyContents) {
      console.log(`No content found in file: ${key}`);
      return;
    }

    const lines = bodyContents.split('\n');
    console.log(`File contains: ${lines.length} lines`);

    return lines;
  } catch (error) {
    console.error(`Error retrieving file ${key} from bucket ${bucket}:`, error);
    return;
  }
};

export async function importFileParser(event: S3Event): Promise<void> {
  const s3Client = new S3Client({ });

  for (const record of event.Records) {
    const lines = await getLinesFromRecord(s3Client, record);
    if (lines) {
      await processCsvLines(lines);
    }
  }
}


export async function sendLinesToQueue(qClient: SQSClient, lines: string[]) {
  if (!qClient) {
    console.log("SQS client is not initialized");
    return;
  }

  const queueUrl = process.env.PRODUCTS_QUEUE_URL;

  for (const line of lines) {
    const params = {
      QueueUrl: queueUrl,
      MessageBody: line,
    };

    try {
      await qClient.send(new SendMessageCommand(params));
      console.log(`Line sent to queue: ${line}`);
    } catch (error) {
      console.error(`Error sending line to queue: ${line}`, error);
    }
  }
}

export async function importFileParserWithQueue(event: S3Event): Promise<void> {
  const s3Client = new S3Client({ });
  const qClient = new SQSClient({ });

  for (const record of event.Records) {
    const lines = await getLinesFromRecord(s3Client, record);
    if (lines) {
      await sendLinesToQueue(qClient, lines);
    }
  }
}

export async function DeleteQueueMessage(qClient: SQSClient, message: SQSRecord) {
  console.log("Deleting message:", message.messageId);

  const queueUrl = process.env.PRODUCTS_QUEUE_URL;
  try {
    await qClient.send(
      new DeleteMessageCommand({
        QueueUrl: queueUrl,
        ReceiptHandle: message.receiptHandle,
      })
    );
    console.log("Message deleted:", message.messageId);
  } catch (error) {
    console.error('Error deleting message:', message.messageId);
  }
}

export async function notifyProductAdded(snsClient: SNSClient, product: AvailableProduct) {
  const topicArn = process.env.PRODUCT_TOPIC_ARN;
  const message = `Product successfully added:
- ID: ${product.id}
- Title: ${product.title}
- Description: ${product.description}
- Price: $${product.price}
- Count: ${product.count}`;

  try {
    await snsClient.send(
      new PublishCommand({
        Message: message,
        TopicArn: topicArn,
      }),
    );
    console.log('Published to Product topic for product', product.id);
  } catch (error) {
    console.error('Error publishing to Product topic');
  }
}

export async function processQueueMessage(qClient: SQSClient, message: SQSRecord) {
  console.log("Processing message:", message.messageId, message.body);

  // Parse message body
  const line = message.body;
  const product = parseProductCsvLine(line);
  if (!product) {
    console.log(`Message: ${message.messageId}. No valid product data found: ${line}`);
    return;
  }

  return await addProductToDatabase(product, { throw: true });
}

/**
 * When you configure an SQS event source for Lambda, AWS manages the message polling and delivery automatically
 * What AWS Does Behind the Scenes:
  1. Polls the queue continuously using ReceiveMessage
  2. Moves messages to "In Flight" state when received
  3. Invokes your Lambda with the messages
  4. Deletes messages automatically if Lambda succeeds
  5. Returns messages to queue if Lambda fails (for retry)
 */

// TODO: implement Partial Batch Failure Handling

export async function catalogBatchProcess(event: SQSEvent): Promise<void> {
  const qClient = new SQSClient({ });
  const snsClient = new SNSClient({});

  for (const message of event.Records) {
    console.log("Received message:", message.body);
    const product = await processQueueMessage(qClient, message);
    if (product) await notifyProductAdded(snsClient, product);
  }
}
