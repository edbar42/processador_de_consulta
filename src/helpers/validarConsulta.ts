import type { Schema } from "./schemas";
import { parseSqlQuery } from "./sqlParser";

type ValidationResult = {
  valid: boolean;
  error: string;
};

export default function validarConsulta(
  query: string,
  schema: Schema,
): ValidationResult {
  try {
    parseSqlQuery(query, schema);
    return { valid: true, error: "" };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : "Consulta inválida.",
    };
  }
}
