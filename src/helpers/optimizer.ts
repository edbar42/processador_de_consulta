import type { Schema } from "./schemas";
import {
  columnToString,
  getQueryRelations,
  predicateToString,
  type ColumnRef,
  type ParsedQuery,
  type Predicate,
  type RelationRef,
} from "./sqlParser";
import { collectRelationsFromTree, type AlgebraNode } from "./sqlToAlgebra";

interface JoinCandidate {
  relation: RelationRef;
  predicate: Predicate;
  index: number;
}

export function optimizeAlgebra(
  algebra: AlgebraNode,
  parsed: ParsedQuery,
  schema: Schema,
): AlgebraNode {
  const relations = getQueryRelations(parsed);
  const relationMap = new Map(relations.map((relation) => [relation.id, relation]));
  const relationScores = buildRelationScores(parsed);
  const pendingJoins: JoinCandidate[] = parsed.joins.map((join, index) => ({
    relation: join.relation,
    predicate: join.predicate,
    index,
  }));
  const singleRelationSelections = groupSingleRelationSelections(parsed.where);
  const multiRelationSelections = parsed.where.filter(
    (predicate) => predicate.relationIds.length > 1,
  );
  const requiredColumns = buildRequiredColumns(parsed);
  const orderedRelationIds = relations.map((relation) => relation.id);

  const startRelation = chooseStartRelation(relations, relationScores, orderedRelationIds);
  const joinedRelationIds = new Set<string>([startRelation.id]);
  let current = buildRelationBranch(
    startRelation,
    singleRelationSelections.get(startRelation.id) ?? [],
    requiredColumns.get(startRelation.id) ?? new Set<string>(),
    schema,
    parsed.select,
  );

  while (pendingJoins.length > 0) {
    const candidate = chooseNextJoin(
      pendingJoins,
      joinedRelationIds,
      relationScores,
      relationMap,
      orderedRelationIds,
    );

    if (!candidate) {
      throw new Error("Não foi possível otimizar a consulta sem criar produto cartesiano.");
    }

    const newRelationId = candidate.predicate.relationIds.find(
      (relationId) => !joinedRelationIds.has(relationId),
    );

    if (!newRelationId) {
      throw new Error("Junção inválida durante a otimização.");
    }

    const newRelation = relationMap.get(newRelationId);
    if (!newRelation) {
      throw new Error(`Relação não encontrada durante a otimização: ${newRelationId}`);
    }

    const rightBranch = buildRelationBranch(
      newRelation,
      singleRelationSelections.get(newRelation.id) ?? [],
      requiredColumns.get(newRelation.id) ?? new Set<string>(),
      schema,
      parsed.select,
    );

    current = {
      type: "join",
      predicate: candidate.predicate,
      left: current,
      right: rightBranch,
    };

    joinedRelationIds.add(newRelation.id);
    pendingJoins.splice(
      pendingJoins.findIndex(
        (join) =>
          join.index === candidate.index && join.relation.id === candidate.relation.id,
      ),
      1,
    );
  }

  if (multiRelationSelections.length > 0) {
    current = {
      type: "selection",
      predicates: multiRelationSelections,
      child: current,
    };
  }

  const optimized: AlgebraNode = {
    type: "projection",
    columns: parsed.select,
    child: current,
  };

  const optimizedRelations = collectRelationsFromTree(optimized);
  if (optimizedRelations.size !== relations.length) {
    throw new Error("A otimização removeu relações necessárias da consulta.");
  }

  void algebra;
  return optimized;
}

function buildRelationScores(parsed: ParsedQuery): Map<string, number> {
  const scores = new Map<string, number>();

  for (const relation of getQueryRelations(parsed)) {
    scores.set(relation.id, 0);
  }

  for (const predicate of parsed.where) {
    if (predicate.relationIds.length !== 1) {
      continue;
    }

    const relationId = predicate.relationIds[0];
    scores.set(relationId, (scores.get(relationId) ?? 0) + scoreSelection(predicate));
  }

  return scores;
}

function buildRequiredColumns(parsed: ParsedQuery): Map<string, Set<string>> {
  const columns = new Map<string, Set<string>>();

  for (const relation of getQueryRelations(parsed)) {
    columns.set(relation.id, new Set<string>());
  }

  if (parsed.select !== "*") {
    for (const column of parsed.select) {
      columns.get(column.relationId)?.add(column.columnName);
    }
  }

  for (const predicate of parsed.where) {
    columns.get(predicate.left.relationId)?.add(predicate.left.columnName);
    if (predicate.rightColumn) {
      columns.get(predicate.rightColumn.relationId)?.add(predicate.rightColumn.columnName);
    }
  }

  for (const join of parsed.joins) {
    columns.get(join.predicate.left.relationId)?.add(join.predicate.left.columnName);
    if (join.predicate.rightColumn) {
      columns
        .get(join.predicate.rightColumn.relationId)
        ?.add(join.predicate.rightColumn.columnName);
    }
  }

  return columns;
}

function groupSingleRelationSelections(predicates: Predicate[]): Map<string, Predicate[]> {
  const grouped = new Map<string, Predicate[]>();

  for (const predicate of predicates) {
    if (predicate.relationIds.length !== 1) {
      continue;
    }

    const relationId = predicate.relationIds[0];
    const current = grouped.get(relationId) ?? [];
    current.push(predicate);
    grouped.set(relationId, current);
  }

  return grouped;
}

function chooseStartRelation(
  relations: RelationRef[],
  scores: Map<string, number>,
  orderedRelationIds: string[],
): RelationRef {
  return [...relations].sort((left, right) => {
    const scoreDifference = (scores.get(right.id) ?? 0) - (scores.get(left.id) ?? 0);
    if (scoreDifference !== 0) {
      return scoreDifference;
    }

    return orderedRelationIds.indexOf(left.id) - orderedRelationIds.indexOf(right.id);
  })[0];
}

function chooseNextJoin(
  pendingJoins: JoinCandidate[],
  joinedRelationIds: Set<string>,
  relationScores: Map<string, number>,
  relationMap: Map<string, RelationRef>,
  orderedRelationIds: string[],
): JoinCandidate | null {
  const candidates = pendingJoins
    .map((join) => {
      const joined = join.predicate.relationIds.filter((relationId) =>
        joinedRelationIds.has(relationId),
      );
      const missing = join.predicate.relationIds.filter(
        (relationId) => !joinedRelationIds.has(relationId),
      );

      if (joined.length === 0 || missing.length !== 1) {
        return null;
      }

      const newRelation = relationMap.get(missing[0]);
      if (!newRelation) {
        return null;
      }

      return {
        join,
        newRelation,
        score: scoreJoin(join.predicate) + (relationScores.get(newRelation.id) ?? 0),
      };
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return (
        orderedRelationIds.indexOf(left.newRelation.id) -
        orderedRelationIds.indexOf(right.newRelation.id)
      );
    });

  return candidates[0]?.join ?? null;
}

function buildRelationBranch(
  relation: RelationRef,
  selections: Predicate[],
  requiredColumns: Set<string>,
  schema: Schema,
  finalProjection: ColumnRef[] | "*",
): AlgebraNode {
  let branch: AlgebraNode = {
    type: "table",
    relation,
  };

  if (selections.length > 0) {
    branch = {
      type: "selection",
      predicates: selections,
      child: branch,
    };
  }

  if (finalProjection !== "*" && requiredColumns.size > 0) {
    const relationColumns = schema[relation.tableName];
    const projectionColumns = relationColumns
      .filter((column) => requiredColumns.has(column))
      .map<ColumnRef>((column) => ({
        relationId: relation.id,
        columnName: column,
        raw: `${relation.id}.${column}`,
      }));

    branch = {
      type: "projection",
      columns: projectionColumns,
      child: branch,
    };
  }

  return branch;
}

function scoreSelection(predicate: Predicate): number {
  if (predicate.operator === "=" && predicate.rightLiteral !== undefined) {
    return 30;
  }

  if (
    [">", "<", ">=", "<=", "<>"].includes(predicate.operator) &&
    predicate.rightLiteral !== undefined
  ) {
    return 20;
  }

  return 10;
}

function scoreJoin(predicate: Predicate): number {
  return predicate.operator === "=" ? 15 : 5;
}

export function summarizeOptimization(node: AlgebraNode): string[] {
  const summary: string[] = [];
  walk(node);
  return summary;

  function walk(current: AlgebraNode): void {
    switch (current.type) {
      case "table":
        return;
      case "selection":
        summary.push(
          `Seleção antecipada: ${current.predicates.map(predicateToString).join(" AND ")}`,
        );
        walk(current.child);
        return;
      case "projection":
        if (current.columns !== "*") {
          summary.push(
            `Projeção antecipada: ${current.columns.map(columnToString).join(", ")}`,
          );
        }
        walk(current.child);
        return;
      case "join":
        summary.push(`Junção otimizada: ${predicateToString(current.predicate)}`);
        walk(current.left);
        walk(current.right);
    }
  }
}
