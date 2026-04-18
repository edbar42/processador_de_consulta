import { columnToString, predicateToString, relationToString } from "./sqlParser";
import type { AlgebraNode } from "./sqlToAlgebra";

export interface ExecutionStep {
  order: number;
  operation: string;
  description: string;
  resultName: string;
  dependsOn: string[];
}

export function buildExecutionPlan(node: AlgebraNode): ExecutionStep[] {
  const steps: ExecutionStep[] = [];
  let resultCounter = 1;

  walk(node);
  return steps;

  function walk(current: AlgebraNode): string {
    switch (current.type) {
      case "table": {
        const resultName = nextResult();
        steps.push({
          order: steps.length + 1,
          operation: "Table Scan",
          description: `Ler a tabela ${relationToString(current.relation)}.`,
          resultName,
          dependsOn: [],
        });
        return resultName;
      }
      case "selection": {
        const childResult = walk(current.child);
        const resultName = nextResult();
        steps.push({
          order: steps.length + 1,
          operation: "Selection",
          description: `Aplicar seleção ${current.predicates
            .map(predicateToString)
            .join(" AND ")} sobre ${childResult}.`,
          resultName,
          dependsOn: [childResult],
        });
        return resultName;
      }
      case "projection": {
        const childResult = walk(current.child);
        const resultName = nextResult();
        const columns =
          current.columns === "*"
            ? "*"
            : current.columns.map(columnToString).join(", ");
        steps.push({
          order: steps.length + 1,
          operation: "Projection",
          description: `Projetar ${columns} a partir de ${childResult}.`,
          resultName,
          dependsOn: [childResult],
        });
        return resultName;
      }
      case "join": {
        const leftResult = walk(current.left);
        const rightResult = walk(current.right);
        const resultName = nextResult();
        steps.push({
          order: steps.length + 1,
          operation: "Join",
          description: `Juntar ${leftResult} com ${rightResult} usando ${predicateToString(
            current.predicate,
          )}.`,
          resultName,
          dependsOn: [leftResult, rightResult],
        });
        return resultName;
      }
    }
  }

  function nextResult(): string {
    return `R${resultCounter++}`;
  }
}
