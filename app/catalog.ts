import { productCategories } from "./domain/product";
import type { Category } from "./domain/product";

export type { Category, Product } from "./domain/product";

export const categories: Category[] = ["All gifts", ...productCategories];
