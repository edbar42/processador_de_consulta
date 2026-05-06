import type { ParsedQuery, QueryNode } from "./helpers/types";

export function buildCanonicalGraph(query: ParsedQuery): QueryNode {
  // 1. Base: Tabela inicial (Folha)
  let root: QueryNode = {
    type: "TABLE",
    params: { name: query.from },
  };

  // 2. Joins (Nós binários)
  query.joins.forEach((join) => {
    root = {
      type: "JOIN",
      params: { on: join.on },
      left: root,
      right: { type: "TABLE", params: { name: join.table } },
    };
  });

  // 3. Seleção (Nó unário)
  if (query.wheres && query.wheres.length > 0) {
    const condition = query.wheres
      .map((w) => `${w.left} ${w.operator} ${w.right}`)
      .join(" ∧ ");

    root = {
      type: "SELECTION",
      params: { condition },
      child: root,
    };
  }

  // 4. Projeção (Raiz)
  root = {
    type: "PROJECTION",
    params: { columns: query.select },
    child: root,
  };

  return root;
}
