export interface JoinInfo {
    table: string;
    on: string;
}

export interface ParsedQuery {
    select: string[];
    from: string;
    joins: JoinInfo[];
    wheres: WhereCondition[] | null;
    isValid: boolean;
    error: string | undefined;
}

export interface WhereCondition {
    left: string;
    operator: string;
    right: string;
}

// -------------------------------------------------------------------

export type QueryNode =
    | { type: "PROJECTION"; params: ProjectionParams; child: QueryNode }
    | { type: "SELECTION"; params: SelectionParams; child: QueryNode }
    | { type: "JOIN"; params: JoinParams; left: QueryNode; right: QueryNode }
    | { type: "TABLE"; params: TableParams };

interface ProjectionParams {
    columns: string[];
}

interface SelectionParams {
    condition: string;
}

interface JoinParams {
    on: string;
}

interface TableParams {
    name: string;
}
