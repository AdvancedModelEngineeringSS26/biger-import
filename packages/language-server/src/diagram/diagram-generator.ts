import { GeneratorContext, LangiumDiagramGenerator } from "langium-sprotty";
import { SModelRoot, SNode, SLabel, SEdge, SCompartment } from "sprotty-protocol";
import { Attribute, Entity, Model, NotationType, RelationEntity, Relationship, RelationTarget } from "../generated/ast.js";
import { NotationEdge } from "./model-elements.js";
//import { NotationEdge } from "./model-elements.js";
import { GRAPH_TYPE, RelationshipType } from '@biger/common';

/**
 * Generates a seralizable SModel representation of language elements
 * See: https://sprotty.org/docs/smodel/
 */
export class ERDiagramGenerator extends LangiumDiagramGenerator {

    /**
     * Starts diagram generation, calls diagram element generation based on the given Model
     * @param args model to convert to graphical representation
     * @returns graphical model root node
     */
    protected generateRoot(args: GeneratorContext<Model>): SModelRoot {
        const { document } = args;
        const model = document.parseResult.value;

        const entityNodes = model.entities.map(e => this.generateNode(e, args))
        const relationshipNodes = model.relationships.map(r => this.generateRelationshipNode(r, args))
        const relationshipEdges = model.relationships.flatMap(r => this.generateRelationEdges(r, args))
        const inheritanceEdges = model.entities.map(e => this.inheritanceEdges(e, args)).flatMap(edge => edge ? [edge] : []);
        
        const graph = {
            type: GRAPH_TYPE,
            id: 'root',
            children: [
                ...entityNodes,
                ...relationshipNodes,
                ...relationshipEdges,
                ...inheritanceEdges
            ]
        };

        this.traceProvider.trace(graph, model);
        return graph;
    }

    /**
     * Generates a graph node based on an entity
     * @param entity entity the node should represent
     * @param ctx context of the graph
     * @returns graph node to be used in the graph representation
     */
    protected generateNode(entity: Entity, ctx: GeneratorContext<Model>): SNode {
        const { idCache } = ctx;
        const nodeId = idCache.uniqueId(entity.name, entity);

        const label: SLabel = {
            type: 'label:name',
            id: idCache.uniqueId(nodeId + '.label'),
            text: entity.name
        };
        this.traceProvider.trace(label, entity, 'name');

        //map attributes of entity to node
        const attributes = entity.attributes.map(attr => this.createAttributeLabels(attr, nodeId, ctx));
        const attrCompartment = <SCompartment>{
            type: 'compartment:attributes',
            id: idCache.uniqueId(nodeId + '.attributes'),
            layout: 'vbox',
            layoutOptions: {
                hAlign: 'left',
                vGap: 1.0
            },
            children: attributes
        };
        this.traceProvider.trace(attrCompartment, entity, 'attributes');
        this.markerProvider.addDiagnosticMarker(attrCompartment, entity, ctx);

        const node: SNode = {
            type: 'node:entity',
            id: nodeId,
            children: [
                label,
                attrCompartment
            ],
            layout: 'vbox',
            layoutOptions: {
                paddingTop: 10.0,
                paddingBottom: 10.0,
                paddingLeft: 10.0,
                paddingRight: 10.0
            }
        };
        this.traceProvider.trace(node, entity);
        this.markerProvider.addDiagnosticMarker(node, entity, ctx);
        return node;
    }

    /**
     * generates edges connecting the relationship node to the entity nodes
     * @param relationship the {@link Relationship} to be rendered
     * @param args {@link GeneratorContext} containing the langium document and idCache.
     * @returns an array of up to 3 {@link SEdge}s representing each connection in the relationship
     */
    
    protected generateRelationEdges(relationship: Relationship, ctx: GeneratorContext<Model>): SEdge[] {
        const { idCache } = ctx;
        const { document } = ctx;
        const model = document.parseResult.value;

        const relationshipNodeId = idCache.getId(relationship);
        const sourceId = idCache.getId(relationship.source?.entity.ref);

        let edges: SEdge[] = [];
        if (model.notation && model.notation.notationType.UML && relationship.targets.length <= 1) {
            // add UML specific edges here (if required)
        }

        console.debug(`Generating edges for relationship ${relationship.name} with source ${relationship.source?.entity.ref} and targets ${relationship.targets.map(t => t.relationEntity.entity.ref)}`);

        
        if (sourceId) { //add edge from the source entity to the relationship node
            const type = this.getRelationshipType(relationship.targets[0]);
            const sourceEdge = this.createEdge(relationship.source!, null, sourceId, relationshipNodeId!, type, ctx);
            edges.push(sourceEdge);
        }
        

        
        for (let i = 0; i < relationship.targets.length; i++) {
            const targetId = idCache.getId(relationship.targets[i].relationEntity.entity.ref);
            if (targetId) {
                let type = this.getRelationshipType(relationship.targets[i]);
                if (i == 0) { //attune edge of first target to source edge
                    let secondRelationshipType = relationship.targets[i+1]?.type;
                    if (secondRelationshipType) {
                        if (secondRelationshipType.AGGREGATION_LEFT) {
                            type = RelationshipType.AGGREGATION_RIGHT;
                        } else if (secondRelationshipType.COMPOSITION_LEFT) {
                            type = RelationshipType.COMPOSITION_RIGHT;
                        }
                    }
                }
                const targetEdge = this.createEdge(relationship.targets[i].relationEntity, null, relationshipNodeId!, targetId, type, ctx);
                edges.push(targetEdge);
            }
        }
        
        return edges;
    }
        

    /**
     * Creates an edge based on the given parameters
     * @param target semantic source of the relationship (comes from Langium model)
     * @param source 
     * @param sourceId logical source of the relationship (ID of the sprotty node)
     * @param targetId logical target of the relationship (ID of the sprotty node)
     * @param relType
     * @param ctx {@link GeneratorContext} containing the langium document and idCache.
     * @returns a {@link NotationEdge} containing all relevant information for rendering.
     */
    
    protected createEdge(target: RelationEntity, source: RelationEntity | null, sourceId: string, targetId: string, relationshipType: string, ctx: GeneratorContext<Model>): SEdge {
        
        let { idCache } = ctx;
        let { document } = ctx;
        let model = document.parseResult.value;

        const notationType = model.notation?.notationType;
        const relationship = target.$container as Relationship;
        const edgeId = idCache.uniqueId(`${sourceId}:${relationship.name}:${targetId}`, relationship);
        
        const type = this.getEdgeType(target, notationType);
        

        let labels = this.createEdgeLabels(target, source, notationType, edgeId, ctx);
        const edge = <SEdge>{
            type: type,
            id: edgeId,
            sourceId: sourceId,
            targetId: targetId,
            notation: this.getNotationType(model),
            connectivity: this.getCardinality(target),
            isSource: target === relationship.source,
            relationshipType: relationshipType,
            children: labels
        };
        this.traceProvider.trace(edge, relationship);
        return edge;
    }
        
    protected createEdgeLabels(sourceRelation: RelationEntity, targetRelation: RelationEntity | null, notationType: NotationType | undefined, edgeId: string, ctx: GeneratorContext<Model>): SLabel[] {
        const { idCache } = ctx;
        const labels: SLabel[] = [];
        const typeCardinality = targetRelation ? 'label:top' : 'label:top-left';
        const typeRole = targetRelation ? 'label:bottom' : 'label:bottom-left';

        labels.push(<SLabel>{
            type: typeCardinality,
            id: idCache.uniqueId(edgeId + '.label'),
            text: this.getEdgeLabelText(notationType, this.getCardinality(sourceRelation)),
            edgePlacement: {
                rotate: true,
                side: 'bottom',
                position: 0.5,
                offset: 7
            }
        });

        labels.push(<SLabel>{
            type: typeRole,
            id: idCache.uniqueId(edgeId + '.roleLabel'),
            text: sourceRelation.role ?? '',
        });

        //legacy code, unused since targetRelation is always null in the current implementation
        /*
        if (targetRelation !== null) {
            let relationship = sourceRelation.$container;
            labels.push(<SLabel>{
                type: 'label:top',
                id: idCache.uniqueId(edgeId + '.relationName'),
                text: relationship.name
            });

            labels.push(<SLabel>{
                type: 'label:top-right',
                id: idCache.uniqueId(edgeId + '.additionalLabel'),
                text: this.getEdgeLabelText(notationType, this.getCardinality(targetRelation))
            });
            
            labels.push(<SLabel>{
                type: 'label:bottom-right',
                id: idCache.uniqueId(edgeId + 'additionalRoleLabel'),
                text: this.getRoleLabelText(targetRelation)
            })
        }
        */
       return labels;
    }
        

    /**
     * Generates a node for a relationship
     * @param relationship the relationship to be rendered.
     * @param idCache the {@link IdCache} for the current diagram 
     * @returns An {@link SNode} representing the relationship
     */
    protected generateRelationshipNode(relationship: Relationship, ctx: GeneratorContext<Model>): SNode {
        const { idCache } = ctx;
        const nodeId = idCache.uniqueId(relationship.name, relationship);

        const label: SLabel = {
            type: 'label:relationship',
            id: idCache.uniqueId(nodeId + '.label'),
            text: relationship.name
        };

        this.traceProvider.trace(label, relationship);

        const relationshipNode: SNode = {
            type: 'node:relationship',
            id: nodeId,
            children: [label],
            layout: 'stack',
            layoutOptions: {
                paddingTop: 25.0,
                paddingBottom: 25.0,
                paddingLeft: 10.0,
                paddingRight: 10.0
            }
        };
        this.traceProvider.trace(relationshipNode, relationship);
        this.markerProvider.addDiagnosticMarker(relationshipNode, relationship, ctx);
        return relationshipNode;

    }

    /**
     * Generates label compartments for an attribute
     * @param attr the attribute to be rendered
     * @param entityId the ID of the entity the attribute belongs to
     * @param idCache the {@link IdCache} for the current diagram
     * @returns An {@link SCompartment} containing an {@link SLabel} for name, datatype and (optionally) visibility of the attribute
     */
    protected createAttributeLabels(attr: Attribute, entityId: string, ctx: GeneratorContext<Model>): SCompartment {
        const { idCache } = ctx;
        const attributeId = idCache.uniqueId(entityId + '.' + attr.name, attr)
        const labelType = this.getAttributeLabelType(attr);

        const { document } = ctx;
        const model = document.parseResult.value;

        let labels = [];

        const visibilityLabel = <SLabel>{
            type: 'label:visibility',
            id: attributeId + '.visibility',
            text: this.getAttributeVisibility(attr),
        }

        const nameLabel = <SLabel>{
            type: labelType,
            id: attributeId + '.name',
            text: attr.name
        }

        const typeLabel = <SLabel>{
            type: labelType,
            id: attributeId + '.datatype',
            text: this.attributeDatatypeString(attr)
        }
        
        if (model.notation?.notationType.UML && !attr.visibility?.VISI_NONE) {
            labels.push(visibilityLabel)
            this.traceProvider.trace(visibilityLabel, attr);
        }
        labels.push(nameLabel, typeLabel)
        this.traceProvider.trace(nameLabel, attr);
        this.traceProvider.trace(typeLabel, attr);
    
        const attrRowCompartment = <SCompartment>{
            type: 'compartment:attribute-row',
            id: attributeId,
            layout: 'hbox',
            layoutOptions: {
                vAlign: 'center',
                hGap: 5
            },
            children: labels
        }
        this.traceProvider.trace(attrRowCompartment, attr);

        return attrRowCompartment;
    }

    /**
     * Transorms an attribute's datatype into a string.
     * @param attr the attribute whose datatype is to be transformed.
     * @returns a string representation of the datatype.
     */
        protected attributeDatatypeString(attr: Attribute): string {
            if (attr.datatype) {
                let size = attr.datatype.size;
                let d = attr.datatype.d; //specifies the number of digits after the decimal point
                if(size && size !== 0) {
                    if (d && d !== 0) {
                        return attr.datatype?.type + '(' + attr.datatype?.size + ', ' + attr.datatype?.d + ')'
                    } else if (!d || d === 0) {
                        return attr.datatype.type + '(' + attr.datatype.size + ')';
                    }
            }
                return attr.datatype.type;
            }
            return ' ';
        }

    /**
     * Labels an edge 'partial' for chen notation if the cardinality is 0..1 or 0..N
     * @param relationEntity the {@link RelationEntity} whose edge type is to be determined
     * @param notationType the notation form of the diagram
     * @returns 'edge' or 'edge:partial' depending on the cardinality
     */
    protected getEdgeType(relationEntity: RelationEntity , notationType: NotationType | undefined): string {
        if (notationType?.CHEN) {
            if (relationEntity.cardinality?.ZERO_OR_ONE || relationEntity.cardinality?.ZERO_OR_MORE) {
                return 'edge:partial'
            }
        }
        return 'edge'
    }

        /**
     * Removes the cardinality from the edge label for crowsfoot and bachman notation
     * @param notationType the notation form of the diagram
     * @param cardinality the cardinality of the edge
     * @returns the cardinality or an empty string depending on the notation
     */
    protected getEdgeLabelText(notationType: NotationType | undefined, cardinality: string): string {
        if (notationType && (notationType.CROWSFOOT || notationType.BACHMAN)) {
            return ' '
        } else return cardinality;
    }

    /**
     * Generates an edge for inheritance relationships between entities
     * @param entity an entity from the Langium model
     * @param idCache the {@link IdCache} for the current diagram 
     * @returns an {@link SEdge} representing the inheritance relationship if there is one, otherwise null
     */
    protected inheritanceEdges(entity: Entity, ctx: GeneratorContext<Model>): SEdge | null {

        if (entity.extends) {
            const { idCache } = ctx;
            let sourceId = idCache.getId(entity);
            let targetId = idCache.getId(entity.extends?.ref);
            let edge = <SEdge>{
                sourceId: sourceId,
                targetId: targetId,
                id: idCache.uniqueId(entity + sourceId! + ':extends:' + targetId),
                type: 'edge:inheritance'
            }
            return edge;
        }
        else return null;
    }

    /**
     * Transforms a cardinality type into a string.
     * @param relationEntity the {@link RelationEntity} whose cardinality is to be transformed.
     * @returns a string representation of the cardinality.
     */
    protected getCardinality(relationEntity: RelationEntity): string {
        if (!relationEntity.cardinality || relationEntity.cardinality.CARD_NONE) {
            return ' '
        } else return relationEntity.cardinality.MANY ?? 
            relationEntity.cardinality.ONE ??
            relationEntity.cardinality.ZERO_OR_ONE ??
            relationEntity.cardinality.ZERO_OR_MORE ?? 
            ''
    }

    /**
     * Determines the label type for an attribute based on its type
     * @param attr the attribute whose label type is to be determined
     * @returns a string representing the label type, starting with 'label:' 
     */
    protected getAttributeLabelType(attr: Attribute): string {
        if (attr.type?.KEY) {
            return 'label:key'
        } else if (attr.type?.PARTIAL_KEY) {
            return 'label:partial-key'
        } else if (attr.type?.DERIVED) {
            return 'label:derived'
        } else {
            return 'label:text'
        }
    }

    /**
     * Determines the visibility of an attribute
     * @param attr the attribute whose visibility is to be determined
     * @returns a string representing the visibility, e.g. 'public', 'private', 'protected', 'package' or ' '
     */
    protected getAttributeVisibility(attr: Attribute): string {
        if (!attr.visibility || attr.visibility.VISI_NONE) {
            return ' '
        } else if (attr.visibility.PUBLIC) {
            return attr.visibility.PUBLIC;
        } else if (attr.visibility.PRIVATE) {
            return attr.visibility.PRIVATE;
        } else if (attr.visibility.PROTECTED) {
            return attr.visibility.PROTECTED;
        } else if (attr.visibility.PACKAGE) {
            return attr.visibility.PACKAGE;
        } else {
            console.warn(`Unknown visibility type: ${attr.visibility}`);
            return ' '
        }
    }


    /**
     * Determines the relationship type for a given target
     * @param target the target whose relationship type is to be determined
     * @returns a string representing the relationship type, e.g. '->', '-o', 'o-', '-*' or '*-'
     */
    protected getRelationshipType(target: RelationTarget): string {
        if (!target.type || target.type.RELA_DEFAULT) {
            return RelationshipType.RELA_DEFAULT.toString();
        } else return target.type.AGGREGATION_LEFT ??
            target.type.AGGREGATION_RIGHT ??
            target.type.COMPOSITION_LEFT ??
            target.type.COMPOSITION_RIGHT ??
            ''
    }

    /**
     * Determines the notation type for the model
     * @param model the model whose notation type is to be determined
     * @returns a string representing the notation type, e.g. 'BACHMAN', 'CROWSFOOT', 'CHEN', 'UML' or 'NOTA_DEFAULT'
     */
    protected getNotationType(model: Model): string {
        return model.notation?.notationType.BACHMAN ??
            model.notation?.notationType.CROWSFOOT ??
            model.notation?.notationType.CHEN ??
            model.notation?.notationType.UML ??
            model.notation?.notationType.NOTA_DEFAULT ??
            ''
    }
}