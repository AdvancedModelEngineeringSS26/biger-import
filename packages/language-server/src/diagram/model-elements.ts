
import { LibavoidEdge } from 'sprotty-routing-libavoid';


/**
 * Custom edge that uses Libavoid layouting 
 */
export class NotationEdge extends LibavoidEdge {
    isSource: boolean;
    notation: string;
    connectivity: string;
    relationshipType: string;
}
