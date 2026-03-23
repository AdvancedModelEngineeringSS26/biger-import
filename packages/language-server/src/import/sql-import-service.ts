import type { ImportSqlParams, ImportSqlResult } from '@biger/common';

export class SqlImportService {

    async importFromSql(params: ImportSqlParams): Promise<ImportSqlResult> {
        console.log(
            `[biger.import] Processing SQL import from ${params.sqlDocumentUri} into ${params.erDocumentUri}.`
        );
        console.log(`[biger.import] SQL content length: ${params.sqlContent.length}`);

        // Placeholder for future SQL -> ER transformation.
        return {
            erContent: ''
        };
    }
}
