import { Product } from '../types';

/**
 * Find duplicate products based on product name
 * Returns groups of products that have the same name
 */
export function findDuplicateProducts(products: Product[]): Product[][] {
  const grouped: Record<string, Product[]> = {};
  
  // Group by normalized product name
  for (const product of products) {
    const key = product.name.toLowerCase().trim();
    if (!grouped[key]) {
      grouped[key] = [];
    }
    grouped[key].push(product);
  }
  
  // Return only groups with more than 1 product
  return Object.values(grouped).filter(group => group.length > 1);
}

/**
 * Auto-deduplicate products by keeping the first one and removing others with same name
 */
export function autoDeduplicateProducts(products: Product[]): {
  unique: Product[];
  removed: Product[];
} {
  const seen = new Set<string>();
  const unique: Product[] = [];
  const removed: Product[] = [];
  
  for (const product of products) {
    const key = product.name.toLowerCase().trim();
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(product);
    } else {
      removed.push(product);
    }
  }
  
  return { unique, removed };
}

/**
 * Get deduplication statistics
 */
export function getDeduplicationStats(products: Product[]): {
  totalProducts: number;
  uniqueNames: number;
  duplicateGroups: number;
  duplicateCount: number;
} {
  const groups = findDuplicateProducts(products);
  const uniqueNames = new Set(products.map(p => p.name.toLowerCase().trim())).size;
  
  let duplicateCount = 0;
  for (const group of groups) {
    duplicateCount += group.length - 1; // Count all except first
  }
  
  return {
    totalProducts: products.length,
    uniqueNames,
    duplicateGroups: groups.length,
    duplicateCount,
  };
}

/**
 * Merge products - keep primary, mark others for deletion
 */
export async function mergeProducts(
  primaryId: string,
  duplicateIds: string[]
): Promise<{ success: boolean; error?: string }> {
  try {
    // Delete duplicate products
    for (const id of duplicateIds) {
      const response = await fetch(`/api/products/${id}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        throw new Error(`Failed to delete product ${id}`);
      }
    }
    
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
