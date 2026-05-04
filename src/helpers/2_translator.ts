import type { ParsedQuery } from "./types";

export function translate(query: ParsedQuery): string {
    if (!query.isValid) return "Consulta inválida para conversão.";

    let relation = query.from;

    query.joins.forEach((join) => {
        relation = `(${relation} ⋈_{${join.on}} ${join.table})`;
    });

    if (query.wheres && query.wheres.length > 0) {
        const conds = query.wheres
            .map((w) => `${w.left} ${w.operator} ${w.right}`)
            .join(" ∧ ");
        relation = `σ_{${conds}}(${relation})`;
    }

    const attrs = query.select.join(", ");

    return `π_{${attrs}}(${relation})`;
}
