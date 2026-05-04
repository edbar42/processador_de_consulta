import { useState } from "react";
import "./App.css";
import OperatorGraph from "./components/3_OperatorGraph";
import { parseSqlQuery } from "./helpers/1_parser";
import { translate } from "./helpers/2_translator";
import optimize from "./helpers/4_optmizer";
import { TestQueries } from "./helpers/testQueries";
import type { ParsedQuery } from "./helpers/types";

export default function App() {
    const [input, setInput] = useState(TestQueries[0]?.query ?? "");
    const [submitted, setSubmitted] = useState(input);
    const [showOptimizedGraph, setShowOptimizedGraph] = useState(false);

    // Lógica de Processamento
    const parsed = parseSqlQuery(submitted) as ParsedQuery;
    const algebraOriginal = parsed.isValid ? translate(parsed) : null;

    const optimized = parsed.isValid ? (optimize(parsed) as ParsedQuery) : null;
    const algebraOptimized = optimized ? translate(optimized) : null;

    // Definição do que exibir no Grafo (Seção 04)
    const activeGraphQuery =
        showOptimizedGraph && optimized ? optimized : parsed;

    return (
        <div className="root">
            <header className="header">
                <div className="header-inner">
                    <div className="badge">SQL</div>
                    <div>
                        <h1 className="title">Processador de Consultas</h1>
                        <p className="subtitle">
                            Álgebra relacional · Grafo de operadores ·
                            Otimização
                        </p>
                    </div>
                </div>
            </header>

            <main className="main-content">
                {/* Bloco 01 — Entrada SQL */}
                <div
                    style={{
                        position: "fixed",
                        top: "100px",
                        right: "60px",
                        zIndex: 10,
                    }}
                ></div>
                <Section label="01" title="Consulta SQL">
                    <div>
                        <div className="input-group">
                            <label className="input-label">
                                Exemplos Prontos
                            </label>
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

                        <div
                            className="input-group"
                            style={{ marginTop: "10px" }}
                        >
                            <label>Editor SQL</label>
                            <textarea
                                className="text-area"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                rows={4}
                                spellCheck={false}
                            />
                        </div>

                        <button
                            className="btn-primary"
                            onClick={() => {
                                setSubmitted(input);
                                setShowOptimizedGraph(false);
                            }}
                        >
                            Processar Consulta
                        </button>

                        {!parsed.isValid && (
                            <div className="error-box">
                                <strong>Erro de Sintaxe:</strong> {parsed.error}
                            </div>
                        )}
                    </div>
                </Section>

                {parsed.isValid && (
                    <>
                        {/* Bloco 02 — Álgebra Original */}
                        <Section label="02" title="Álgebra Relacional">
                            <div className="algebra-container">
                                <code className="algebra-code">
                                    {algebraOriginal}
                                </code>
                            </div>
                        </Section>

                        {/* Bloco 03 — Álgebra Otimizada */}
                        <Section label="03" title="Álgebra Otimizada">
                            <div className="algebra-container">
                                <code className="algebra-code">
                                    {algebraOptimized}
                                </code>
                            </div>
                        </Section>

                        {/* Bloco 04 — Visualização do Grafo com Switch */}
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

                            <OperatorGraph query={activeGraphQuery} />
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
