import { startLanguageServer } from 'langium/lsp';
import { NodeFileSystem } from 'langium/node';
import { createConnection, ProposedFeatures } from 'vscode-languageserver/node.js';
import { createEntityRelationshipServices } from './entity-relationship-module.js';
import { addDiagramHandler, addDiagramSelectionHandler, addHoverPopupHandler, addTextSelectionHandler } from 'langium-sprotty';
import { registerImportRequestHandler } from './import/import-request-handler.js';

// create a connection to the client
const connection = createConnection(ProposedFeatures.all);

// inject the language services
const { shared, EntityRelationship } = createEntityRelationshipServices({ connection, ...NodeFileSystem });

// start the language server with the language-specific service
startLanguageServer(shared);

addDiagramHandler(connection, shared);
addDiagramSelectionHandler(EntityRelationship);
addTextSelectionHandler(EntityRelationship, { fitToScreen: 'none' });
addHoverPopupHandler(EntityRelationship);
registerImportRequestHandler(connection);
