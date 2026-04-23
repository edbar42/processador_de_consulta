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
const OPERATOR_REGEX = /^(.+?)\s*(<=|>=|<>|=|>|<)\s*(.+)$/;

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

  const fromMatch = normalized.match(/\bFROM\b/i);
  if (!fromMatch || fromMatch.index === undefined) {
    throw new Error("Cláusula FROM obrigatória.");
  }

  const selectPart = normalized.slice("select".length, fromMatch.index).trim();
  const afterFrom = normalized.slice(fromMatch.index + "from".length).trim();
  if (!selectPart || !afterFrom) {
    throw new Error("Consulta SQL incompleta.");
  }

  const whereMatch = afterFrom.match(/\bWHERE\b/i);
  const sourcePart = whereMatch?.index !== undefined
    ? afterFrom.slice(0, whereMatch.index).trim()
    : afterFrom;
  const wherePart = whereMatch?.index !== undefined
    ? afterFrom.slice(whereMatch.index + "where".length).trim()
    : "";

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
  const segments = sourcePart.split(/\bJOIN\b/i);
  const fromSpec = segments[0].trim();

  const usedIds = new Set<string>();
  const from = parseRelationSpec(fromSpec, schema, usedIds);
  const joins: { relation: RelationRef; predicate: Predicate }[] = [];
  const scopedRelations: RelationRef[] = [from];

  for (let i = 1; i < segments.length; i += 1) {
    const segment = segments[i].trim();
    const onMatch = segment.match(/\bON\b/i);
    if (!onMatch || onMatch.index === undefined) {
      throw new Error("JOIN sem cláusula ON.");
    }

    const relationSpec = segment.slice(0, onMatch.index).trim();
    const relation = parseRelationSpec(relationSpec, schema, usedIds);
    const predicateSource = segment.slice(onMatch.index + "on".length).trim();

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
  const simplified = stripOuterParens(predicateGroup.trim());
  const fragments = simplified.split(/\bAND\b/i);

  if (fragments.length === 0) {
    throw new Error("Condição WHERE vazia.");
  }

  return fragments.map((fragment) =>
    parsePredicate(stripOuterParens(fragment.trim()), relations, schema),
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

  const match = fragment.match(OPERATOR_REGEX);
  if (!match) {
    throw new Error(`Predicado inválido: ${fragment}`);
  }

  const leftSource = match[1].trim();
  const operator = match[2] as PredicateOperator;
  const rightSource = match[3].trim();

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

function stripOuterParens(text: string): string {
  let current = text;
  while (/^\(.*\)$/.test(current)) {
    const inner = current.slice(1, -1).trim();
    // Verify parens are balanced in inner — if not, outer parens aren't wrapping
    if (!parensBalanced(inner)) break;
    current = inner;
  }
  return current;
}

function parensBalanced(text: string): boolean {
  let depth = 0;
  for (const ch of text) {
    if (ch === "(") depth += 1;
    else if (ch === ")") depth -= 1;
    if (depth < 0) return false;
  }
  return depth === 0;
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

function formatLiteral(value: string | number | undefined): string {
  if (typeof value === "number") {
    return String(value);
  }

  if (typeof value === "string") {
    return `'${value}'`;
  }

  return "";
}
