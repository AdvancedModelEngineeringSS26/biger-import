import { IMPORT_SQL_REQUEST, type ImportSqlParams, type ImportSqlResult } from '@biger/common';
import type { Connection } from 'vscode-languageserver/node.js';
import { SqlImportService } from './sql-import-service.js';

export function registerImportRequestHandler(connection: Connection): void {
    const sqlImportService = new SqlImportService();

    connection.onRequest(IMPORT_SQL_REQUEST, async (params: ImportSqlParams): Promise<ImportSqlResult> => {
        return sqlImportService.importFromSql(params);
    });
}
