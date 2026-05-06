import { schemaMetadata } from "./helpers/schemas";
import type { JoinInfo, ParsedQuery, WhereCondition } from "./helpers/types";

// PRINCIPAL  ===================================================================

export function parseSqlQuery(input: string) {
  const normalized = input.trim().toLowerCase().replace(/\s+/g, " ");
  const sqlRegex = /^select\s+(.+?)\s+from\s+(.+?)(?:\s+where\s+(.*))?$/i;
  const match = normalized.match(sqlRegex);

  if (!match) {
    return createError(
      "Sintaxe SQL inválida. Certifique-se de usar SELECT e FROM corretamente",
    );
  }

  const [, rawSelect, rawTables, rawWhere] = match;

  try {
    const select = rawSelect.split(",").map((c) => c.trim());
    const { mainTable, activeTables, joins } = parseTablesAndJoins(rawTables);
    const wheres = parseWhere(rawWhere);

    validateActiveTables(activeTables);
    validateSelect(select, activeTables);
    validateWheres(wheres, activeTables);

    return {
      select,
      from: mainTable,
      joins,
      wheres: wheres || null,
      isValid: true,
      error: undefined,
    };
  } catch (err: any) {
    return createError(err.message);
  }
}

// PARSERS  ===================================================================

function parseTablesAndJoins(rawTables: string) {
  const joinParts = rawTables.split(/ join /i);
  const mainTable = joinParts[0].trim();
  const joins: JoinInfo[] = [];

  for (let i = 1; i < joinParts.length; i++) {
    const [table, on] = joinParts[i].split(/ on /i);
    if (!table || !on) throw new Error("Sintaxe de JOIN ou ON inválida");
    joins.push({ table: table.trim(), on: on.trim() });
  }

  const activeTables = [mainTable, ...joins.map((j) => j.table)];

  return { mainTable, activeTables, joins };
}

export function parseWhere(rawWhere: string | undefined): WhereCondition[] {
  if (!rawWhere) return [];

  const flat = rawWhere.replace(/[()]/g, " ").trim();
  const parts = flat
    .split(/\band\b/i)
    .map((p) => p.trim())
    .filter(Boolean);

  const conditionRegex = /^(.+?)\s*(<=|>=|<>|<|>|=)\s*(.+)$/;

  return parts.map((part) => {
    const match = part.match(conditionRegex);

    if (!match) {
      throw new Error(
        `Sintaxe inválida ou operador não suportado no WHERE: '${part}'.`,
      );
    }

    return {
      left: match[1].trim(),
      operator: match[2].trim(),
      right: match[3].trim(),
    };
  });
}

// VALIDADORES ===================================================================

function isTableInSchema(table: string): boolean {
  return !!schemaMetadata[table];
}

function isTableInActiveTables(table: string, activeTables: string[]): boolean {
  return activeTables.includes(table);
}

function isAttributeInTable(table: string, attribute: string): boolean {
  const lowerTable = table;
  const lowerAttribute = attribute;
  const schemaTable = schemaMetadata[lowerTable];

  if (!schemaTable) return false;

  return schemaTable.includes(lowerAttribute);
}

function validateActiveTables(activeTables: string[]): void {
  activeTables.forEach((table) => {
    if (!isTableInSchema(table))
      throw new Error(`'${table}' inválida ou inexistente`);
  });
}

function validateSelect(select: string[], activeTables: string[]): void {
  select.forEach((att) => {
    if (att === "*") return;

    if (!validateAttributes(att, activeTables, true)) {
      throw new Error(`Atributo '${att}' invalido`);
    }
  });
}

function validateAttributes(
  att: string,
  activeTables: string[],
  acceptAsterisk: boolean,
): boolean {
  const attParts = att.split(".");

  if (attParts.length === 1) {
    const exists = activeTables.some((table) => isAttributeInTable(table, att));

    if (!exists) throw new Error(`'${att}' inválido`);

    return true;
  }

  if (attParts.length === 2) {
    const table = attParts[0];
    const attribute = attParts[1];

    if (!isTableInActiveTables(table, activeTables))
      throw new Error(`'${att}' inválido`);

    if (acceptAsterisk && attribute === "*") return true;

    if (!isAttributeInTable(table, attribute))
      throw new Error(`'${attribute}' inválido`);

    return true;
  }

  return false;
}

function validateWheres(
  wheres: WhereCondition[] | undefined,
  activeTables: string[],
): void {
  if (!wheres)
    throw new Error(`A cláusula WHERE ${wheres} inválida ou ausente`);

  const validOperators = ["=", ">", "<", "<=", ">=", "<>"];

  for (let where of wheres) {
    validateAttributes(where.left, activeTables, false);
    // TODO: Estou supondo que vai sempre ter um AND
    // TODO: Validar o lado direito

    if (!validOperators.includes(where.operator)) {
      throw new Error(
        "A cláusula WHERE contém caracteres ou operadores não permitidos. " +
          "Operadores válidos: =, >, <, <=, >=, <>, AND, ( ).",
      );
    }
  }
}

function createError(msg: string): ParsedQuery {
  return {
    select: [],
    from: "",
    joins: [],
    wheres: null,
    isValid: false,
    error: msg,
  };
}
