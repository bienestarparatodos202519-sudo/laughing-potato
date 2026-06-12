import type { ContactRow } from "./types";

const VARIABLE_PATTERN = /\{\{\s*([^{}]+?)\s*\}\}/g;

export function extractTemplateVariables(template: string): string[] {
  const variables = new Set<string>();
  let match: RegExpExecArray | null;

  while ((match = VARIABLE_PATTERN.exec(template)) !== null) {
    variables.add(match[1].trim());
  }

  return Array.from(variables);
}

export function renderMessage(template: string, contact: ContactRow): string {
  return template.replace(VARIABLE_PATTERN, (_token, rawName: string) => {
    const column = rawName.trim();
    const value = contact.values[column];

    if (value === null || value === undefined) {
      return "";
    }

    return String(value).trim();
  });
}

export function getMissingVariables(template: string, columns: string[]): string[] {
  const known = new Set(columns);
  return extractTemplateVariables(template).filter((variable) => !known.has(variable));
}

export function insertVariableAtCursor(
  template: string,
  variable: string,
  selectionStart: number,
  selectionEnd: number
): { value: string; cursor: number } {
  const token = `{{${variable}}}`;
  const value = `${template.slice(0, selectionStart)}${token}${template.slice(selectionEnd)}`;

  return {
    value,
    cursor: selectionStart + token.length
  };
}
