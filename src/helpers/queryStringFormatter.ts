export default function formatSQLQuery(query: string): string {
    return query
        .replace(/\s+/g, " ")
        .trim()
        .replace(
            /(SELECT|FROM|LEFT JOIN|RIGHT JOIN|INNER JOIN|JOIN|WHERE)/gi,
            "\n$1",
        )
        .trim();
}
