export default function printGraph(node: any, indent: string = "") {
    if (!node) return;

    // Formata o label de acordo com o tipo de nó
    let label = "";
    if (node.type === "PROJECTION")
        label = `π (${node.params.columns.join(", ")})`;
    else if (node.type === "SELECTION") label = `σ (${node.params.condition})`;
    else if (node.type === "JOIN") label = `⋈ (${node.params.on})`;
    else if (node.type === "TABLE") label = `TABLE: ${node.params.name}`;

    console.log(`${indent}${label}`);

    // Percorre os filhos
    if (node.child) {
        // Para Projeção e Seleção (Unários)
        printGraph(node.child, indent + "  │ ");
    } else if (node.left || node.right) {
        // Para Joins (Binários)
        console.log(`${indent}  ├── ESQUERDA:`);
        printGraph(node.left, indent + "  │   ");
        console.log(`${indent}  └── DIREITA:`);
        printGraph(node.right, indent + "  │   ");
    }
}
