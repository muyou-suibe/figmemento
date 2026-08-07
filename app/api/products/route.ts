import { loadProductCatalog } from "../../application/product-catalog";
import { ServerConfigurationError } from "../../config/server";
import { createProductRepository } from "../../infrastructure/products/product-repository-factory";

export async function GET() {
  try {
    const { repository, source } = createProductRepository();
    const result = await loadProductCatalog(repository, source);
    if (result.status === "unavailable") {
      console.error("Product catalog source is unavailable", { source });
      return Response.json({ error: "Gift catalog is temporarily unavailable." }, { status: 503 });
    }
    return Response.json({ products: result.products, source: result.source });
  } catch (error) {
    if (error instanceof ServerConfigurationError) {
      console.error("Product catalog configuration is unavailable", { key: error.key });
      return Response.json({ error: "Gift catalog is temporarily unavailable." }, { status: 503 });
    }
    console.error("Product catalog failed", error);
    return Response.json({ error: "Gift catalog is temporarily unavailable." }, { status: 503 });
  }
}
