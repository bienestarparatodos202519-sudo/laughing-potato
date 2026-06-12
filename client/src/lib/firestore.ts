export function sanitizeForFirestore<T extends Record<string, unknown>>(input: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(input)
      .map(([key, value]) => [key, cleanValue(value)])
      .filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

function cleanValue(value: unknown): unknown {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (value instanceof File) {
    return undefined;
  }

  if (Array.isArray(value)) {
    const cleanedArray = value.map(cleanValue).filter((item) => item !== undefined);
    return cleanedArray.length > 0 ? cleanedArray : undefined;
  }

  if (typeof value === "object") {
    const cleanedObject = Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .map(([key, nestedValue]) => [key, cleanValue(nestedValue)])
        .filter(([, nestedValue]) => nestedValue !== undefined),
    );

    return Object.keys(cleanedObject).length > 0 ? cleanedObject : undefined;
  }

  return value;
}
