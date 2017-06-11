type IVector2 = Float32Array;
type ILayer = number; // Integers only!

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
        foreground: '#ae85fc',
        selected_foreground: '#f92672'
    },
    box_select: '#f92672'
};

interface ITimeline {
    canvas: HTMLCanvasElement,
    context: CanvasRenderingContext2D,
    inputState: IInputState,
    inputMode: IInputMode,
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
    return layerIndex * LAYER_HEIGHT;
}

function layer_index_to_bottom(layerIndex: number) {
    return layerIndex * LAYER_HEIGHT + LAYER_HEIGHT;
}

function get_node_height(node: INode) {
    return LAYER_HEIGHT - NODE_HPADDING * 2;
}

function get_node_top(node: INode) {
    return layer_index_to_top(node.layer) + NODE_HPADDING;
}

function get_node_bottom(node: INode) {
    return layer_index_to_top(node.layer) + LAYER_HEIGHT - NODE_HPADDING;
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

function is_pointer_over_endpoint(pos: IVector2, timeline: ITimeline): [boolean, INode, number] {
    for (let node of timeline.nodes) {
        let endpoint = pos_over_node_endpoint(pos, node);
        if (endpoint !== 0) {
            return [true, node, endpoint];
        }
    }
    return [false, null, 0];
}

function is_pointer_over_something(pos: IVector2, timeline: ITimeline): [boolean, INode] {
    for (let node of timeline.nodes) {
        if (is_pos_in_node(pos, node)) {
            return [true, node];
        }
    }
    return [false, null];
}

function is_pointer_over_nothing(pos: IVector2, timeline: ITimeline): boolean {
    for (let node of timeline.nodes) {
        if (is_pos_in_node(pos, node)) {
            return false;
        }
    }
    return true;
}

function is_pointer_over_selected(pos: IVector2, timeline: ITimeline): [boolean, INode] {
    for (let node of timeline.nodes) {
        if (is_pos_in_node(pos, node)) {
            if (node.nodeInputState.selected) {
                return [true, node];
            }
        }
    }
    return [false, null];
}

function is_pointer_over_deselected(pos: IVector2, timeline: ITimeline): [boolean, INode] {
    for (let node of timeline.nodes) {
        if (is_pos_in_node(pos, node)) {
            if (!node.nodeInputState.selected) {
                return [true, node];
            }
        }
    }
    return [false, null];
}


// TODO(JULIAN): Consider implementing an alternative intersect function that only requires partial overlap
function box_intersect_node_strict(corner1: IVector2, corner2: IVector2, node: INode) {
    let minx = Math.min(corner1[0], corner2[0]);
    let maxx = Math.max(corner1[0], corner2[0]);
    let miny = Math.min(corner1[1], corner2[1]);
    let maxy = Math.max(corner1[1], corner2[1]);
    return is_val_in_range(node.range[0], minx, maxx) &&
        is_val_in_range(node.range[1], minx, maxx) &&
        is_val_in_range(get_node_top(node), miny, maxy) &&
        is_val_in_range(get_node_bottom(node), miny, maxy);
}

function handle_input(timeline: ITimeline) {
    let mode = timeline.inputMode.mode;
    let inputState = timeline.inputState;
    let pointerPos = inputState.pointerPos;

    // Oneshots
    if (mode === InputMode.Idle) {
        // UNHOVER ALL
        for (let node of timeline.nodes) {
            node.nodeInputState.hovered = false;
        }

        let [isOverSomething, overTarget] = is_pointer_over_something(pointerPos, timeline);

        // HOVER
        if (isOverSomething) {
            overTarget.nodeInputState.hovered = true;
            // console.log(`Hover ${overTarget.name}`)
        }

        if (!isOverSomething && !inputState.additiveModifier && inputState.pointerDown) {
            // DESELECT ALL
            console.log(`Deselect All`);
            deselect_all(timeline);
        }

        if (isOverSomething && !overTarget.nodeInputState.selected && !inputState.additiveModifier && inputState.pointerDown) {
            // SELECT UNIQUE (overTarget)
            console.log(`Unique Select ${overTarget.name}`);
            select_uniquely(overTarget, timeline);
        }
    }

    // Remove from selection while drag over and holding additiveModifier
    if (mode === InputMode.Idle) {
        let [isOverSelected, selectedTarget] = is_pointer_over_selected(pointerPos, timeline);
        if (inputState.pointerDown && isOverSelected && inputState.additiveModifier) {
            timeline.inputMode = {
                mode: InputMode.Remove
            };
        }
    } else if (mode === InputMode.Remove) {
        // Remove From Selection while hovering
        let [isOverSelected, selectedTarget] = is_pointer_over_selected(pointerPos, timeline);
        if (isOverSelected) {
            console.log(`Additive Deselect ${selectedTarget.name}`);
            selectedTarget.nodeInputState.selected = false;
        }

        // Exit Remove Mode
        if (!inputState.pointerDown) {
            timeline.inputMode = {
                mode: InputMode.Idle
            };
            return;
        }
    }

    // Move selection by dragging while over selected
    if (mode === InputMode.Idle) {
        let [isOverSelected, selectedTarget] = is_pointer_over_selected(pointerPos, timeline);
        if (isOverSelected && inputState.pointerDown && inputState.pointerJustMoved && !inputState.additiveModifier) {
            timeline.inputMode = {
                mode: InputMode.Move,
                pointerStartPos: make_vector2(pointerPos[0], pointerPos[1])
            };
        }
    } else if (timeline.inputMode.mode === InputMode.Move) {
        if (!inputState.pointerDown) {
            let pointerStartPos = timeline.inputMode.pointerStartPos;
            for (let node of timeline.nodes) {
                if (node.nodeInputState.selected) {
                    node.range[0] += pointerPos[0] - pointerStartPos[0];
                    node.range[1] += pointerPos[0] - pointerStartPos[0];
                    node.layer = y_to_layer(pointerPos[1] - pointerStartPos[1] + layer_index_to_top(node.layer));
                }
            }
            timeline.inputMode = { mode: InputMode.Idle };
            return;
        }
    }

    // Box select by dragging while over nothing
    if (mode === InputMode.Idle) {
        if (inputState.pointerDown && inputState.pointerJustMoved && is_pointer_over_nothing(pointerPos, timeline)) {
            timeline.inputMode = {
                mode: InputMode.BoxSelect,
                pointerStartPos: make_vector2(pointerPos[0], pointerPos[1])
            };
        }
    } else if (timeline.inputMode.mode === InputMode.BoxSelect) {
        let pointerStartPos = timeline.inputMode.pointerStartPos;
        if (inputState.pointerDown) {
            if (inputState.additiveModifier) {
                for (let node of timeline.nodes) {
                    node.nodeInputState.hovered = node.nodeInputState.selected || box_intersect_node_strict(pointerStartPos, pointerPos, node);
                }
            } else {
                for (let node of timeline.nodes) {
                    node.nodeInputState.hovered = box_intersect_node_strict(pointerStartPos, pointerPos, node);
                }
            }
        }

        if (!inputState.pointerDown) {
            if (inputState.additiveModifier) {
                for (let node of timeline.nodes) {
                    if (box_intersect_node_strict(pointerStartPos, pointerPos, node)) {
                        node.nodeInputState.selected = true;
                    }
                }
            } else {
                for (let node of timeline.nodes) {
                    node.nodeInputState.selected = box_intersect_node_strict(pointerStartPos, pointerPos, node);
                }
            }
            timeline.inputMode = { mode: InputMode.Idle };
            return;
        }
    }

    // Add to selection while drag over and holding additiveModifier
    if (mode === InputMode.Idle) {
        let [isOverDeselected, deselectedTarget] = is_pointer_over_deselected(pointerPos, timeline);
        if (inputState.pointerDown && isOverDeselected && inputState.additiveModifier) {
            timeline.inputMode = {
                mode: InputMode.Add
            };
        }
    } else if (mode === InputMode.Add) {
        // Add To Selection while hovering
        let [isOverDeselected, deselectedTarget] = is_pointer_over_deselected(pointerPos, timeline);
        if (isOverDeselected) {
            console.log(`Additive Select ${deselectedTarget.name}`);
            deselectedTarget.nodeInputState.selected = true;
        }

        // Exit Remove Mode
        if (!inputState.pointerDown) {
            timeline.inputMode = {
                mode: InputMode.Idle
            };
            return;
        }
    }

}

function input_event(timeline: ITimeline) {
    handle_input(timeline);
    timeline.inputState.pointerJustMoved = false;
    window.requestAnimationFrame(render_loop);
}

interface IInputState {
    pointerPos: IVector2
    pointerDown: boolean
    pointerJustMoved: boolean
    additiveModifier: boolean
    duplicateModifier: boolean
    createModifier: boolean
    deleteModifier: boolean
    endpointsModifier: boolean
}

const enum InputMode {
    Idle,
    Remove,
    Move,
    BoxSelect,
    Add,
    EndpointAdjust,
    Duplicate,
    Create
}

type IInputMode = { mode: InputMode.Idle } |
                  { mode: InputMode.Remove } | 
                  { mode: InputMode.Move, pointerStartPos: IVector2 } |
                  { mode: InputMode.BoxSelect, pointerStartPos: IVector2 } |
                  { mode: InputMode.Add } |
                  { mode: InputMode.EndpointAdjust, pointerStartPos: IVector2 } |
                  { mode: InputMode.Duplicate, pointerStartPos: IVector2 } |
                  { mode: InputMode.Create, pointerStartPos: IVector2 };

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
    window.requestAnimationFrame(render_loop);
}

function deselect_all(timeline: ITimeline) {
    for (let node of timeline.nodes) {
        node.nodeInputState.selected = false;
    }
}

function select_uniquely(node: INode, timeline: ITimeline) {
    deselect_all(timeline);
    select_node(node);
}

function select_node(node: INode) {
    node.nodeInputState.selected = true;
}

function y_to_layer(y: number) {
    return Math.round(y / LAYER_HEIGHT);
}

function make_timeline(canvas: HTMLCanvasElement): ITimeline {
    let ctx = canvas.getContext('2d');

    let timeline: ITimeline = {
        canvas: canvas,
        inputState: {
            pointerPos: make_vector2(0, 0),
            pointerDown: false,
            pointerJustMoved: false,
            additiveModifier: false,
            duplicateModifier: false,
            createModifier: false,
            deleteModifier: false,
            endpointsModifier: false
        },
        inputMode: { mode: InputMode.Idle },
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
        inputState.pointerDown = true;
        input_event(timeline);
    });

    canvas.addEventListener('mouseup', (event) => {
        inputState.pointerDown = false;
        input_event(timeline);
    });

    canvas.addEventListener('mousemove', (event) => {
        timeline.inputState.pointerPos[0] = event.clientX - canvas.offsetLeft;
        timeline.inputState.pointerPos[1] = event.clientY - canvas.offsetTop;
        timeline.inputState.pointerJustMoved = true;
        input_event(timeline);
    });

    document.addEventListener('keydown', (event) => {
        timeline.inputState.additiveModifier = event.shiftKey;
        timeline.inputState.createModifier = event.metaKey;
        if (((event.key === 'Backspace') || (event.key === 'Delete'))) {
            timeline.inputState.deleteModifier = true; // TODO(JULIAN): Deal with editing focus
        }
        timeline.inputState.duplicateModifier = event.altKey;
        timeline.inputState.endpointsModifier = event.ctrlKey;
        input_event(timeline);
    });

    document.addEventListener('keyup', (event) => {
        timeline.inputState.additiveModifier = event.shiftKey;
        timeline.inputState.createModifier = event.metaKey;
        if (((event.key === 'Backspace') || (event.key === 'Delete'))) {
            timeline.inputState.deleteModifier = false; // TODO(JULIAN): Deal with editing focus
        }
        timeline.inputState.duplicateModifier = event.altKey;
        timeline.inputState.endpointsModifier = event.ctrlKey;
        input_event(timeline);
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



function draw_node_background(timeline: ITimeline, node: INode) {
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
        ctx.fillStyle = COLORS.nodes.background;
        for (let node of timeline.nodes) {
            if (!node.nodeInputState.selected) {
                draw_node_background(timeline, node);
            }
        }



        if (timeline.inputMode.mode === InputMode.Move) {
            ctx.fillStyle = COLORS.nodes.selected;
            ctx.strokeStyle = COLORS.nodes.selected;
            let pointerStartPos = timeline.inputMode.pointerStartPos;
            let pointerPos = inputState.pointerPos;
            for (let node of timeline.nodes) {
                if (node.nodeInputState.selected) {
                    let x = ((pointerPos[0] - pointerStartPos[0]) + node.range[0]);
                    let y = ((pointerPos[1] - pointerStartPos[1]) + layer_index_to_top(node.layer));
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
            ctx.fillStyle = COLORS.nodes.selected_foreground;
            for (let node of timeline.nodes) {
                if (node.nodeInputState.selected) {
                    let x = ((pointerPos[0] - pointerStartPos[0]) + node.range[0]);
                    let y = ((pointerPos[1] - pointerStartPos[1]) + layer_index_to_top(node.layer));
                    let width = (node.range[1] - node.range[0]);
                    let height = get_node_height(node);
                    let constrainedY = layer_index_to_top(y_to_layer(y));
                    ctx.fillText(node.name, (x + width / 2) * pixelRatio,
                        (constrainedY + height / 2 + NODE_HPADDING) * pixelRatio, width * pixelRatio);
                }
            }
        } else {
            ctx.fillStyle = COLORS.nodes.selected;
            for (let node of timeline.nodes) {
                if (node.nodeInputState.selected) {
                    draw_node_background(timeline, node);
                }
            }
        }

        ctx.font = `${LAYER_HEIGHT * 0.5 * pixelRatio}px Sans-Serif`;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'center';
        ctx.fillStyle = COLORS.nodes.foreground;
        for (let node of timeline.nodes) {
            let width = node.range[1] - node.range[0];
            let height = get_node_height(node);
            ctx.fillText(node.name, (node.range[0] + width / 2) * pixelRatio, (get_node_top(node) + height / 2) * pixelRatio, width * pixelRatio);
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


        if (timeline.inputMode.mode === InputMode.BoxSelect) {
            ctx.strokeStyle = COLORS.box_select;
            let pointerStartPos = timeline.inputMode.pointerStartPos;
            let width = Math.abs(inputState.pointerPos[0] - pointerStartPos[0]);
            let height = Math.abs(inputState.pointerPos[1] - pointerStartPos[1]);
            ctx.strokeRect(Math.min(pointerStartPos[0], inputState.pointerPos[0]) * pixelRatio,
                Math.min(pointerStartPos[1], inputState.pointerPos[1]) * pixelRatio,
                width * pixelRatio,
                height * pixelRatio);
        }
    }
}

window.requestAnimationFrame(render_loop);