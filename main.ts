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
        cloned: '#e6db74',
        foreground: '#ae85fc',
        selected_foreground: '#f92672'
    },
    box_select: '#f92672'
};

type INodeList = IUnorderedList<INode>;

interface ITimeline {
    canvas: HTMLCanvasElement,
    context: CanvasRenderingContext2D,
    inputState: IInputState,
    undoState: IUndoState
    inputMode: IInputMode,
    realDims: IVector2,
    localDims: IVector2,
    pixelRatio: number,
    nodes: INodeList
}

interface INode {
    layer: number,
    range: IVector2,
    name: string,
    nodeInputState: any // TODO(JULIAN)
}

interface IUnorderedList<T> {
    items: T[],
    length: number
}

interface IInputState {
    pointerPos: IVector2
    pointerDown: boolean
    pointerJustMoved: boolean
    undoJustRequested: boolean
    redoJustRequested: boolean
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

function make_node_list (nodes: INode[]) : INodeList {
    return {
        items: nodes,
        length: nodes.length
    };
}

function add_to_unordered_list<T> (x: T, index: number, list : IUnorderedList<T>) {
    list.items[list.length] = list.items[index];
    list.length++;
    list.items[index] = x;
}

function remove_from_unordered_list<T> (index: number, list : IUnorderedList<T>) {
    list.length--;
    list.items[index] = list.items[list.length];
}

function index_in_unordered_list<T> (x: T, list : IUnorderedList<T>) : number {
    for (let i = 0; i < list.length; i++) {
        if (x === list.items[i]) {
            return i;
        }
    }
    return -1;
}

const enum CommandType {
    ChangeExistence,
    Update,
    UpdateSelection
}

interface ICommandGroup {
    name: string,
    commands: ICommand[]
}

const enum FieldType {
    IVector2,
    String,
    Number
};

type ICommand = {
    type: CommandType.UpdateSelection
    targetIndex: number
    targetList: INodeList
    to: boolean
} | {
    type: CommandType.Update
    targetIndex: number
    targetList: INodeList

    field: keyof INode
    fieldType: FieldType
    from: any
    to: any
} | {
    type: CommandType.ChangeExistence
    isCreate: boolean
    index: number
    targetList: INodeList

    name: string
    range: IVector2
    layer: number
    selected: boolean
};

interface IUndoState {
    history: ICommandGroup[]
    length: number
    index: number
}

const enum PerformMode {
    Perform,
    Undo,
    Redo
}



function perform_command_group(commandGroup: ICommandGroup, timeline: ITimeline, mode: PerformMode) {
    // console.log('------------------');
    // console.log(timeline.undoState.length);
    // console.log(timeline.undoState.index)
    // console.log(timeline.undoState.history.reduce((acc, val) => { acc.push(val.name); return acc; }, []));
    // console.log('>>');
    switch (mode) {
        case PerformMode.Perform:
            console.log(`Perform ${commandGroup.name} [${commandGroup.commands.length}]`);
            for (let command of commandGroup.commands) {
                perform_command(command, timeline, false);
            }
            timeline.undoState.index++;
            timeline.undoState.history[timeline.undoState.index] = commandGroup; // GC(JULIAN): Garbage generated here
            timeline.undoState.length = timeline.undoState.index + 1;
            break;
        case PerformMode.Undo:
            console.log(`Undo ${commandGroup.name} [${commandGroup.commands.length}]`);
            for (let i = commandGroup.commands.length - 1; i >= 0; i--) { // Have to undo commands in reverse
                let command = commandGroup.commands[i];
                perform_command(command, timeline, true);
            }
            timeline.undoState.index--;
            break;
        case PerformMode.Redo:
            console.log(`Redo ${commandGroup.name} [${commandGroup.commands.length}]`);
            for (let command of commandGroup.commands) {
                perform_command(command, timeline, false);
            }
            timeline.undoState.index++;
            break;
    }
    // console.log(timeline.undoState.length);
    // console.log(timeline.undoState.index)
    // console.log('------------------');
}

function update_node_field (node: INode, field: keyof INode, type: FieldType, value: any) {
    switch (type) {
        case FieldType.IVector2:
            node[field][0] = value[0];
            node[field][1] = value[1];
            break;
        default:
            node[field] = value;
            break;
    }
}

function perform_command(command: ICommand, timeline: ITimeline, reverse: boolean) {
    switch (command.type) {
        case CommandType.UpdateSelection: {
            let targetNode = command.targetList.items[command.targetIndex];
            if (!reverse) {
                targetNode.nodeInputState.selected = command.to;
            } else {
                targetNode.nodeInputState.selected = !command.to;
            }
        } break;
        case CommandType.Update: {
            let targetNode = command.targetList.items[command.targetIndex];
            if (!reverse) {
                update_node_field(targetNode, command.field, command.fieldType, command.to);
            } else {
                update_node_field(targetNode, command.field, command.fieldType, command.from);
            }
        } break;
        case CommandType.ChangeExistence: {
            let isCreate = (command.isCreate != reverse);
            if (isCreate) {
                add_to_unordered_list(make_node(command.layer, command.name, command.range[0], command.range[1], command.selected), command.index,command.targetList);
            } else {
                remove_from_unordered_list(command.index, command.targetList);
            }
        } break;
        // default: {
        //     console.error(`Cannot yet handle command type ${command.type}`);
        // } break;
    }   
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

function make_node(layer: number, name: string, start: number, end: number, selected: boolean): INode {
    return {
        name: name,
        range: make_vector2(start, end),
        layer: layer,
        nodeInputState: {
            selected: selected,
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
    for (let nodeIndex = 0; nodeIndex < timeline.nodes.length; nodeIndex++) {
        let node = timeline.nodes.items[nodeIndex];
        let endpoint = pos_over_node_endpoint(pos, node);
        if (endpoint !== 0) {
            return [true, node, endpoint];
        }
    }
    return [false, null, 0];
}

function is_pointer_over_something(pos: IVector2, timeline: ITimeline): [boolean, INode] {
    for (let nodeIndex = 0; nodeIndex < timeline.nodes.length; nodeIndex++) {
        let node = timeline.nodes.items[nodeIndex];
        if (is_pos_in_node(pos, node)) {
            return [true, node];
        }
    }
    return [false, null];
}

function is_pointer_over_nothing(pos: IVector2, timeline: ITimeline): boolean {
    for (let nodeIndex = 0; nodeIndex < timeline.nodes.length; nodeIndex++) {
        let node = timeline.nodes.items[nodeIndex];
        if (is_pos_in_node(pos, node)) {
            return false;
        }
    }
    return true;
}

function is_pointer_over_selected(pos: IVector2, timeline: ITimeline): [boolean, INode] {
    for (let nodeIndex = 0; nodeIndex < timeline.nodes.length; nodeIndex++) {
        let node = timeline.nodes.items[nodeIndex];
        if (is_pos_in_node(pos, node)) {
            if (node.nodeInputState.selected) {
                return [true, node];
            }
        }
    }
    return [false, null];
}

function is_pointer_over_deselected(pos: IVector2, timeline: ITimeline): [boolean, INode] {
    for (let nodeIndex = 0; nodeIndex < timeline.nodes.length; nodeIndex++) {
        let node = timeline.nodes.items[nodeIndex];
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
        if (inputState.undoJustRequested) {
            if (timeline.undoState.index >= 0 && timeline.undoState.length > 0) {
                // console.log(JSON.stringify(timeline.undoState));
                perform_command_group(timeline.undoState.history[timeline.undoState.index], timeline, PerformMode.Undo);
            } else {
                console.log(`can't UNDO`);
            }
            return;
        }
        if (inputState.redoJustRequested) {
            if (timeline.undoState.index + 1 < timeline.undoState.length) {
                perform_command_group(timeline.undoState.history[timeline.undoState.index+1], timeline, PerformMode.Redo);
            } else {
                console.log(`can't REDO`);
            }
            return;
        }

        // UNHOVER ALL
        for (let nodeIndex = 0; nodeIndex < timeline.nodes.length; nodeIndex++) {
            let node = timeline.nodes.items[nodeIndex];
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
            perform_new_command_group(`Deselect All`, ip_push_deselect_all_commands(timeline, []), timeline);
        }

        if (isOverSomething && !overTarget.nodeInputState.selected && !inputState.additiveModifier && inputState.pointerDown) {
            // SELECT UNIQUE (overTarget)
            perform_new_command_group(`Unique Select ${overTarget.name}`, ip_push_select_uniquely_commands(overTarget, timeline, []), timeline);
        }

        if (inputState.deleteModifier) {
            // SELECT UNIQUE (overTarget)
            perform_new_command_group(`Delete Selection`, ip_push_delete_selection_commands(timeline, []), timeline);
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
            perform_new_command_group(`Additive Deselect ${selectedTarget.name}`, ip_push_deselect_command(selectedTarget, timeline, []), timeline);
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
        if (isOverSelected && inputState.pointerDown && inputState.pointerJustMoved && !inputState.additiveModifier && !inputState.duplicateModifier) {
            timeline.inputMode = {
                mode: InputMode.Move,
                pointerStartPos: make_vector2(pointerPos[0], pointerPos[1])
            };
        }
    } else if (timeline.inputMode.mode === InputMode.Move) {
        if (!inputState.pointerDown) {
            let pointerStartPos = timeline.inputMode.pointerStartPos;
            perform_new_command_group(`Move Selected`, ip_push_move_selection_commands(pointerStartPos, pointerPos, timeline, []), timeline);
            timeline.inputMode = { mode: InputMode.Idle };
            return;
        }
    }

    // Clone selection by dragging while over selected
    if (mode === InputMode.Idle) {
        let [isOverSelected, selectedTarget] = is_pointer_over_selected(pointerPos, timeline);
        if (isOverSelected && inputState.pointerDown && inputState.pointerJustMoved && !inputState.additiveModifier && inputState.duplicateModifier) {
            timeline.inputMode = {
                mode: InputMode.Duplicate,
                pointerStartPos: make_vector2(pointerPos[0], pointerPos[1])
            };
        }
    } else if (timeline.inputMode.mode === InputMode.Duplicate) {
        if (!inputState.pointerDown) {
            let pointerStartPos = timeline.inputMode.pointerStartPos;
            let commands = ip_push_move_selection_commands(pointerStartPos, pointerPos, timeline,
                           ip_push_clone_selection_commands(pointerStartPos, pointerPos, timeline, []));
            perform_new_command_group(`Duplicate Selected`, commands, timeline);
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
                for (let nodeIndex = 0; nodeIndex < timeline.nodes.length; nodeIndex++) {
                    let node = timeline.nodes.items[nodeIndex];
                    node.nodeInputState.hovered = node.nodeInputState.selected || box_intersect_node_strict(pointerStartPos, pointerPos, node);
                }
            } else {
                for (let nodeIndex = 0; nodeIndex < timeline.nodes.length; nodeIndex++) {
                    let node = timeline.nodes.items[nodeIndex];
                    node.nodeInputState.hovered = box_intersect_node_strict(pointerStartPos, pointerPos, node);
                }
            }
        }

        if (!inputState.pointerDown) {
            let commands : ICommand[] = [];
            if (inputState.additiveModifier) {
                for (let nodeIndex = 0; nodeIndex < timeline.nodes.length; nodeIndex++) {
                    let node = timeline.nodes.items[nodeIndex];
                    if (box_intersect_node_strict(pointerStartPos, pointerPos, node)) {
                        ip_push_select_command(node, timeline, commands);
                    }
                }
                perform_new_command_group(`Additive Box Select`, commands, timeline);
            } else {
                for (let nodeIndex = 0; nodeIndex < timeline.nodes.length; nodeIndex++) {
                    let node = timeline.nodes.items[nodeIndex];
                    ip_push_change_select_command(node, box_intersect_node_strict(pointerStartPos, pointerPos, node), timeline, commands);
                }
                perform_new_command_group(`Unique Box Select`, commands, timeline);
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
            perform_new_command_group(`Additive Select ${deselectedTarget.name}`, ip_push_select_command(deselectedTarget, timeline, []), timeline);
        }

        // Exit Add Mode
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
    timeline.inputState.undoJustRequested = false;
    timeline.inputState.redoJustRequested = false;
    window.requestAnimationFrame(render_loop);
}

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

function ip_push_change_select_command (node: INode, to: boolean, timeline: ITimeline, commands: ICommand[]) : ICommand[] {
    if (node.nodeInputState.selected != to) {
        let command : ICommand = {
            type: CommandType.UpdateSelection,
            targetIndex: index_in_unordered_list(node, timeline.nodes),
            targetList: timeline.nodes,
            to: to
        };
        commands.push(command);
    }
    return commands;
}

function ip_push_select_command (node: INode, timeline: ITimeline, commands: ICommand[]) : ICommand[] {
    return ip_push_change_select_command(node, true, timeline, commands);
}

function ip_push_deselect_command (node: INode, timeline: ITimeline, commands: ICommand[]) : ICommand[] {
    return ip_push_change_select_command(node, false, timeline, commands);
}

function ip_push_deselect_all_commands (timeline: ITimeline, commands: ICommand[]) : ICommand[] {
    for (let nodeIndex = 0; nodeIndex < timeline.nodes.length; nodeIndex++) {
        let node = timeline.nodes.items[nodeIndex];
        ip_push_deselect_command(node, timeline, commands);
    }
    return commands;
}

function ip_push_select_uniquely_commands(node: INode, timeline: ITimeline, commands: ICommand[]) : ICommand[] {
    for (let nIndex = 0; nIndex < timeline.nodes.length; nIndex++) {
        let n = timeline.nodes.items[nIndex];
        if (n === node) {
            ip_push_select_command(node, timeline, commands);
        } else {
            ip_push_deselect_command(n, timeline, commands);
        }
    }
    return commands;
}

function ip_push_move_commands (pointerStartPos : IVector2, pointerEndPos : IVector2, node: INode, timeline: ITimeline, commands: ICommand[]) : ICommand[] {
    let sourceRange = make_vector2(node.range[0], node.range[1]);
    let destRange = make_vector2(node.range[0] + pointerEndPos[0] - pointerStartPos[0],
                                    node.range[1] + pointerEndPos[0] - pointerStartPos[0]);

    let sourceLayer = node.layer;
    let destLayer = y_to_layer(pointerEndPos[1] - pointerStartPos[1] + layer_index_to_top(node.layer));

    let rangeCommand : ICommand = {
        type: CommandType.Update,
        targetIndex: index_in_unordered_list(node, timeline.nodes),
        targetList: timeline.nodes,
        field: 'range',
        fieldType: FieldType.IVector2,
        from: sourceRange,
        to: destRange
    };
    commands.push(rangeCommand);

    if (sourceLayer != destLayer) {
        let layerCommand : ICommand = {
            type: CommandType.Update,
            targetIndex: index_in_unordered_list(node, timeline.nodes),
            targetList: timeline.nodes,
            field: 'layer',
            fieldType: FieldType.Number,
            from: sourceLayer,
            to: destLayer
        };
        commands.push(layerCommand);
    }
    return commands;
}

function ip_push_move_selection_commands (pointerStartPos : IVector2, pointerEndPos : IVector2, timeline : ITimeline, commands: ICommand[]) : ICommand[] {
    for (let nodeIndex = 0; nodeIndex < timeline.nodes.length; nodeIndex++) {
        let node = timeline.nodes.items[nodeIndex];
        if (node.nodeInputState.selected) {
            ip_push_move_commands(pointerStartPos, pointerEndPos, node, timeline, commands);
        }
    }
    return commands;
}

function ip_push_clone_command (node: INode, timeline: ITimeline, commands: ICommand[]) : ICommand[] {
    let command : ICommand = {
        type: CommandType.ChangeExistence,
        isCreate: true,
        index: timeline.nodes.length,
        targetList: timeline.nodes,
        name: node.name,
        layer: node.layer,
        range: make_vector2(node.range[0], node.range[1]),
        selected: node.nodeInputState.selected
    };
    commands.push(command);
    return commands;
}

function ip_push_delete_command (node: INode, timeline: ITimeline, commands: ICommand[]) : ICommand[] {
    let command : ICommand = {
        type: CommandType.ChangeExistence,
        isCreate: false,
        index: index_in_unordered_list(node, timeline.nodes),
        targetList: timeline.nodes,
        name: node.name,
        layer: node.layer,
        range: make_vector2(node.range[0], node.range[1]),
        selected: node.nodeInputState.selected
    };
    commands.push(command);
    return commands;
}

function ip_push_clone_selection_commands (pointerStartPos : IVector2, pointerEndPos : IVector2, timeline : ITimeline, commands: ICommand[]) : ICommand[] {
    for (let nodeIndex = 0; nodeIndex < timeline.nodes.length; nodeIndex++) {
        let node = timeline.nodes.items[nodeIndex];
        if (node.nodeInputState.selected) {
            ip_push_clone_command(node, timeline, commands);
        }
    }
    return commands;
}

function ip_push_delete_selection_commands (timeline : ITimeline, commands: ICommand[]) : ICommand[] {
    for (let nodeIndex = 0; nodeIndex < timeline.nodes.length; nodeIndex++) {
        let node = timeline.nodes.items[nodeIndex];
        if (node.nodeInputState.selected) {
            ip_push_delete_command(node, timeline, commands);
        }
    }
    return commands;
}

function perform_new_command_group (name : string, commands: ICommand[], timeline: ITimeline) {
    let commandGroup : ICommandGroup = {
        name: name,
        commands: commands
    }
    perform_command_group(commandGroup, timeline, PerformMode.Perform);
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
        undoState: {
            history: [],
            length: 0,
            index: -1
        },
        inputState: {
            pointerPos: make_vector2(0, 0),
            pointerDown: false,
            pointerJustMoved: false,
            additiveModifier: false,
            duplicateModifier: false,
            createModifier: false,
            deleteModifier: false,
            endpointsModifier: false,
            undoJustRequested: false,
            redoJustRequested: false
        },
        inputMode: { mode: InputMode.Idle },
        context: ctx,
        realDims: make_vector2(0, 0),
        localDims: make_vector2(0, 0),
        pixelRatio: window.devicePixelRatio,
        nodes: make_node_list([ make_node(0, 'Hello', 0, 200, false),
                                make_node(0, 'Foo', 300, 500, false),
                                make_node(1, 'Bar', 200, 600, false)])
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

        if (event.metaKey || event.ctrlKey) {
            if ((event.key === 'Z' && event.shiftKey) || event.key === 'y') {
                timeline.inputState.redoJustRequested = true;
                event.preventDefault();
            } else if (event.key === 'z') {
                timeline.inputState.undoJustRequested = true;
                event.preventDefault();
            }
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
        for (let nodeIndex = 0; nodeIndex < timeline.nodes.length; nodeIndex++) {
            let node = timeline.nodes.items[nodeIndex];
            if (!node.nodeInputState.selected) {
                draw_node_background(timeline, node);
            }
        }



        if (timeline.inputMode.mode === InputMode.Move) {
            ctx.fillStyle = COLORS.nodes.selected;
            ctx.strokeStyle = COLORS.nodes.selected;
            let pointerStartPos = timeline.inputMode.pointerStartPos;
            let pointerPos = inputState.pointerPos;
            for (let nodeIndex = 0; nodeIndex < timeline.nodes.length; nodeIndex++) {
                let node = timeline.nodes.items[nodeIndex];
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
            for (let nodeIndex = 0; nodeIndex < timeline.nodes.length; nodeIndex++) {
                let node = timeline.nodes.items[nodeIndex];
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
        } else if (timeline.inputMode.mode === InputMode.Duplicate) {
            ctx.fillStyle = COLORS.nodes.cloned;
            let pointerStartPos = timeline.inputMode.pointerStartPos;
            let pointerPos = inputState.pointerPos;
            for (let nodeIndex = 0; nodeIndex < timeline.nodes.length; nodeIndex++) {
                let node = timeline.nodes.items[nodeIndex];
                if (node.nodeInputState.selected) {
                    let x = ((pointerPos[0] - pointerStartPos[0]) + node.range[0]);
                    let y = ((pointerPos[1] - pointerStartPos[1]) + layer_index_to_top(node.layer));
                    let width = (node.range[1] - node.range[0]);
                    let height = get_node_height(node);
                    let constrainedY = layer_index_to_top(y_to_layer(y));
                    ctx.fillRect(x * pixelRatio, (constrainedY + NODE_HPADDING) * pixelRatio, width * pixelRatio, height * pixelRatio);
                }
            }

            ctx.fillStyle = COLORS.nodes.selected;
            for (let nodeIndex = 0; nodeIndex < timeline.nodes.length; nodeIndex++) {
                let node = timeline.nodes.items[nodeIndex];
                if (node.nodeInputState.selected) {
                    let width = (node.range[1] - node.range[0]);
                    let height = get_node_height(node);
                    ctx.fillRect(node.range[0] * pixelRatio, get_node_top(node) * pixelRatio,
                        width * pixelRatio,
                        height * pixelRatio);
                }
            }

            ctx.font = `${LAYER_HEIGHT * 0.5 * pixelRatio}px Sans-Serif`;
            ctx.textBaseline = 'middle';
            ctx.textAlign = 'center';
            ctx.fillStyle = COLORS.nodes.selected_foreground;
            for (let nodeIndex = 0; nodeIndex < timeline.nodes.length; nodeIndex++) {
                let node = timeline.nodes.items[nodeIndex];
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
            for (let nodeIndex = 0; nodeIndex < timeline.nodes.length; nodeIndex++) {
                let node = timeline.nodes.items[nodeIndex];
                if (node.nodeInputState.selected) {
                    draw_node_background(timeline, node);
                }
            }
        }

        ctx.font = `${LAYER_HEIGHT * 0.5 * pixelRatio}px Sans-Serif`;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'center';
        ctx.fillStyle = COLORS.nodes.foreground;
        for (let nodeIndex = 0; nodeIndex < timeline.nodes.length; nodeIndex++) {
            let node = timeline.nodes.items[nodeIndex];
            let width = node.range[1] - node.range[0];
            let height = get_node_height(node);
            ctx.fillText(node.name, (node.range[0] + width / 2) * pixelRatio, (get_node_top(node) + height / 2) * pixelRatio, width * pixelRatio);
        }

        ctx.strokeStyle = COLORS.nodes.hover;
        for (let nodeIndex = 0; nodeIndex < timeline.nodes.length; nodeIndex++) {
            let node = timeline.nodes.items[nodeIndex];
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