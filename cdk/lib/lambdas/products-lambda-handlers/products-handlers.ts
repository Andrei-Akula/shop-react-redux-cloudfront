import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { randomUUID } from "crypto";
import { DeleteCommand, DynamoDBDocumentClient, GetCommand, NativeAttributeValue, PutCommand, ScanCommand, ScanCommandOutput  } from "@aws-sdk/lib-dynamodb";


const PRODUCTS_TABLE_NAME = 'Products';
const STOCK_TABLE_NAME = 'Stock';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

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

const getStockCount = (productId: string, stock: Stock[]): number => {
    const stockItem = stock.find(s => s.product_id === productId);
    return stockItem ? stockItem.count : 0;
  };
  
const mergeProductsWithStock = (products: Product[], stock: Stock[]): AvailableProduct[] => 
  products.map((product) => ({
    ...product,
    count: getStockCount(product.id, stock),
  }));


export async function getProductsList(): Promise<AvailableProduct[]> {
  const getAllProducts = new ScanCommand({
    TableName: PRODUCTS_TABLE_NAME,
  });

  const getAllStock = new ScanCommand({
    TableName: STOCK_TABLE_NAME,
  });

  console.log(`Getting product list from DB`);

  const [productsResponse, stockResponse] = await Promise.all([
    docClient.send(getAllProducts), 
    docClient.send(getAllStock)
  ]);

  const products: Product[] = productsResponse.Items as Product[] ?? [];
  const stock: Stock[] = stockResponse.Items as Stock[] ?? [];

  return mergeProductsWithStock(products, stock);
}

export async function getProductById(event: any): Promise<AvailableProduct | undefined> {
  const id = event.id;
  if (!id) {
    throw new Error("Product ID is required");
  }

  const getProduct = new GetCommand({
    TableName: PRODUCTS_TABLE_NAME,
    Key: {
      id: `${id}`,
    },
  });

  const getStock = new GetCommand({
    TableName: STOCK_TABLE_NAME,
    Key: {
      product_id: `${id}`,
    },
  });

  console.log(`Getting product ${id} from DB`);

  const [productResponse, stockResponse] = await Promise.all([
    docClient.send(getProduct),
    docClient.send(getStock)
  ]);
  
  if (!productResponse.Item) {
    throw new Error(`Product with id ${id} not found`);
  }

  const product = productResponse.Item as Product;
  const count = stockResponse.Item ? (stockResponse.Item as Stock).count : 0;

  return  ({
    ...product,
    count
  });
}

export async function createProduct(product: AvailableProduct): Promise<AvailableProduct> {
  if (!product.title || !product.price) {
    throw new Error("Product title and price are required");
  }

  const count = product.count || 0; // Default count to 0 if not provided
  const newProduct: AvailableProduct = {
    ...product,
    id: randomUUID(),
    count
  };

  const addProduct = new PutCommand({
    TableName: PRODUCTS_TABLE_NAME,
    Item: {
      id: newProduct.id,
      title: newProduct.title,
      description: newProduct.description,
      price: newProduct.price.toString(),
    },
  });

  const addStock = new PutCommand({
    TableName: STOCK_TABLE_NAME,
    Item: {
      product_id: newProduct.id,
      count: count,
    },
  });

  console.log(`Adding new product ${newProduct.id} in DB`);

  await Promise.all([
    docClient.send(addProduct),
    docClient.send(addStock)
  ]);
  
  return newProduct; 
}

export async function updateProductById({ id, product }: {id: string, product: AvailableProduct }): Promise<AvailableProduct> {
  if (!id) {
    throw new Error("Product ID is required");
  }

  if (!product.title || !product.price) {
    throw new Error("Product title and price are required");
  }

  const addProduct = new PutCommand({
    TableName: PRODUCTS_TABLE_NAME,
    Item: {
      id,
      title: product.title,
      description: product.description,
      price: product.price.toString(),
    },
  });

  const addStock = new PutCommand({
    TableName: STOCK_TABLE_NAME,
    Item: {
      product_id: product.id,
      count: product.count || 0, // Default count to 0 if not provided
    },
  });

  console.log(`Updating product ${id} in DB`);

  await Promise.all([
    docClient.send(addProduct),
    docClient.send(addStock)
  ]);
  
  return product; 
}

export async function deleteProductById({ id }: {id: string }) {
  if (!id) {
    throw new Error("Product ID is required");
  }

  const deleteProduct = new DeleteCommand({
    TableName: PRODUCTS_TABLE_NAME,
    Key: {
      id,
    },
  });

  const deleteStocks = new DeleteCommand({
    TableName: STOCK_TABLE_NAME,
    Key: {
      product_id: id,
    },
  });

  console.log(`Deleting product ${id} from DB`);
  
  await Promise.all([
    docClient.send(deleteProduct),
    docClient.send(deleteStocks),
  ]);

  return `Product with id ${id} has been successfully deleted`;
}