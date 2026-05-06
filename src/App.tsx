import { useState, useMemo } from "react";
import "./App.css";
import { parseSqlQuery } from "./1_parser";
import { buildCanonicalGraph } from "./2_grafo_base";
import { stringifyGraph } from "./2_translator";
import { OperatorGraph, type ExecutionStep } from "./3_OperatorGraph";
import { ExecutionPlanList } from "./5_ExecutionPlan";
import type { ParsedQuery } from "./helpers/types";
import optimize from "./4_optmizer";
import { TestQueries } from "./helpers/testQueries";
import formatSQLQuery from "./helpers/queryStringFormatter";

export default function App() {
    const [input, setInput] = useState(TestQueries[0]?.query ?? "");
    const [submitted, setSubmitted] = useState(input);
    const [showOptimizedGraph, setShowOptimizedGraph] = useState(false);
    const [plan, setPlan] = useState<ExecutionStep[]>([]);

    // 1. Valida e faz parser: SQL -> ParsedQuery
    const parsed = parseSqlQuery(submitted) as ParsedQuery;

    // 2. Construção do Grafo Canônico
    const canonicalGraph = buildCanonicalGraph(parsed) || null;

    // 3. Aplicação das Heurísticas
    const optimizedGraph = optimize(canonicalGraph);

    // 4. Tradução para Texto (Álgebra)
    const algebraOriginal = stringifyGraph(canonicalGraph);
    const algebraOptimized = stringifyGraph(optimizedGraph);

    // Determina qual nó o gráfico deve renderizar
    const activeGraphNode = showOptimizedGraph
        ? optimizedGraph
        : canonicalGraph;

    return (
        <div className="root">
            <header className="header">
                <div className="header-inner">
                    <div className="badge">SQL</div>
                    <div>
                        <h1 className="title">Processador de Consultas</h1>
                        <p className="subtitle">
                            Álgebra Relacional · Heurísticas · Grafos
                        </p>
                    </div>
                </div>
            </header>

            <main className="main-content">
                <Section label="01" title="Consulta SQL">
                    <div className="input-group">
                        <select
                            className="select-input"
                            onChange={(e) => {
                                setInput(e.target.value);
                                setSubmitted(e.target.value);
                                setShowOptimizedGraph(false);
                            }}
                            value={input}
                        >
                            {TestQueries.map((q, i) => (
                                <option key={i} value={q.query}>
                                    {q.label}
                                </option>
                            ))}
                        </select>
                    </div>
                    <textarea
                        className="text-area"
                        value={formatSQLQuery(input)}
                        onChange={(e) => setInput(e.target.value)}
                        rows={7}
                        style={{ marginTop: "10px" }}
                    />
                    <button
                        className="btn-primary"
                        onClick={() => setSubmitted(input)}
                    >
                        Processar e Otimizar
                    </button>
                    {!parsed.isValid && (
                        <div className="error-box">
                            <strong>Erro:</strong> {parsed.error}
                        </div>
                    )}
                </Section>

                {parsed.isValid && (
                    <>
                        <Section label="02" title="Álgebra Relacional">
                            <div className="algebra-container">
                                <code className="algebra-code">
                                    {algebraOriginal}
                                </code>
                            </div>
                        </Section>

                        <Section label="03" title="Álgebra Otimizada">
                            <div className="algebra-container">
                                <code className="algebra-code">
                                    {algebraOptimized}
                                </code>
                            </div>
                        </Section>

                        <Section label="04" title="Grafo de Operadores">
                            <div
                                className="switch-row"
                                style={{ marginBottom: "20px" }}
                            >
                                <span
                                    className={`switch-label ${!showOptimizedGraph ? "active-original" : ""}`}
                                    onClick={() => setShowOptimizedGraph(false)}
                                >
                                    Original
                                </span>
                                <button
                                    className="switch-track"
                                    style={{
                                        background: showOptimizedGraph
                                            ? "#10b981"
                                            : "#94a3b8",
                                    }}
                                    onClick={() =>
                                        setShowOptimizedGraph(
                                            !showOptimizedGraph,
                                        )
                                    }
                                >
                                    <span
                                        className="switch-thumb"
                                        style={{
                                            transform: showOptimizedGraph
                                                ? "translateX(22px)"
                                                : "translateX(0px)",
                                        }}
                                    />
                                </button>
                                <span
                                    className={`switch-label ${showOptimizedGraph ? "active-optimized" : ""}`}
                                    onClick={() => setShowOptimizedGraph(true)}
                                >
                                    Otimizado
                                </span>
                            </div>

                            <OperatorGraph
                                rootNode={activeGraphNode}
                                onPlanGenerated={(p) => setPlan(p)}
                            />
                            <ExecutionPlanList steps={plan} />
                        </Section>
                    </>
                )}
            </main>
        </div>
    );
}

function Section({
    label,
    title,
    children,
}: {
    label: string;
    title: string;
    children: React.ReactNode;
}) {
    return (
        <section className="section-card">
            <div className="section-header">
                <span className="section-num">{label}</span>
                <h2 className="section-title">{title}</h2>
            </div>
            <div className="section-content">{children}</div>
        </section>
    );
}
