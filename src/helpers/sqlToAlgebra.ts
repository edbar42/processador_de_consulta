export type AlgebraNode =
  | { type: 'projection'; columns: string[]; child: AlgebraNode }
  | { type: 'selection'; condition: string; child: AlgebraNode }
  | { type: 'join'; joinType: string; condition: string; left: AlgebraNode; right: AlgebraNode }
  | { type: 'table'; name: string };

interface ParsedQuery {
  columns: string[];
  from: { table: string; alias?: string };
  joins: { table: string; alias?: string; condition: string }[];
  where?: string;
}

function parseQuery(query: string): ParsedQuery {
  const normalized = query.replace(/\s+/g, ' ').trim();

  // Extract SELECT columns
  const selectMatch = normalized.match(/^select\s+(.+?)\s+from\s+/i);
  if (!selectMatch) throw new Error('SELECT inválido');
  const columns = selectMatch[1].split(',').map(c => c.trim());

  // Extract FROM table (with optional alias)
  const fromMatch = normalized.match(/from\s+(\w+)(?:\s+(\w+))?/i);
  if (!fromMatch) throw new Error('FROM inválido');
  const from: ParsedQuery['from'] = { table: fromMatch[1] };
  // Only set alias if it's not a keyword
  if (fromMatch[2] && !/^(join|where|on|inner|left|right|cross)$/i.test(fromMatch[2])) {
    from.alias = fromMatch[2];
  }

  // Extract JOINs
  const joins: ParsedQuery['joins'] = [];
  const joinRegex = /join\s+(\w+)(?:\s+(\w+))?\s+on\s+(.+?)(?=\s+join\s+|\s+where\s+|$)/gi;
  let joinMatch;
  while ((joinMatch = joinRegex.exec(normalized)) !== null) {
    const join: ParsedQuery['joins'][0] = {
      table: joinMatch[1],
      condition: joinMatch[3].trim(),
    };
    if (joinMatch[2] && !/^on$/i.test(joinMatch[2])) {
      join.alias = joinMatch[2];
    }
    joins.push(join);
  }

  // Extract WHERE
  const whereMatch = normalized.match(/where\s+(.+)$/i);
  const where = whereMatch ? whereMatch[1].trim() : undefined;

  return { columns, from, joins, where };
}

// Build alias → real table name map
function buildAliasMap(parsed: ParsedQuery): Map<string, string> {
  const map = new Map<string, string>();
  if (parsed.from.alias) {
    map.set(parsed.from.alias.toLowerCase(), parsed.from.table.toLowerCase());
  }
  for (const j of parsed.joins) {
    if (j.alias) {
      map.set(j.alias.toLowerCase(), j.table.toLowerCase());
    }
  }
  return map;
}

// Replace aliases in a string with real table names
function resolveAliases(str: string, aliasMap: Map<string, string>): string {
  let result = str;
  for (const [alias, table] of aliasMap) {
    const regex = new RegExp(`\\b${alias}\\.`, 'gi');
    result = result.replace(regex, `${table}.`);
  }
  return result;
}

export function sqlToAlgebra(query: string): AlgebraNode {
  const parsed = parseQuery(query);
  const aliasMap = buildAliasMap(parsed);

  // Build bottom-up: tables → joins → selection → projection

  // Start with FROM table
  let current: AlgebraNode = { type: 'table', name: parsed.from.table.toLowerCase() };

  // Apply JOINs
  for (const join of parsed.joins) {
    const rightTable: AlgebraNode = { type: 'table', name: join.table.toLowerCase() };
    const condition = resolveAliases(join.condition, aliasMap);
    current = {
      type: 'join',
      joinType: '⋈',
      condition,
      left: current,
      right: rightTable,
    };
  }

  // Apply WHERE (selection)
  if (parsed.where) {
    const condition = resolveAliases(parsed.where, aliasMap);
    current = {
      type: 'selection',
      condition,
      child: current,
    };
  }

  // Apply SELECT (projection)
  const resolvedColumns = parsed.columns.map(c => resolveAliases(c, aliasMap));
  current = {
    type: 'projection',
    columns: resolvedColumns,
    child: current,
  };

  return current;
}

export function algebraToString(node: AlgebraNode): string {
  switch (node.type) {
    case 'table':
      return node.name;
    case 'selection':
      return `σ(${node.condition})(${algebraToString(node.child)})`;
    case 'projection':
      return `π(${node.columns.join(', ')})(${algebraToString(node.child)})`;
    case 'join':
      return `(${algebraToString(node.left)} ⋈(${node.condition}) ${algebraToString(node.right)})`;
  }
}
