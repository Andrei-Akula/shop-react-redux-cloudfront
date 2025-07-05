import { S3Event, S3EventRecord } from 'aws-lambda';
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { randomUUID } from "crypto";
import { DynamoDBDocumentClient,  PutCommand,   } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({ region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION });
const docClient = DynamoDBDocumentClient.from(client);

async function  createPresignedUrl({ region, bucket, key }: { region: string; bucket: string; key: string }) {
  const client = new S3Client({ region });
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

  const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION;
  if (!region) {
    throw new Error("Region is not set");
  }

  const key = `uploaded/${fileName}`;
  
  const presignedUrl = await createPresignedUrl({ region, bucket, key });

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

export async function addProductToDatabase(product: AvailableProduct) {
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

export async function processRecord (s3Client: S3Client, record: S3EventRecord) {
  const bucket = record.s3.bucket.name;
  const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));
  
  console.log(`Processing file: ${key} from bucket: ${bucket}`);
  
  try {
    // Get the file from S3
    const getObjectCommand = new GetObjectCommand({ Bucket: bucket, Key: key });
    const response = await s3Client.send(getObjectCommand);
    
    console.log(`File retrieved successfully: ${key}`);
    console.log(`File size: ${response.ContentLength} bytes`);

    // parse the CSV data and process it
    console.log('Transforming file contents to string...');
    
    const bodyContents = await response.Body?.transformToString();
    if (!bodyContents) {
      console.log(`No content found in file: ${key}`);
      return;
    }

    const lines = bodyContents.split('\n');
    console.log(`File contains: ${lines.length} lines`);

    // Parse the CSV data and process it
    await Promise.all(lines.map((line, index) => {
      const product = processCsvLine(line, index);
      return product ? addProductToDatabase(product) : Promise.resolve();
    }));
  } catch (error) {
    console.error(`Error retrieving file ${key} from bucket ${bucket}:`, error);
    return;
  }
};

export async function importFileParser(event: S3Event): Promise<void> {
  const s3Client = new S3Client({ region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION });

  for (const record of event.Records) {
      await processRecord(s3Client, record);
  }
}