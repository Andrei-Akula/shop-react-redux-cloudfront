
type Product = {
    id: string | undefined;
    title: string;
    description: string;
    price: number;
};

export const products: Product[] = [
  {
    description: "Short Product Description1",
    id: "7567ec4b-b10c-48c5-9345-fc73c48a80aa",
    price: 24,
    title: "ProductOne",
  },
  {
    description: "Short Product Description7",
    id: "7567ec4b-b10c-48c5-9345-fc73c48a80a1",
    price: 15,
    title: "ProductTitle",
  },
  {
    description: "Short Product Description2",
    id: "7567ec4b-b10c-48c5-9345-fc73c48a80a3",
    price: 23,
    title: "Product",
  },
  {
    description: "Short Product Description4",
    id: "7567ec4b-b10c-48c5-9345-fc73348a80a1",
    price: 15,
    title: "ProductTest",
  },
  {
    description: "Short Product Descriptio1",
    id: "7567ec4b-b10c-48c5-9445-fc73c48a80a2",
    price: 23,
    title: "Product2",
  },
  {
    description: "Short Product Description7",
    id: "7567ec4b-b10c-45c5-9345-fc73c48a80a1",
    price: 15,
    title: "ProductName",
  },
];

type AvailableProduct = {
    id: string | undefined;
    title: string;
    description: string;
    price: number;
    count: number;
};
export const availableProducts: AvailableProduct[] = products.map(
  (product, index) => ({ ...product, count: index + 1 })
);

export async function getProductsList(): Promise<AvailableProduct[]> {
  return availableProducts;
}

export async function getProductById(event: any): Promise<AvailableProduct | undefined> {
  const id = event.id;
  if (!id) {
    throw new Error("Product ID is required");
  }
  const product = availableProducts.find((p) => p.id === id);
  if (!product) {
    throw new Error(`Product with id ${id} not found`);
  }
  return  product;
}