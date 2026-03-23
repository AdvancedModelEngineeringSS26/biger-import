import 'sprotty/css/sprotty.css';
import '../css/diagram.css';

import { Container, ContainerModule } from 'inversify';
import {
    configureModelElement, ConsoleLogger, HtmlRootImpl, HtmlRootView, LogLevel, overrideViewerOptions, 
    PreRenderedElementImpl, PreRenderedView, SGraphView, SLabelView, SRoutingHandleImpl, SRoutingHandleView, 
    TYPES, loadDefaultModules, SGraphImpl, SLabelImpl, labelEditUiModule, 
    editLabelFeature,
    SCompartmentImpl,
    SCompartmentView,
    editFeature,
    expandFeature
} from 'sprotty';
import {
    LibavoidDiamondAnchor,
    LibavoidEllipseAnchor,
    LibavoidRectangleAnchor,
    LibavoidRouter,
    RouteType,
} from 'sprotty-routing-libavoid';
import { CardinalityLabel, EntityNode, InheritanceEdge, LeftCardinalityLabel, LeftRoleLabel, NotationEdge, RelationshipNode, RightCardinalityLabel, RightRoleLabel, RoleLabel } from './model';
import { EntityNodeView, InheritanceEdgeView, NotationEdgeView, RelationshipNodeView } from './views';
import { GRAPH_TYPE } from '@biger/common';

/**
 * Sprotty Dependency Injection (DI) container for configuring the diagram
 * see: https://sprotty.org/docs/dependency-injection/
 */
const ERDiagramModule = new ContainerModule((bind, unbind, isBound, rebind) => {
    rebind(TYPES.ILogger).to(ConsoleLogger).inSingletonScope();
    rebind(TYPES.LogLevel).toConstantValue(LogLevel.warn);

    const context = { bind, unbind, isBound, rebind };

    // Libavoid router bindings
    bind(LibavoidRouter).toSelf().inSingletonScope();
    bind(TYPES.IEdgeRouter).toService(LibavoidRouter);
    bind(TYPES.IAnchorComputer).to(LibavoidDiamondAnchor).inSingletonScope();
    bind(TYPES.IAnchorComputer).to(LibavoidEllipseAnchor).inSingletonScope();
    bind(TYPES.IAnchorComputer).to(LibavoidRectangleAnchor).inSingletonScope();

    configureModelElement(context, GRAPH_TYPE, SGraphImpl, SGraphView);
    // Nodes
    //configureModelElement(context, 'node', RectangularNode, RectangularNodeView);
    configureModelElement(context, 'node:entity', EntityNode, EntityNodeView, { enable: [expandFeature] });
    configureModelElement(context, 'node:relationship', RelationshipNode, RelationshipNodeView);
    
    
    // Compartments
    configureModelElement(context, 'compartment:attributes', SCompartmentImpl, SCompartmentView);
    configureModelElement(context, 'compartment:attribute-row', SCompartmentImpl, SCompartmentView);

    // Edges
    configureModelElement(context, 'edge', NotationEdge, NotationEdgeView, { disable: [editFeature] });
    configureModelElement(context, 'edge:inheritance', InheritanceEdge, InheritanceEdgeView, { disable: [editFeature] });
    configureModelElement(context, 'edge:partial', NotationEdge, NotationEdgeView, { disable: [editFeature] });

    // Labels
    configureModelElement(context, 'label:name', SLabelImpl, SLabelView, { enable: [editLabelFeature]});
    configureModelElement(context, 'label:visibility', SLabelImpl, SLabelView, { enable: [editLabelFeature] });
    configureModelElement(context, 'label:relationship', SLabelImpl, SLabelView, { enable: [editLabelFeature] });
    configureModelElement(context, 'label:top', CardinalityLabel, SLabelView);
    configureModelElement(context, 'label:top-left', LeftCardinalityLabel, SLabelView);
    configureModelElement(context, 'label:top-right', RightCardinalityLabel, SLabelView);
    configureModelElement(context, 'label:bottom-left', LeftRoleLabel, SLabelView);
    configureModelElement(context, 'label:bottom-right', RightRoleLabel, SLabelView);
    configureModelElement(context, 'label:bottom', RoleLabel, SLabelView);
    configureModelElement(context, 'label:attributes', SLabelImpl, SLabelView, { enable: [editLabelFeature]});
    configureModelElement(context, 'label:text', SLabelImpl, SLabelView, { enable: [editLabelFeature] });
    configureModelElement(context, 'label:key', SLabelImpl, SLabelView, { enable: [editLabelFeature] });
    configureModelElement(context, 'label:partial-key', SLabelImpl, SLabelView, { enable: [editLabelFeature] });
    configureModelElement(context, 'label:derived', SLabelImpl, SLabelView, { enable: [editLabelFeature] });

    //
    //configureModelElement(context, 'edge', RelationshipEdge, PolylineEdgeView);
    configureModelElement(context, 'html', HtmlRootImpl, HtmlRootView);
    configureModelElement(context, 'pre-rendered', PreRenderedElementImpl, PreRenderedView);
    configureModelElement(context, 'routing-point', SRoutingHandleImpl, SRoutingHandleView);
    configureModelElement(context, 'volatile-routing-point', SRoutingHandleImpl, SRoutingHandleView);
});

export function createDiagramContainer(widgetId: string): Container {
    const container = new Container();
    // loads all sprotty default modules (except label-edit UI module)
    loadDefaultModules(container, { exclude: [ labelEditUiModule ] });
    
    // load our DI container
    container.load(ERDiagramModule);
    overrideViewerOptions(container, {
        needsClientLayout: true,
        needsServerLayout: true,
        baseDiv: widgetId,
        hiddenDiv: widgetId + '_hidden'
    });

    // configure libavoid router
    const router = container.get(LibavoidRouter);
    configureRouter(router);

    return container;
}

function configureRouter(router: LibavoidRouter): void {
    router.setOptions({
        routingType: RouteType.Orthogonal,
        segmentPenalty: 50,
        // at least height of label to avoid labels overlap if there are two neighbour edges that have labels on the position
        idealNudgingDistance: 24,
        // 25: height of label text + label offset. Such shape buffer distance is required to avoid label over shape
        shapeBufferDistance: 25,
        nudgeOrthogonalSegmentsConnectedToShapes: true,
        // allow or disallow moving edge end from center
        nudgeOrthogonalTouchingColinearSegments: false,
    });
}