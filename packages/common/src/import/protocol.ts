export const IMPORT_SQL_REQUEST = 'biger/importSql';

export type SqlDialect = 'MySQL' | 'PostgreSQL';

export interface ImportSqlParams {
    erDocumentUri: string;
    sqlDocumentUri: string;
    sqlContent: string;
    dialect: SqlDialect;
}

export interface ImportSqlResult {
    erContent: string;
    error?: string;
}
