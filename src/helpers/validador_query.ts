import type { Schema } from "./schemas";
import { parseSqlQuery } from "./sqlParser";

/**
 * >> REQUISITOS <<
 * Suportar: SELECT, FROM, WHERE, JOIN, ON
 * Suportar: =,	>, <, <=, >=, <>, AND, (	)
 * Verificação	de	existência	de	tabelas	e atributos
 * suportar	múltiplos JOINs (0,	1, …, N)
 * Deve	ignorar	a diferença	entre palavras maiúsculas e minúsculas
 */

export default function validarConsulta(
  query: string,
  schema: Schema,
): { valida: boolean; erro?: string } {
  try {
    parseSqlQuery(query, schema);
    return { valida: true };
  } catch (error) {
    return {
      valida: false,
      erro: error instanceof Error ? error.message : "Consulta inválida.",
    };
  }
}
