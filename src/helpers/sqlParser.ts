import type { Schema } from "./schemas";

export type PredicateOperator = "=" | ">" | "<" | "<=" | ">=" | "<>";

export interface RelationRef {
  id: string;
  tableName: string;
  alias?: string;
}

export interface ColumnRef {
  relationId: string;
  columnName: string;
  raw: string;
}

export interface Predicate {
  raw: string;
  operator: PredicateOperator;
  left: ColumnRef;
  rightColumn?: ColumnRef;
  rightLiteral?: string | number;
  relationIds: string[];
}

export interface ParsedQuery {
  select: ColumnRef[] | "*";
  from: RelationRef;
  joins: { relation: RelationRef; predicate: Predicate }[];
  where: Predicate[];
}

const KEYWORDS = new Set(["select", "from", "join", "on", "where", "and"]);
const OPERATORS: PredicateOperator[] = ["<=", ">=", "<>", "=", ">", "<"];

export function parseSqlQuery(query: string, schema: Schema): ParsedQuery {
  const normalized = normalizeSql(query);

  if (!normalized) {
    throw new Error("Digite uma consulta SQL.");
  }

  if (containsUnsupportedSql(normalized)) {
    throw new Error("Sintaxe SQL básica inválida ou comandos não suportados.");
  }

  if (!normalized.toLowerCase().startsWith("select ")) {
    throw new Error("A consulta deve iniciar com SELECT.");
  }

  const fromIndex = findKeywordOutsideGroups(normalized, "from");
  if (fromIndex === -1) {
    throw new Error("Cláusula FROM obrigatória.");
  }

  const selectPart = normalized.slice("select".length, fromIndex).trim();
  const afterFrom = normalized.slice(fromIndex + "from".length).trim();
  if (!selectPart || !afterFrom) {
    throw new Error("Consulta SQL incompleta.");
  }

  const whereIndex = findKeywordOutsideGroups(afterFrom, "where");
  const sourcePart =
    whereIndex === -1 ? afterFrom : afterFrom.slice(0, whereIndex).trim();
  const wherePart =
    whereIndex === -1 ? "" : afterFrom.slice(whereIndex + "where".length).trim();

  const { from, joins } = parseRelations(sourcePart, schema);
  const relations = getQueryRelations({ from, joins, select: "*", where: [] });
  const select = parseSelectColumns(selectPart, relations, schema);
  const where = wherePart ? parsePredicateGroup(wherePart, relations, schema) : [];

  return { select, from, joins, where };
}

export function getQueryRelations(parsed: ParsedQuery): RelationRef[] {
  return [parsed.from, ...parsed.joins.map((join) => join.relation)];
}

export function relationToString(relation: RelationRef): string {
  return relation.alias
    ? `${relation.tableName} (${relation.alias})`
    : relation.tableName;
}

export function columnToString(column: ColumnRef): string {
  return `${column.relationId}.${column.columnName}`;
}

export function predicateToString(predicate: Predicate): string {
  const right =
    predicate.rightColumn !== undefined
      ? columnToString(predicate.rightColumn)
      : formatLiteral(predicate.rightLiteral);

  return `${columnToString(predicate.left)} ${predicate.operator} ${right}`;
}

function normalizeSql(query: string): string {
  return query.replace(/;\s*$/, "").replace(/\s+/g, " ").trim();
}

function containsUnsupportedSql(query: string): boolean {
  return (
    /\b(or|group|order|having|limit|insert|update|delete|left|right|inner|outer|cross)\b/i.test(
      query,
    ) || query.includes("!=")
  );
}

function parseRelations(
  sourcePart: string,
  schema: Schema,
): { from: RelationRef; joins: { relation: RelationRef; predicate: Predicate }[] } {
  const firstJoinIndex = findKeywordOutsideGroups(sourcePart, "join");
  const fromSpec =
    firstJoinIndex === -1
      ? sourcePart.trim()
      : sourcePart.slice(0, firstJoinIndex).trim();
  let remainder =
    firstJoinIndex === -1 ? "" : sourcePart.slice(firstJoinIndex).trim();

  const usedIds = new Set<string>();
  const from = parseRelationSpec(fromSpec, schema, usedIds);
  const joins: { relation: RelationRef; predicate: Predicate }[] = [];
  const scopedRelations: RelationRef[] = [from];

  while (remainder) {
    if (!startsWithKeyword(remainder, "join")) {
      throw new Error("Sintaxe inválida após a cláusula FROM.");
    }

    const afterJoin = remainder.slice("join".length).trim();
    const onIndex = findKeywordOutsideGroups(afterJoin, "on");
    if (onIndex === -1) {
      throw new Error("JOIN sem cláusula ON.");
    }

    const relationSpec = afterJoin.slice(0, onIndex).trim();
    const relation = parseRelationSpec(relationSpec, schema, usedIds);
    const afterOn = afterJoin.slice(onIndex + "on".length).trim();
    const nextJoinIndex = findKeywordOutsideGroups(afterOn, "join");
    const predicateSource =
      nextJoinIndex === -1 ? afterOn : afterOn.slice(0, nextJoinIndex).trim();

    if (!predicateSource) {
      throw new Error("Condição de JOIN vazia.");
    }

    const predicate = parsePredicate(predicateSource, [...scopedRelations, relation], schema);
    const hasNewRelation = predicate.relationIds.includes(relation.id);
    const hasExistingRelation = predicate.relationIds.some((relationId) =>
      scopedRelations.some((scopedRelation) => scopedRelation.id === relationId),
    );

    if (!hasNewRelation || !hasExistingRelation) {
      throw new Error(
        `A junção com ${relation.tableName} deve ligar a nova tabela a uma relação já em uso.`,
      );
    }

    joins.push({ relation, predicate });
    scopedRelations.push(relation);
    remainder = nextJoinIndex === -1 ? "" : afterOn.slice(nextJoinIndex).trim();
  }

  return { from, joins };
}

function parseRelationSpec(
  fragment: string,
  schema: Schema,
  usedIds: Set<string>,
): RelationRef {
  const parts = fragment.split(" ").filter(Boolean);
  if (parts.length === 0 || parts.length > 2) {
    throw new Error(`Relação inválida: ${fragment}`);
  }

  const tableName = parts[0].toLowerCase();
  const alias = parts[1]?.toLowerCase();

  if (!schema[tableName]) {
    throw new Error(`Tabela não encontrada: ${tableName}`);
  }

  if (alias && KEYWORDS.has(alias)) {
    throw new Error(`Alias inválido: ${alias}`);
  }

  const id = alias ?? tableName;
  if (usedIds.has(id)) {
    throw new Error(`Relação duplicada sem alias distinto: ${id}`);
  }

  usedIds.add(id);
  return { id, tableName, alias };
}

function parseSelectColumns(
  selectPart: string,
  relations: RelationRef[],
  schema: Schema,
): ColumnRef[] | "*" {
  if (selectPart === "*") {
    return "*";
  }

  const fragments = selectPart.split(",").map((item) => item.trim());
  if (fragments.some((fragment) => !fragment)) {
    throw new Error("Lista de projeção inválida.");
  }

  return fragments.map((fragment) => resolveColumnReference(fragment, relations, schema));
}

function parsePredicateGroup(
  predicateGroup: string,
  relations: RelationRef[],
  schema: Schema,
): Predicate[] {
  const simplified = stripWrappingParentheses(predicateGroup.trim());
  const fragments = splitTopLevelAnd(simplified);

  if (fragments.length === 0) {
    throw new Error("Condição WHERE vazia.");
  }

  return fragments.map((fragment) =>
    parsePredicate(stripWrappingParentheses(fragment.trim()), relations, schema),
  );
}

function parsePredicate(
  fragment: string,
  relations: RelationRef[],
  schema: Schema,
): Predicate {
  if (!fragment) {
    throw new Error("Predicado vazio.");
  }

  if (/\bor\b/i.test(fragment)) {
    throw new Error("O operador OR não é suportado.");
  }

  const operatorMatch = findPredicateOperator(fragment);
  if (!operatorMatch) {
    throw new Error(`Predicado inválido: ${fragment}`);
  }

  const { operator, index } = operatorMatch;
  const leftSource = fragment.slice(0, index).trim();
  const rightSource = fragment.slice(index + operator.length).trim();

  if (!leftSource || !rightSource) {
    throw new Error(`Predicado inválido: ${fragment}`);
  }

  const left = resolveColumnReference(leftSource, relations, schema);
  const rightColumn = isColumnToken(rightSource)
    ? resolveColumnReference(rightSource, relations, schema)
    : undefined;

  const predicate: Predicate = {
    raw: fragment.toLowerCase(),
    operator,
    left,
    relationIds: [],
  };

  if (rightColumn) {
    predicate.rightColumn = rightColumn;
  } else {
    predicate.rightLiteral = parseLiteral(rightSource);
  }

  predicate.relationIds = Array.from(
    new Set([
      left.relationId,
      ...(predicate.rightColumn ? [predicate.rightColumn.relationId] : []),
    ]),
  );

  return predicate;
}

function resolveColumnReference(
  rawColumn: string,
  relations: RelationRef[],
  schema: Schema,
): ColumnRef {
  const normalized = rawColumn.toLowerCase();
  const qualifiedMatch = normalized.match(
    /^([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)$/,
  );

  if (qualifiedMatch) {
    const qualifier = qualifiedMatch[1];
    const columnName = qualifiedMatch[2];
    const relation = resolveQualifiedRelation(qualifier, relations);

    if (!schema[relation.tableName].includes(columnName)) {
      throw new Error(`Atributo ou referência inválida: ${normalized}`);
    }

    return {
      relationId: relation.id,
      columnName,
      raw: normalized,
    };
  }

  if (!/^[a-z_][a-z0-9_]*$/.test(normalized)) {
    throw new Error(`Atributo inválido: ${rawColumn}`);
  }

  const candidateRelations = relations.filter((relation) =>
    schema[relation.tableName].includes(normalized),
  );

  if (candidateRelations.length === 0) {
    throw new Error(`Atributo não reconhecido: ${normalized}`);
  }

  if (candidateRelations.length > 1) {
    throw new Error(`Atributo ambíguo: ${normalized}`);
  }

  return {
    relationId: candidateRelations[0].id,
    columnName: normalized,
    raw: normalized,
  };
}

function resolveQualifiedRelation(
  qualifier: string,
  relations: RelationRef[],
): RelationRef {
  const normalizedQualifier = qualifier.toLowerCase();
  const candidates = relations.filter(
    (relation) =>
      relation.id === normalizedQualifier ||
      relation.tableName === normalizedQualifier ||
      relation.alias === normalizedQualifier,
  );

  if (candidates.length === 0) {
    throw new Error(`Relação não encontrada: ${normalizedQualifier}`);
  }

  if (candidates.length > 1) {
    throw new Error(`Relação ambígua: ${normalizedQualifier}`);
  }

  return candidates[0];
}

function splitTopLevelAnd(expression: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let inQuote = false;
  let current = "";
  let index = 0;

  while (index < expression.length) {
    const character = expression[index];

    if (character === "'") {
      inQuote = !inQuote;
      current += character;
      index += 1;
      continue;
    }

    if (!inQuote) {
      if (character === "(") {
        depth += 1;
      } else if (character === ")") {
        depth -= 1;
        if (depth < 0) {
          throw new Error("Erro de sintaxe: parênteses desbalanceados.");
        }
      }

      if (
        depth === 0 &&
        expression.slice(index, index + 3).toLowerCase() === "and" &&
        isKeywordBoundary(expression[index - 1]) &&
        isKeywordBoundary(expression[index + 3])
      ) {
        parts.push(current.trim());
        current = "";
        index += 3;
        continue;
      }
    }

    current += character;
    index += 1;
  }

  if (depth !== 0 || inQuote) {
    throw new Error("Erro de sintaxe: parênteses ou aspas desbalanceados.");
  }

  if (current.trim()) {
    parts.push(current.trim());
  }

  return parts;
}

function stripWrappingParentheses(fragment: string): string {
  let current = fragment.trim();

  while (current.startsWith("(") && current.endsWith(")")) {
    const inner = current.slice(1, -1).trim();
    if (findClosingParenthesis(current, 0) !== current.length - 1) {
      break;
    }
    current = inner;
  }

  return current;
}

function findPredicateOperator(
  fragment: string,
): { operator: PredicateOperator; index: number } | null {
  let depth = 0;
  let inQuote = false;

  for (let index = 0; index < fragment.length; index += 1) {
    const character = fragment[index];

    if (character === "'") {
      inQuote = !inQuote;
      continue;
    }

    if (inQuote) {
      continue;
    }

    if (character === "(") {
      depth += 1;
      continue;
    }

    if (character === ")") {
      depth -= 1;
      continue;
    }

    if (depth !== 0) {
      continue;
    }

    for (const operator of OPERATORS) {
      if (fragment.slice(index, index + operator.length) === operator) {
        return { operator, index };
      }
    }
  }

  return null;
}

function findKeywordOutsideGroups(source: string, keyword: string): number {
  let depth = 0;
  let inQuote = false;
  const lowerSource = source.toLowerCase();
  const lowerKeyword = keyword.toLowerCase();

  for (let index = 0; index <= source.length - keyword.length; index += 1) {
    const character = source[index];

    if (character === "'") {
      inQuote = !inQuote;
    }

    if (!inQuote) {
      if (character === "(") {
        depth += 1;
      } else if (character === ")") {
        depth -= 1;
      }
    }

    if (inQuote || depth !== 0) {
      continue;
    }

    if (
      lowerSource.slice(index, index + keyword.length) === lowerKeyword &&
      isKeywordBoundary(source[index - 1]) &&
      isKeywordBoundary(source[index + keyword.length])
    ) {
      return index;
    }
  }

  return -1;
}

function startsWithKeyword(source: string, keyword: string): boolean {
  return source.slice(0, keyword.length).toLowerCase() === keyword.toLowerCase();
}

function findClosingParenthesis(source: string, startIndex: number): number {
  let depth = 0;

  for (let index = startIndex; index < source.length; index += 1) {
    if (source[index] === "(") {
      depth += 1;
    } else if (source[index] === ")") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
}

function isColumnToken(value: string): boolean {
  return /^[a-z_][a-z0-9_]*(?:\.[a-z_][a-z0-9_]*)?$/i.test(value);
}

function parseLiteral(value: string): string | number {
  if (/^'.*'$/.test(value)) {
    return value.slice(1, -1);
  }

  if (/^-?\d+(?:\.\d+)?$/.test(value)) {
    return Number(value);
  }

  throw new Error(`Literal inválido: ${value}`);
}

function isKeywordBoundary(value: string | undefined): boolean {
  return value === undefined || /\s|\(|\)|,/.test(value);
}

function formatLiteral(value: string | number | undefined): string {
  if (typeof value === "number") {
    return String(value);
  }

  if (typeof value === "string") {
    return `'${value}'`;
  }

  return "";
}
