import {
  columnToString,
  getQueryRelations,
  predicateToString,
  relationToString,
  type ColumnRef,
  type ParsedQuery,
  type Predicate,
  type RelationRef,
} from "./sqlParser";

export type AlgebraNode =
  | { type: "table"; relation: RelationRef }
  | { type: "selection"; predicates: Predicate[]; child: AlgebraNode }
  | { type: "projection"; columns: ColumnRef[] | "*"; child: AlgebraNode }
  | { type: "join"; predicate: Predicate; left: AlgebraNode; right: AlgebraNode };

export function queryToAlgebra(parsed: ParsedQuery): AlgebraNode {
  let current: AlgebraNode = { type: "table", relation: parsed.from };

  for (const join of parsed.joins) {
    current = {
      type: "join",
      predicate: join.predicate,
      left: current,
      right: { type: "table", relation: join.relation },
    };
  }

  if (parsed.where.length > 0) {
    current = {
      type: "selection",
      predicates: parsed.where,
      child: current,
    };
  }

  return {
    type: "projection",
    columns: parsed.select,
    child: current,
  };
}

export function algebraToString(node: AlgebraNode): string {
  switch (node.type) {
    case "table":
      return relationToString(node.relation);
    case "selection":
      return `σ(${node.predicates.map(predicateToString).join(" AND ")})(${algebraToString(node.child)})`;
    case "projection":
      return `π(${formatColumns(node.columns)})(${algebraToString(node.child)})`;
    case "join":
      return `(${algebraToString(node.left)} ⋈(${predicateToString(node.predicate)}) ${algebraToString(node.right)})`;
  }
}

export function collectRelationsFromTree(node: AlgebraNode): Set<string> {
  switch (node.type) {
    case "table":
      return new Set([node.relation.id]);
    case "selection":
    case "projection":
      return collectRelationsFromTree(node.child);
    case "join": {
      const left = collectRelationsFromTree(node.left);
      const right = collectRelationsFromTree(node.right);
      return new Set([...left, ...right]);
    }
  }
}

export function getFinalProjectionColumns(parsed: ParsedQuery): ColumnRef[] | "*" {
  return parsed.select;
}

export function getParsedRelationMap(parsed: ParsedQuery): Map<string, RelationRef> {
  return new Map(getQueryRelations(parsed).map((relation) => [relation.id, relation]));
}

function formatColumns(columns: ColumnRef[] | "*"): string {
  return columns === "*" ? "*" : columns.map(columnToString).join(", ");
}
