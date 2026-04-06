/**
 * Recursively convert null values to undefined
 * Also removes keys with undefined values from objects
 * Useful for normalizing data from external APIs
 * 
 * @param value - The value to normalize
 * @returns Normalized value with null replaced by undefined
 */
export function deepNullToUndefined(value: any): any {
  if (value === null) return undefined;

  if (Array.isArray(value)) {
    return value.map(deepNullToUndefined);
  }

  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .map(([key, val]) => [key, deepNullToUndefined(val)])
        .filter(([, val]) => val !== undefined)
    );
  }

  return value;
}
