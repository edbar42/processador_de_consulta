import type { ParsedQuery, WhereCondition } from "./types";

export default function optimize(query: ParsedQuery): ParsedQuery {
    if (!query.isValid) return query;

    // Mapeamento de colunas por tabela (Heurística 2)
    const columnsByTable = new Map<string, Set<string>>();

    query.select.forEach((col) => {
        const [table, field] = col.includes(".")
            ? col.split(".")
            : [query.from, col];
        if (!columnsByTable.has(table)) columnsByTable.set(table, new Set());
        columnsByTable.get(table)?.add(field);
    });

    query.joins.forEach((join) => {
        const parts = join.on.split(/\s*=\s*/);
        parts.forEach((p) => {
            if (p.includes(".")) {
                const [t, f] = p.split(".");
                if (!columnsByTable.has(t)) columnsByTable.set(t, new Set());
                columnsByTable.get(t)?.add(f);
            }
        });
    });

    // Mapeamento de Seleções (Heurísticas 1 e 3)
    const filtersByTable = new Map<string, string[]>();
    const remainingWheres: WhereCondition[] = [];

    query.wheres?.forEach((w) => {
        const leftTable = w.left.includes(".")
            ? w.left.split(".")[0]
            : query.from;
        const isLiteral = !isNaN(Number(w.right)) || w.right.startsWith("'");

        if (isLiteral) {
            const current = filtersByTable.get(leftTable) || [];
            // Remove o prefixo da tabela no filtro interno para ficar igual ao dele

            current.push(`${w.left} ${w.operator} ${w.right}`);
            filtersByTable.set(leftTable, current);
        } else {
            remainingWheres.push(w);
        }
    });

    // Função auxiliar ajustada para o formato do professor
    const buildOptimizedSource = (tableName: string): string => {
        let expression = tableName;

        // Passo A: Seleção (σ) - Agora sem subscrito
        const filters = filtersByTable.get(tableName);
        if (filters && filters.length > 0) {
            expression = `σ ${filters.join(" ^ ")}(${expression})`;
        }

        // Passo B: Projeção (π) - Agora sem subscrito e envolvendo a seleção
        const cols = columnsByTable.get(tableName);
        if (cols && cols.size > 0) {
            expression = `π ${Array.from(cols).join(", ")}(${expression})`;
        }

        return expression;
    };

    // Reconstrução
    return {
        ...query,
        from: buildOptimizedSource(query.from),
        joins: query.joins.map((j) => ({
            table: buildOptimizedSource(j.table),
            on: j.on,
        })),
        wheres: remainingWheres.length > 0 ? remainingWheres : null,
        error: "Otimização seguindo a notação do professor aplicada.",
    };
}
