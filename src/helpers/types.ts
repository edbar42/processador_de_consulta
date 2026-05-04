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
