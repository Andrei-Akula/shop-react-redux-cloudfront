import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

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