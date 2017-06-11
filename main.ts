type IVector2 = Float32Array;
type ILayer = number; // Integers only!

interface ITimeline {
    canvas: HTMLCanvasElement,
    context: CanvasRenderingContext2D,
    inputState: IInputState,
    realDims: IVector2,
    localDims: IVector2,
    pixelRatio: number,
    nodes: INode[]
}

interface INode {
    layer: number,
    range: IVector2,
    name: string,
    nodeInputState: any // TODO(JULIAN)
}

function make_vector2(x, y): IVector2 {
    let res = new Float32Array(2);
    res[0] = x;
    res[1] = y;
    return res;
}

function set_vector2(vec, x, y) {
    vec[0] = x;
    vec[1] = y;
}

function make_node(layer, name, start, end): INode {
    return {
        name: name,
        range: make_vector2(start, end),
        layer: layer,
        nodeInputState: {
            selected: false,
            hovered: false
        }
    };
}

function is_val_in_range(val: number, start: number, end: number): boolean {
    return val >= start && val <= end;
}

function layer_index_to_top(layerIndex: number) {
    return layerIndex * LAYER_HEIGHT - NODE_HPADDING;
}

function layer_index_to_bottom(layerIndex: number) {
    return layer_index_to_top(layerIndex) + LAYER_HEIGHT - NODE_HPADDING*2;
}

function is_pos_in_node(pos: IVector2, node: INode): boolean {
    return is_val_in_range(pos[0], node.range[0], node.range[1]) &&
        is_val_in_range(pos[1], layer_index_to_top(node.layer), layer_index_to_bottom(node.layer));
}

function pos_over_node_endpoint(pos: IVector2, node: INode): number {
    if (is_val_in_range(pos[1], layer_index_to_top(node.layer), layer_index_to_bottom(node.layer))) {
        if (is_val_in_range(pos[0], node.range[0], node.range[0] + NODE_ENDPOINT_WIDTH)) {
            return -1;
        } else if (is_val_in_range(pos[0], node.range[1] - NODE_ENDPOINT_WIDTH, node.range[1])) {
            return 1;    
        }
    }
    return 0;        
}

function is_pointer_over_endpoint (pos: IVector2, timeline: ITimeline) : [boolean, INode, number] {
    for (let node of timeline.nodes) {
        let endpoint = pos_over_node_endpoint(pos, node);
        if (endpoint !== 0) {
            return [true, node, endpoint];
        }
    }
    return [false, null, 0];
}

function is_pointer_over_something (pos: IVector2, timeline: ITimeline) : [boolean, INode] {
    for (let node of timeline.nodes) {
        if (is_pos_in_node(pos, node)) {
            return [true, node];
        }
    }
    return [false, null];
}

function is_pointer_over_nothing (pos: IVector2, timeline: ITimeline) : boolean {
    for (let node of timeline.nodes) {
        if (is_pos_in_node(pos, node)) {
            return false;
        }
    }
    return true;
}

function is_pointer_over_selected (pos: IVector2, timeline: ITimeline) : [boolean, INode] {
    for (let node of timeline.nodes) {
        if (is_pos_in_node(pos, node)) {
            if (node.nodeInputState.selected) {
                return [true, node];
            }
        }
    }
    return [false, null];
}

function is_pointer_over_deselected (pos: IVector2, timeline: ITimeline) : [boolean, INode] {
    for (let node of timeline.nodes) {
        if (is_pos_in_node(pos, node)) {
            if (!node.nodeInputState.selected) {
                return [true, node];
            }
        }
    }
    return [false, null];
}

function update_input () {

}

const enum InputMode {
    Idle,
    Grabbing
}

type IInputState = {
    mode: InputMode.Idle
    target: never
    mousePos: IVector2
    mouseStartPos: never
} | {
        mode: InputMode.Grabbing,
        target: INode[]
        mousePos: IVector2
        mouseStartPos: IVector2
    };

function lin_map(inputStart: number, inputEnd: number, outputStart: number, outputEnd: number, inputValue: number): number {
    let domain = inputEnd - inputStart;
    let range = outputEnd - outputStart;
    return (inputValue - inputStart) / domain * range + outputStart;
}

function resize_timeline(timeline: ITimeline) {
    let canvas = timeline.canvas;
    canvas.width = canvas.clientWidth * 2; //TODO: HIDPI
    canvas.height = canvas.clientHeight * 2;
    set_vector2(timeline.realDims, canvas.clientWidth, canvas.clientHeight);
    set_vector2(timeline.localDims, canvas.width, canvas.height);
}

function update_mouse_pos(timeline: ITimeline, clientX: number, clientY: number) {
    let canvas = timeline.canvas;
    timeline.inputState.mousePos[0] = clientX - canvas.offsetLeft;//lin_map(0, timeline.realDims[0], 0, timeline.localDims[0], clientX - canvas.offsetLeft);
    timeline.inputState.mousePos[1] = clientY - canvas.offsetTop;//lin_map(0, timeline.realDims[1], 0, timeline.localDims[1], clientY - canvas.offsetTop);
}

function switch_input_state(inputState: IInputState, newInputMode: InputMode) {
    if (inputState.mode === newInputMode) {
        return;
    }
    switch (inputState.mode) {
        case InputMode.Idle: {
            if (newInputMode === InputMode.Grabbing) {
                (<IInputState>inputState).mode = newInputMode;
                // (<IInputState>inputState).target = [];
                set_vector2((<IInputState>inputState).mouseStartPos, 0, 0);
            }
        } break;
        case InputMode.Grabbing: {
            if (newInputMode === InputMode.Idle) {
                (<IInputState>inputState).mode = newInputMode;
                set_vector2((<IInputState>inputState).mouseStartPos, 0, 0);
            }
        } break;
    }
}

function deselect_all (timeline: ITimeline) {
    for (let node of timeline.nodes) {
        node.nodeInputState.selected = false;
    }
}

function select_uniquely (node: INode, timeline: ITimeline) {
    deselect_all(timeline);
    select_node(node);
}

function select_node (node: INode) {
    node.nodeInputState.selected = true;
}

function y_to_layer (y: number) {
    return Math.round(y/LAYER_HEIGHT);
}

function make_timeline(canvas: HTMLCanvasElement): ITimeline {
    let ctx = canvas.getContext('2d');

    let timeline: ITimeline = {
        canvas: canvas,
        inputState: <IInputState>{
            mode: InputMode.Idle,
            target: [],
            mousePos: make_vector2(0, 0),
            mouseStartPos: make_vector2(0, 0)
        },
        context: ctx,
        realDims: make_vector2(0, 0),
        localDims: make_vector2(0, 0),
        pixelRatio: window.devicePixelRatio,
        nodes: [make_node(0, 'Hello', 0, 200),
        make_node(0, 'Foo', 300, 500),
        make_node(1, 'Bar', 200, 600)]
    };

    resize_timeline(timeline);

    let inputState = timeline.inputState;

    canvas.addEventListener('mousedown', (event) => {
        update_mouse_pos(timeline, event.clientX, event.clientY);
        if (inputState.mode === InputMode.Idle) {
            let hoveredNode: INode | null = null;
            for (let node of timeline.nodes) {
                if (is_pos_in_node(timeline.inputState.mousePos, node)) {
                    hoveredNode = node;
                    break;
                }
            }
            if (hoveredNode !== null) {
                if (!hoveredNode.nodeInputState.selected) {
                    if (event.shiftKey) {
                        select_node(hoveredNode)
                    } else {
                        select_uniquely(hoveredNode, timeline);
                    }
                    
                }
            } else if (!event.shiftKey) {
                deselect_all(timeline);
            }
            switch_input_state(timeline.inputState, InputMode.Grabbing);
            set_vector2(timeline.inputState.mouseStartPos, timeline.inputState.mousePos[0], timeline.inputState.mousePos[1]);
        }
    });

    canvas.addEventListener('mouseup', (event) => {
        update_mouse_pos(timeline, event.clientX, event.clientY);
        switch (inputState.mode) {
            case InputMode.Idle: {

            } break;
            case InputMode.Grabbing: {
                for (let node of timeline.nodes) {
                    if (node.nodeInputState.selected) {
                        node.range[0] += inputState.mousePos[0] - inputState.mouseStartPos[0];
                        node.range[1] += inputState.mousePos[0] - inputState.mouseStartPos[0];
                        node.layer = y_to_layer(inputState.mousePos[1] - inputState.mouseStartPos[1] + layer_index_to_top(node.layer));

                        // node.layer = Math.floor()
                        // (tempData.offset[0] + node.range[0])
                        // ctx.fillRect( * pixelRatio,
                        //             (tempData.offset[1] + layer_index_to_top(node.layer)) * pixelRatio,
                        //             (node.range[1] - node.range[0]) * pixelRatio, LAYER_HEIGHT * pixelRatio);
                    }
                }

                switch_input_state(inputState, InputMode.Idle);
            } break;
        }
    });

    canvas.addEventListener('mousemove', (event) => {
        update_mouse_pos(timeline, event.clientX, event.clientY);
        let hovering = false;
        for (let node of timeline.nodes) {
            let shouldHover = is_pos_in_node(timeline.inputState.mousePos, node);
            node.nodeInputState.hovered = is_pos_in_node(timeline.inputState.mousePos, node) && !hovering;
            hovering = hovering || shouldHover; // Only allow hovering over one thing at a time
        }
    });

    return timeline;
}

let timelineElems: HTMLCollectionOf<Element> = document.getElementsByClassName('js-timeline');
let timelines: ITimeline[] = [];
for (let i = 0; i < timelineElems.length; i++) {
    let timelineElem = timelineElems[i];
    let timeline = make_timeline(<HTMLCanvasElement>timelineElem);
    timelines.push(timeline);
}

window.addEventListener('resize', () => {
    for (let timeline of timelines) {
        resize_timeline(timeline);
    }
});

const LAYER_HEIGHT = 50;
const NODE_HPADDING = 5;
const NODE_ENDPOINT_WIDTH = 15;
const COLORS = {
    background: '#252526',
    layer: {
        background: '#333333'
    },
    nodes: {
        background: '#5a5a5a',
        hover: '#7cd4f8',
        selected: '#a7e040',
        foreground: '#ae85fc'
    }
};

function get_node_height (node: INode) {
    return layer_index_to_bottom(node.layer) - layer_index_to_top(node.layer);
}

function get_node_top (node: INode) {
    return layer_index_to_top(node.layer) + NODE_HPADDING;
}

function draw_node_background (timeline : ITimeline, node: INode) {
    let pixelRatio = timeline.pixelRatio;
    let ctx = timeline.context;
    ctx.fillRect(node.range[0] * pixelRatio,
                 (layer_index_to_top(node.layer) + NODE_HPADDING) * pixelRatio,
                 (node.range[1] - node.range[0]) * pixelRatio,
                 get_node_height(node) * pixelRatio);
}

function render_loop() {
    for (let timeline of timelines) {
        let ctx = timeline.context;
        let canvas = timeline.canvas;
        let pixelRatio = timeline.pixelRatio;

        ctx.fillStyle = COLORS.background;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        ctx.lineWidth = timeline.pixelRatio;

        ctx.fillStyle = COLORS.layer.background;
        for (let layerIndex = 0; layerIndex < y_to_layer(timeline.localDims[1]); layerIndex++) {
            ctx.fillRect(0, (layer_index_to_top(layerIndex) + NODE_HPADDING) * pixelRatio,
                         canvas.width, (LAYER_HEIGHT - NODE_HPADDING * 2) * pixelRatio);
        }

        let inputState = timeline.inputState;
        if (inputState.mode === InputMode.Grabbing) {
            ctx.fillStyle = COLORS.nodes.background;
            for (let node of timeline.nodes) {
                if (!node.nodeInputState.selected) {
                    draw_node_background(timeline, node);
                }
            }
            
            ctx.fillStyle = COLORS.nodes.selected;
            ctx.strokeStyle = COLORS.nodes.selected;
            for (let node of timeline.nodes) {
                if (node.nodeInputState.selected) {
                    let x = ((inputState.mousePos[0] - inputState.mouseStartPos[0]) + node.range[0]);
                    let y = ((inputState.mousePos[1] - inputState.mouseStartPos[1]) + layer_index_to_top(node.layer));
                    let width = (node.range[1] - node.range[0]);
                    let height = get_node_height(node);
                    let constrainedY = layer_index_to_top(y_to_layer(y));
                    ctx.fillRect(x * pixelRatio, (constrainedY + NODE_HPADDING) * pixelRatio, width * pixelRatio, height * pixelRatio);
                    ctx.strokeRect(node.range[0] * pixelRatio, get_node_top(node) * pixelRatio,
                                width * pixelRatio,
                                height * pixelRatio);
                }
            }

            ctx.font = `${LAYER_HEIGHT * 0.5 * pixelRatio}px Sans-Serif`;
            ctx.textBaseline = 'middle';
            ctx.textAlign = 'center';
            ctx.fillStyle = COLORS.nodes.foreground;
            for (let node of timeline.nodes) {
                let width = node.range[1] - node.range[0];
                let height = get_node_height(node);//LAYER_HEIGHT;
                if (!node.nodeInputState.selected) {
                    ctx.fillText(node.name, (node.range[0] + width/2) * pixelRatio,
                                (get_node_top(node) + height/2) * pixelRatio, width * pixelRatio);
                } else {
                    let x = ((inputState.mousePos[0] - inputState.mouseStartPos[0]) + node.range[0]);
                    let y = ((inputState.mousePos[1] - inputState.mouseStartPos[1]) + layer_index_to_top(node.layer));
                    let width = (node.range[1] - node.range[0]);
                    let height = get_node_height(node);
                    let constrainedY = layer_index_to_top(y_to_layer(y));
                    ctx.fillText(node.name, (x + width/2) * pixelRatio,
                                (constrainedY + height/2 + NODE_HPADDING) * pixelRatio, width * pixelRatio);
                }
            }

        } else {
            ctx.fillStyle = COLORS.nodes.background;
            for (let node of timeline.nodes) {
                if (!node.nodeInputState.selected) {
                    draw_node_background(timeline, node);
                    // ctx.fillRect(node.range[0] * pixelRatio, layer_index_to_top(node.layer) * pixelRatio, (node.range[1] - node.range[0]) * pixelRatio, LAYER_HEIGHT * pixelRatio);
                }
            }

            ctx.fillStyle = COLORS.nodes.selected;
            for (let node of timeline.nodes) {
                if (node.nodeInputState.selected) {
                    draw_node_background(timeline, node);
                    // ctx.fillRect(node.range[0] * pixelRatio, layer_index_to_top(node.layer) * pixelRatio, (node.range[1] - node.range[0]) * pixelRatio, LAYER_HEIGHT * pixelRatio);
                }
            }

            ctx.font = `${LAYER_HEIGHT * 0.5 * pixelRatio}px Sans-Serif`;
            ctx.textBaseline = 'middle';
            ctx.textAlign = 'center';
            ctx.fillStyle = COLORS.nodes.foreground;
            for (let node of timeline.nodes) {
                let width = node.range[1] - node.range[0];
                let height = get_node_height(node);
                ctx.fillText(node.name, (node.range[0] + width/2) * pixelRatio, (get_node_top(node) + height/2) * pixelRatio, width * pixelRatio);
            }

            ctx.strokeStyle = COLORS.nodes.hover;
            for (let node of timeline.nodes) {
                if (node.nodeInputState.hovered) {
                    ctx.strokeRect(node.range[0] * pixelRatio,
                                get_node_top(node) * pixelRatio,
                                (node.range[1] - node.range[0]) * pixelRatio,
                                get_node_height(node) * pixelRatio);
                }
            }
        }
        // ctx.fillStyle = COLORS.background;




        // for (let node of timeline.nodes) {
        //     if (node.nodeInputState.selected) {
        //         ctx.fillRect(node.range[0] * pixelRatio,
        //                      layer_index_to_top(node.layer) * pixelRatio,
        //                      (node.range[1] - node.range[0]) * pixelRatio,
        //                      LAYER_HEIGHT * pixelRatio);
        //     }
        // }

        // let inputState = timeline.inputState;
        // ctx.fillStyle = 'blue';
        // ctx.fillRect(inputState.mousePos[0] * pixelRatio, inputState.mousePos[1] * pixelRatio, 10, 10);
        // ctx.strokeStyle = 'white';
        // ctx.beginPath();
        // ctx.moveTo(0,0);
        // ctx.lineTo(tempData.offset[0] * pixelRatio, tempData.offset[1] * pixelRatio);
        // ctx.closePath();
        // ctx.stroke();

        // ctx.strokeStyle = 'green';
        // ctx.beginPath();
        // ctx.moveTo(0,0);
        // ctx.lineTo(inputState.mouseOffset[0] * pixelRatio, inputState.mouseOffset[1] * pixelRatio);
        // ctx.closePath();
        // ctx.stroke();

        // ctx.strokeStyle = 'orange';
        // ctx.beginPath();
        // ctx.moveTo(0,0);
        // ctx.lineTo(inputState.mousePos[0] * pixelRatio, inputState.mousePos[1] * pixelRatio);
        // ctx.closePath();
        // ctx.stroke();
        

    }
    window.requestAnimationFrame(render_loop);
}

render_loop();