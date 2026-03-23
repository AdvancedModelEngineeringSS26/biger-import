import { DiamondNode, EdgePlacement, PreRenderedElement, RectangularNode, SLabelImpl } from 'sprotty';
import { LibavoidEdge } from 'sprotty-routing-libavoid';



/**
 * node representing an entity
 */
export class EntityNode extends RectangularNode {
    expanded: boolean;
    weak: boolean;
    isUml: boolean;
}

/**
 * node representing a relationship
 */
export class RelationshipNode extends DiamondNode {
    weak: boolean;
}

/**
 * edge representing a link between two nodes
 */
export class NotationEdge extends LibavoidEdge {
    isSource: boolean;
    notation: string;
    connectivity: string;
    relationshipType: string;
}

/**
 * label representing the cardinality of a link between nodes
*/
export class CardinalityLabel extends SLabelImpl {
    override edgePlacement = <EdgePlacement> {
        position: 0.5,
        side: 'top',
        rotate: false,
        offset: 10
    };
}

export class LeftCardinalityLabel extends SLabelImpl {
    override edgePlacement = <EdgePlacement> {
        position: 0.2,
        side: 'top',
        rotate: false,
        offset: 10
    };
}

export class RightCardinalityLabel extends SLabelImpl {
    override edgePlacement = <EdgePlacement> {
        position: 0.8,
        side: 'top',
        rotate: false,
        offset: 10
    };
}

export class RoleLabel extends SLabelImpl {
    override edgePlacement = <EdgePlacement> {
        position: 0.5,
        side: 'bottom',
        rotate: false,
        offset: 10
    };
}

export class LeftRoleLabel extends SLabelImpl {
    override edgePlacement = <EdgePlacement> {
        position: 0.2,
        side: 'bottom',
        rotate: false,
        offset: 10
    };
}

export class RightRoleLabel extends SLabelImpl {
    override edgePlacement = <EdgePlacement> {
        position: 0.8,
        side: 'bottom',
        rotate: false,
        offset: 10
    };
}

export class InheritanceEdge extends LibavoidEdge {

}

export class PopupButton extends PreRenderedElement {
    target: string;
	kind: string;
}