import maquette = require("maquette");
type MProjector = maquette.Projector;
let h = maquette.h;

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
        selected_foreground: '#f92672',
        endpoints: 'black'
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
    nodes: INodeList,
    inspectors: MProjector[],
    inspectorFunctions: any // TODO(JULIAN)
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
    pointerJustDown: boolean
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
                  { mode: InputMode.EndpointAdjust, pointerStartPos: IVector2, endpointIndex: number } |
                  { mode: InputMode.Duplicate, pointerStartPos: IVector2 } |
                  { mode: InputMode.Create, pointerStartPos: IVector2, newName: string };

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

function get_node_height_for_layer(layer: number) {
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

function is_pos_in_timeline(pos: IVector2, timeline: ITimeline): boolean {
    return is_val_in_range(pos[0], 0, timeline.realDims[0]) &&
        is_val_in_range(pos[1], 0, timeline.realDims[1]);
}

function pos_over_node_endpoint(pos: IVector2, node: INode): number {
    if (is_val_in_range(pos[1], layer_index_to_top(node.layer), layer_index_to_bottom(node.layer))) {
        if (is_val_in_range(pos[0], node.range[0], node.range[0] + NODE_ENDPOINT_WIDTH)) {
            return 0;
        } else if (is_val_in_range(pos[0], node.range[1] - NODE_ENDPOINT_WIDTH, node.range[1])) {
            return 1;
        }
    }
    return -1;
}

function is_pointer_over_endpoint(pos: IVector2, timeline: ITimeline): [boolean, INode, number] {
    for (let nodeIndex = 0; nodeIndex < timeline.nodes.length; nodeIndex++) {
        let node = timeline.nodes.items[nodeIndex];
        let endpointIndex = pos_over_node_endpoint(pos, node);
        if (endpointIndex !== -1) {
            return [true, node, endpointIndex];
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

    let isPosInTimeline = is_pos_in_timeline(inputState.pointerPos, timeline);

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

        if (!isOverSomething && !inputState.additiveModifier && inputState.pointerJustDown && isPosInTimeline) {
            // DESELECT ALL
            perform_new_command_group(`Deselect All`, ip_push_deselect_all_commands(timeline, []), timeline);
        }

        if (isOverSomething && !overTarget.nodeInputState.selected && !inputState.additiveModifier && inputState.pointerJustDown && isPosInTimeline) {
            // SELECT UNIQUE (overTarget)
            perform_new_command_group(`Unique Select ${overTarget.name}`, ip_push_select_uniquely_commands(overTarget, timeline, []), timeline);
        }

        if (inputState.deleteModifier && isPosInTimeline && isPosInTimeline) {
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
            perform_new_command_group(`Additive Deselect ${selectedTarget.name}`, ip_push_deselect_command_with_index(index_in_unordered_list(selectedTarget, timeline.nodes), timeline.nodes, []), timeline);
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
        if (inputState.pointerJustDown && is_pointer_over_nothing(pointerPos, timeline) && !inputState.createModifier && isPosInTimeline) {
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
                        ip_push_select_command_with_index(nodeIndex, timeline.nodes, commands);
                    }
                }
                perform_new_command_group(`Additive Box Select`, commands, timeline);
            } else {
                for (let nodeIndex = 0; nodeIndex < timeline.nodes.length; nodeIndex++) {
                    let node = timeline.nodes.items[nodeIndex];
                    ip_push_change_select_command_with_index(nodeIndex, timeline.nodes, box_intersect_node_strict(pointerStartPos, pointerPos, node), commands);
                }
                perform_new_command_group(`Unique Box Select`, commands, timeline);
            }
            timeline.inputMode = { mode: InputMode.Idle };
            return;
        }
    }

    // Create by dragging while over nothing and holding createModifier
    if (mode === InputMode.Idle) {
        if (inputState.pointerJustDown && inputState.pointerJustMoved && is_pointer_over_nothing(pointerPos, timeline) && inputState.createModifier && isPosInTimeline) {
            timeline.inputMode = {
                mode: InputMode.Create,
                newName: 'New',
                pointerStartPos: make_vector2(pointerPos[0], pointerPos[1])
            };
        }
    } else if (timeline.inputMode.mode === InputMode.Create) {
        let pointerStartPos = timeline.inputMode.pointerStartPos;

        if (!inputState.pointerDown) {
            let commands : ICommand[] = [];
            perform_new_command_group(`Create New Node`, ip_push_create_command(pointerStartPos, pointerPos, timeline.inputMode.newName, timeline, []), timeline);
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
            perform_new_command_group(`Additive Select ${deselectedTarget.name}`, ip_push_select_command_with_index(index_in_unordered_list(deselectedTarget, timeline.nodes), timeline.nodes, []), timeline);
        }

        // Exit Add Mode
        if (!inputState.pointerDown) {
            timeline.inputMode = {
                mode: InputMode.Idle
            };
            return;
        }
    }

    if (mode === InputMode.Idle) {
        let [isOverEndpoint, targetNode, endpointIndex] = is_pointer_over_endpoint(pointerPos, timeline);
        if (inputState.endpointsModifier && inputState.pointerDown && inputState.pointerJustMoved && isOverEndpoint) {
            timeline.inputMode = {
                mode: InputMode.EndpointAdjust,
                pointerStartPos: make_vector2(pointerPos[0], pointerPos[1]),
                endpointIndex: endpointIndex
            };
        }
    } else if (timeline.inputMode.mode === InputMode.EndpointAdjust) {
        // Exit Endpoint Adjust Mode
        if (!inputState.pointerDown) {
            perform_new_command_group(`Endpoint Adjust`, ip_push_endpoint_adjust_selection_commands(timeline.inputMode.pointerStartPos, pointerPos, timeline.inputMode.endpointIndex, timeline, []), timeline);
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
    timeline.inputState.pointerJustDown = false;
    request_rerender(timeline);
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
    request_rerender(timeline);
}

function ip_push_change_select_command_with_index (nodeIndex: number, targetList: INodeList, to: boolean, commands: ICommand[]) : ICommand[] {
    let node = targetList.items[nodeIndex];
    if (node.nodeInputState.selected != to) {
        let command : ICommand = {
            type: CommandType.UpdateSelection,
            targetIndex: nodeIndex,
            targetList: targetList,
            to: to
        };
        commands.push(command);
    }
    return commands;
}

function ip_push_select_command_with_index (nodeIndex: number, targetList: INodeList, commands: ICommand[]) : ICommand[] {
    return ip_push_change_select_command_with_index(nodeIndex, targetList, true, commands);
}

function ip_push_deselect_command_with_index (nodeIndex: number, targetList: INodeList, commands: ICommand[]) : ICommand[] {
    return ip_push_change_select_command_with_index(nodeIndex, targetList, false, commands);
}

function ip_push_deselect_all_commands (timeline: ITimeline, commands: ICommand[]) : ICommand[] {
    for (let nodeIndex = 0; nodeIndex < timeline.nodes.length; nodeIndex++) {
        let node = timeline.nodes.items[nodeIndex];
        ip_push_deselect_command_with_index(nodeIndex, timeline.nodes, commands);
    }
    return commands;
}

function ip_push_select_uniquely_commands(node: INode, timeline: ITimeline, commands: ICommand[]) : ICommand[] {
    for (let nIndex = 0; nIndex < timeline.nodes.length; nIndex++) {
        let n = timeline.nodes.items[nIndex];
        ip_push_change_select_command_with_index(nIndex, timeline.nodes, (n === node), commands);
    }
    return commands;
}

function ip_push_change_layer_command_with_index (sourceLayer: number, destLayer: number, nodeIndex: number, targetList: INodeList, commands: ICommand[]) : ICommand[] {
    if (sourceLayer != destLayer) {
        let layerCommand : ICommand = {
            type: CommandType.Update,
            targetIndex: nodeIndex,
            targetList: targetList,
            field: 'layer',
            fieldType: FieldType.Number,
            from: sourceLayer,
            to: destLayer
        };
        commands.push(layerCommand);
    }
    return commands;
}

function ip_push_change_duration_command_with_index (sourceDuration: number, nodeIndex: number, targetList: INodeList, commands: ICommand[]) : ICommand[] {
    let node = targetList.items[nodeIndex];
    let sourceRange = make_vector2(node.range[0], node.range[1]);
    let leftX = node.range[0];
    let rightX = node.range[0] + sourceDuration;
    let destRange = make_vector2(Math.min(leftX, rightX), Math.max(leftX, rightX));

    let rangeCommand : ICommand = {
        type: CommandType.Update,
        targetIndex: nodeIndex,
        targetList: targetList,
        field: 'range',
        fieldType: FieldType.IVector2,
        from: sourceRange,
        to: destRange
    };
    commands.push(rangeCommand);
    return commands;
}

function ip_push_change_range_index_command_with_index (rangeIndex: 0|1, destValue: number, nodeIndex: number, targetList: INodeList, commands: ICommand[]) : ICommand[] {
    let node = targetList.items[nodeIndex];
    let sourceRange = make_vector2(node.range[0], node.range[1]);
    let destRange = make_vector2(sourceRange[0], sourceRange[1]);
    destRange[rangeIndex] = destValue;

    let rangeCommand : ICommand = {
        type: CommandType.Update,
        targetIndex: nodeIndex,
        targetList: targetList,
        field: 'range',
        fieldType: FieldType.IVector2,
        from: sourceRange,
        to: destRange
    };
    commands.push(rangeCommand);
    return commands;
}

function ip_push_change_name_command_with_index (sourceName: string, destName: string, nodeIndex: number, targetList: INodeList, commands: ICommand[]) : ICommand[] {
    if (sourceName != destName) {
        let nameCommand : ICommand = {
            type: CommandType.Update,
            targetIndex: nodeIndex,
            targetList: targetList,
            field: 'name',
            fieldType: FieldType.String,
            from: sourceName,
            to: destName
        };
        commands.push(nameCommand);
    }
    return commands;
}

function ip_push_change_selection_name_commands (destName: string, timeline : ITimeline, commands: ICommand[]) : ICommand[] {
    for (let nodeIndex = 0; nodeIndex < timeline.nodes.length; nodeIndex++) {
        let node = timeline.nodes.items[nodeIndex];
        if (node.nodeInputState.selected) {
            ip_push_change_name_command_with_index(node.name, destName, nodeIndex, timeline.nodes, commands);
        }
    }
    return commands;
}

function ip_push_change_selection_layer_commands (destLayer: number, timeline : ITimeline, commands: ICommand[]) : ICommand[] {
    for (let nodeIndex = 0; nodeIndex < timeline.nodes.length; nodeIndex++) {
        let node = timeline.nodes.items[nodeIndex];
        if (node.nodeInputState.selected) {
            ip_push_change_layer_command_with_index(node.layer, destLayer, nodeIndex, timeline.nodes, commands);
        }
    }
    return commands;
}

function ip_push_change_selection_duration_commands (destDuration: number, timeline : ITimeline, commands: ICommand[]) : ICommand[] {
    for (let nodeIndex = 0; nodeIndex < timeline.nodes.length; nodeIndex++) {
        let node = timeline.nodes.items[nodeIndex];
        if (node.nodeInputState.selected) {
            ip_push_change_duration_command_with_index(destDuration, nodeIndex, timeline.nodes, commands);
        }
    }
    return commands;
}

function ip_push_change_selection_range_index_commands (rangeIndex: 0|1, destValue: number, timeline : ITimeline, commands: ICommand[]) : ICommand[] {
    for (let nodeIndex = 0; nodeIndex < timeline.nodes.length; nodeIndex++) {
        let node = timeline.nodes.items[nodeIndex];
        if (node.nodeInputState.selected) {
            ip_push_change_range_index_command_with_index(rangeIndex, destValue, nodeIndex, timeline.nodes, commands);
        }
    }
    return commands;
}

function ip_push_move_commands_with_index (pointerStartPos : IVector2, pointerEndPos : IVector2, nodeIndex: number, targetList: INodeList, commands: ICommand[]) : ICommand[] {
    let node = targetList.items[nodeIndex];
    let sourceRange = make_vector2(node.range[0], node.range[1]);
    let destRange = make_vector2(node.range[0] + pointerEndPos[0] - pointerStartPos[0],
                                    node.range[1] + pointerEndPos[0] - pointerStartPos[0]);

    let sourceLayer = node.layer;
    let destLayer = y_to_layer(pointerEndPos[1] - pointerStartPos[1] + layer_index_to_top(node.layer));

    let rangeCommand : ICommand = {
        type: CommandType.Update,
        targetIndex: nodeIndex,
        targetList: targetList,
        field: 'range',
        fieldType: FieldType.IVector2,
        from: sourceRange,
        to: destRange
    };
    commands.push(rangeCommand);

    ip_push_change_layer_command_with_index(sourceLayer, destLayer, nodeIndex, targetList, commands)
    return commands;
}

function ip_push_move_selection_commands (pointerStartPos : IVector2, pointerEndPos : IVector2, timeline : ITimeline, commands: ICommand[]) : ICommand[] {
    for (let nodeIndex = 0; nodeIndex < timeline.nodes.length; nodeIndex++) {
        let node = timeline.nodes.items[nodeIndex];
        if (node.nodeInputState.selected) {
            ip_push_move_commands_with_index(pointerStartPos, pointerEndPos, nodeIndex, timeline.nodes, commands);
        }
    }
    return commands;
}

function ip_push_endpoint_adjust_command_with_index (pointerStartPos : IVector2, pointerEndPos : IVector2, endpointIndex: number, nodeIndex: number, targetList: INodeList, commands: ICommand[]) : ICommand[] {
    let node = targetList.items[nodeIndex];
    let sourceRange = make_vector2(node.range[0], node.range[1]);
    let destRange = make_vector2(node.range[0], node.range[1]);
    destRange[endpointIndex] += pointerEndPos[0] - pointerStartPos[0];
    if (destRange[0] > destRange[1]) {
        let t = destRange[0];
        destRange[0] = destRange[1];
        destRange[1] = t;
    }

    let rangeCommand : ICommand = {
        type: CommandType.Update,
        targetIndex: nodeIndex,
        targetList: targetList,
        field: 'range',
        fieldType: FieldType.IVector2,
        from: sourceRange,
        to: destRange
    };
    commands.push(rangeCommand);
    return commands;
}

function ip_push_endpoint_adjust_selection_commands (pointerStartPos : IVector2, pointerEndPos : IVector2, endpointIndex: number, timeline : ITimeline, commands: ICommand[]) : ICommand[] {
    for (let nodeIndex = 0; nodeIndex < timeline.nodes.length; nodeIndex++) {
        let node = timeline.nodes.items[nodeIndex];
        if (node.nodeInputState.selected) {
            ip_push_endpoint_adjust_command_with_index(pointerStartPos, pointerEndPos, endpointIndex, nodeIndex, timeline.nodes, commands);
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

function ip_push_create_command (pointerStartPos : IVector2, pointerEndPos : IVector2, name: string, timeline: ITimeline, commands: ICommand[]) : ICommand[] {
    let command : ICommand = {
        type: CommandType.ChangeExistence,
        isCreate: true,
        index: timeline.nodes.length,
        targetList: timeline.nodes,
        name: name,
        layer: y_to_layer(pointerStartPos[1]),
        range: make_vector2(Math.min(pointerStartPos[0], pointerEndPos[0]), Math.max(pointerStartPos[0], pointerEndPos[0])),
        selected: true
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

function ip_push_delete_command_with_index (nodeIndex: number, targetList: INodeList, commands: ICommand[]) : ICommand[] {
    let node = targetList.items[nodeIndex];
    let command : ICommand = {
        type: CommandType.ChangeExistence,
        isCreate: false,
        index: nodeIndex,
        targetList: targetList,
        name: node.name,
        layer: node.layer,
        range: make_vector2(node.range[0], node.range[1]),
        selected: node.nodeInputState.selected
    };
    commands.push(command);
    return commands;
}

function ip_push_delete_selection_commands (timeline : ITimeline, commands: ICommand[]) : ICommand[] {
    // This needs to be in reverse so that in-progress deletes preserve the indicies of yet-to-be-deleted items
    for (let nodeIndex = timeline.nodes.length - 1; nodeIndex >= 0; nodeIndex--) {
        let node = timeline.nodes.items[nodeIndex];
        if (node.nodeInputState.selected) {
            ip_push_delete_command_with_index (nodeIndex, timeline.nodes, commands);
        }
    }
    return commands;
}

function perform_new_command_group (name : string, commands: ICommand[], timeline: ITimeline) {
    if (commands.length > 0) {
        let commandGroup : ICommandGroup = {
            name: name,
            commands: commands
        }
        perform_command_group(commandGroup, timeline, PerformMode.Perform);
    }
}

function select_node(node: INode) {
    node.nodeInputState.selected = true;
}

function y_to_layer(y: number) {
    return Math.floor(y / LAYER_HEIGHT);
}

function attach_inspector_to_timeline (inspectorElem: Element, timeline: ITimeline) {
    let inspector = maquette.createProjector();
    inspector.append(inspectorElem, () => { return render_inspector(timeline); });
    timeline.inspectors.push(inspector);
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
            pointerJustDown: false,
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
        nodes: make_node_list([ make_node(0, 'Hello', 0, 200, true),
                                make_node(0, 'Foo', 300, 500, false),
                                make_node(1, 'Bar', 200, 600, false)]),
        inspectors: [],
        inspectorFunctions: {}
    };

    timeline.inspectorFunctions.edit_layer = edit_layer_function(timeline);
    timeline.inspectorFunctions.edit_duration = edit_duration_function(timeline);
    timeline.inspectorFunctions.edit_start = edit_start_function(timeline);
    timeline.inspectorFunctions.edit_end = edit_end_function(timeline);
    timeline.inspectorFunctions.edit_name = edit_name_function(timeline);

    resize_timeline(timeline);

    let inputState = timeline.inputState;

    window.addEventListener('mousedown', (event) => {
        inputState.pointerDown = true;
        inputState.pointerJustDown = true;
        input_event(timeline);
        if (is_pos_in_timeline(inputState.pointerPos, timeline)) {
            event.preventDefault();
        }
    });

    window.addEventListener('mouseup', (event) => {
        inputState.pointerDown = false;
        input_event(timeline);
        if (is_pos_in_timeline(inputState.pointerPos, timeline)) {
            event.preventDefault();
        }
    });

    window.addEventListener('mousemove', (event) => {
        timeline.inputState.duplicateModifier = event.altKey;
        timeline.inputState.endpointsModifier = event.ctrlKey;
        timeline.inputState.additiveModifier = event.shiftKey;
        timeline.inputState.createModifier = event.metaKey;

        timeline.inputState.pointerPos[0] = event.pageX - canvas.offsetLeft;
        timeline.inputState.pointerPos[1] = event.pageY - canvas.offsetTop;
        timeline.inputState.pointerJustMoved = true;
        input_event(timeline);
        if (is_pos_in_timeline(inputState.pointerPos, timeline)) {
            event.preventDefault();
        }
    });

    canvas.addEventListener('contextmenu', (event) => {
        if (is_pos_in_timeline(inputState.pointerPos, timeline)) {
            event.preventDefault();
        }
    });

    document.addEventListener('keydown', (event) => {
        timeline.inputState.duplicateModifier = event.altKey;
        timeline.inputState.endpointsModifier = event.ctrlKey;
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




function draw_node_background(timeline: ITimeline, node: INode) {
    let pixelRatio = timeline.pixelRatio;
    let ctx = timeline.context;
    ctx.fillRect(node.range[0] * pixelRatio,
        (layer_index_to_top(node.layer) + NODE_HPADDING) * pixelRatio,
        (node.range[1] - node.range[0]) * pixelRatio,
        get_node_height(node) * pixelRatio);
}

function render_adjusted_endpoints (ctx: CanvasRenderingContext2D, timeline: ITimeline, pixelRatio: number, pointerStartPos : IVector2, pointerEndPos: IVector2, endpointIndex: number) {
    let pointerDiff = (pointerEndPos[0] - pointerStartPos[0]);
    for (let nodeIndex = 0; nodeIndex < timeline.nodes.length; nodeIndex++) {
        let node = timeline.nodes.items[nodeIndex];
        if (node.nodeInputState.selected) {
            let leftX = node.range[0] + (endpointIndex === 0? pointerDiff : 0);
            let rightX = node.range[1] + (endpointIndex === 1? pointerDiff : 0);
            let x = Math.min(leftX, rightX);
            let width = Math.abs(rightX - leftX);
            let height = get_node_height(node);
            render_endpoints(ctx, x, get_node_top(node), width, height, pixelRatio);
        }
    }
    for (let nodeIndex = 0; nodeIndex < timeline.nodes.length; nodeIndex++) {
        let node = timeline.nodes.items[nodeIndex];
        if (!node.nodeInputState.selected) {
            render_endpoints(ctx, node.range[0], get_node_top(node), node.range[1] - node.range[0], get_node_height(node), pixelRatio);
        }
    }
}

function render_standard_endpoints (ctx: CanvasRenderingContext2D, timeline: ITimeline, pixelRatio: number) {
    for (let nodeIndex = 0; nodeIndex < timeline.nodes.length; nodeIndex++) {
        let node = timeline.nodes.items[nodeIndex];
        render_endpoints(ctx, node.range[0], get_node_top(node), node.range[1] - node.range[0], get_node_height(node), pixelRatio);
    }
}

function render_endpoints (ctx: CanvasRenderingContext2D, x: number, y: number, nodeWidth: number, nodeHeight: number, pixelRatio: number) {
    ctx.beginPath();
    ctx.moveTo(x * pixelRatio, y * pixelRatio);
    ctx.lineTo(x * pixelRatio, (y+nodeHeight) * pixelRatio);
    ctx.lineTo((x + NODE_ENDPOINT_WIDTH) * pixelRatio, (y + nodeHeight/2) * pixelRatio);
    ctx.lineTo(x * pixelRatio, y * pixelRatio);
    
    ctx.moveTo((x+nodeWidth) * pixelRatio, y * pixelRatio);
    ctx.lineTo((x+nodeWidth) * pixelRatio, (y+nodeHeight) * pixelRatio);
    ctx.lineTo((x+nodeWidth - NODE_ENDPOINT_WIDTH) * pixelRatio, (y + nodeHeight/2) * pixelRatio);
    ctx.lineTo((x+nodeWidth) * pixelRatio, y * pixelRatio);
    ctx.closePath();
    ctx.fill();
}

function render_loop(timeline : ITimeline) {
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
    } else if (timeline.inputMode.mode === InputMode.EndpointAdjust) {
        ctx.fillStyle = COLORS.nodes.cloned;
        let pointerStartPos = timeline.inputMode.pointerStartPos;
        let endpointIndex = timeline.inputMode.endpointIndex;
        let pointerPos = inputState.pointerPos;
        for (let nodeIndex = 0; nodeIndex < timeline.nodes.length; nodeIndex++) {
            let node = timeline.nodes.items[nodeIndex];
            if (node.nodeInputState.selected) {
                let pointerDiff = (pointerPos[0] - pointerStartPos[0]);
                let leftX = node.range[0] + (endpointIndex === 0? pointerDiff : 0);
                let rightX = node.range[1] + (endpointIndex === 1? pointerDiff : 0);
                let x = Math.min(leftX, rightX);
                let width = Math.abs(rightX - leftX);
                let height = get_node_height(node);
                ctx.fillRect(x * pixelRatio, get_node_top(node) * pixelRatio, width * pixelRatio, height * pixelRatio);
            }
        }

        ctx.fillStyle = COLORS.nodes.selected;
        for (let nodeIndex = 0; nodeIndex < timeline.nodes.length; nodeIndex++) {
            let node = timeline.nodes.items[nodeIndex];
            if (node.nodeInputState.selected) {
                let width = (node.range[1] - node.range[0]);
                let height = get_node_height(node);
                ctx.strokeRect(node.range[0] * pixelRatio, get_node_top(node) * pixelRatio,
                    width * pixelRatio,
                    height * pixelRatio);
            }
        }

        ctx.fillStyle = COLORS.nodes.endpoints;
        render_adjusted_endpoints(ctx, timeline, pixelRatio, pointerStartPos, pointerPos, endpointIndex);

        ctx.font = `${LAYER_HEIGHT * 0.5 * pixelRatio}px Sans-Serif`;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'center';
        ctx.fillStyle = COLORS.nodes.selected_foreground;
        for (let nodeIndex = 0; nodeIndex < timeline.nodes.length; nodeIndex++) {
            let node = timeline.nodes.items[nodeIndex];
            if (node.nodeInputState.selected) {
                let pointerDiff = (pointerPos[0] - pointerStartPos[0]);
                let leftX = node.range[0] + (endpointIndex === 0? pointerDiff : 0);
                let rightX = node.range[1] + (endpointIndex === 1? pointerDiff : 0);
                let x = Math.min(leftX, rightX);
                let width = Math.abs(rightX - leftX);
                let height = get_node_height(node);
                ctx.fillText(node.name, (x + width / 2) * pixelRatio,
                    (get_node_top(node) + height / 2) * pixelRatio, width * pixelRatio);
            }
        }
    } else if (timeline.inputMode.mode === InputMode.Create) {
        ctx.fillStyle = COLORS.nodes.cloned;
        let pointerStartPos = timeline.inputMode.pointerStartPos;
        let pointerPos = inputState.pointerPos;
        
        let layer = y_to_layer(pointerStartPos[1]);
        let leftX = Math.min(pointerStartPos[0], pointerPos[0]);
        let rightX = Math.max(pointerStartPos[0], pointerPos[0]);

        ctx.fillRect(leftX * pixelRatio, (layer_index_to_top(layer) + NODE_HPADDING) * pixelRatio, (rightX - leftX) * pixelRatio, get_node_height_for_layer(layer) * pixelRatio);

    } else {
        ctx.fillStyle = COLORS.nodes.selected;
        for (let nodeIndex = 0; nodeIndex < timeline.nodes.length; nodeIndex++) {
            let node = timeline.nodes.items[nodeIndex];
            if (node.nodeInputState.selected) {
                draw_node_background(timeline, node);
            }
        }

        if (timeline.inputState.endpointsModifier) {
            ctx.fillStyle = COLORS.nodes.endpoints;
            render_standard_endpoints(ctx, timeline, pixelRatio);
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

function request_rerender (timeline : ITimeline) {
    for (let inspector of timeline.inspectors) {
        inspector.scheduleRender();
    }
    window.requestAnimationFrame(() => { render_loop(timeline) });
}

function edit_layer_function (timeline) {
    return (event : Event) => {
        let layer = parseInt((<HTMLInputElement>event.target).value) || 0;
        perform_new_command_group(`Edit Layer to ${layer}`, ip_push_change_selection_layer_commands(layer, timeline, []), timeline);
    }
}

function edit_name_function (timeline) {
    return (event : Event) => {
        let name = (<HTMLInputElement>event.target).value || '';
        perform_new_command_group(`Edit Name to ${name}`, ip_push_change_selection_name_commands(name, timeline, []), timeline);
    }
}

function edit_duration_function (timeline) {
    return (event : Event) => {
        let duration = parseInt((<HTMLInputElement>event.target).value) || 0;
        if (Math.abs(duration) < 1) {
            duration = 1;
        }
        perform_new_command_group(`Edit Duration to ${duration}`, ip_push_change_selection_duration_commands(duration, timeline, []), timeline);
    }
}

function edit_start_function (timeline) {
    return (event : Event) => {
        let start = parseInt((<HTMLInputElement>event.target).value) || 0;
        perform_new_command_group(`Edit Start to ${start}`, ip_push_change_selection_range_index_commands(0, start, timeline, []), timeline);
    }
}

function edit_end_function (timeline) {
    return (event : Event) => {
        let end = parseInt((<HTMLInputElement>event.target).value) || 0;
        perform_new_command_group(`Edit End to ${end}`, ip_push_change_selection_range_index_commands(1, end, timeline, []), timeline);
    }
}

function h_number_scrubber (name: string, data: NumericData, edit_fn) {
    let value = (data.max + data.min)/2;
    let extents = data.max - value;
    return h('div.number-scrubber', {key: name}, [
        h('label', [name, ":"]),
        h('input', { value: `${value}`, onchange: edit_fn }),
        h('span.extents', ['±', extents])
    ]);
}

interface NumericData {
    min: number,
    max: number
}

function update_numeric_data (data: NumericData, value: number) {
    data.min = Number.isNaN(data.min)? value : Math.min(value, data.min);
    data.max = Number.isNaN(data.max)? value : Math.max(value, data.max);
}

function render_inspector (timeline: ITimeline) : maquette.VNode {
    let totalNodes = timeline.nodes.length;
    let selectedNodes = 0;
    // let rangeAverage = make_vector2(0,0);
    let startData : NumericData = {min: NaN, max: NaN};
    let endData : NumericData = {min: NaN, max: NaN};
    let layerData : NumericData = {min: NaN, max: NaN};
    let durationData : NumericData = {min: NaN, max: NaN};

    let name = '';
    let pointerPos = timeline.inputState.pointerPos;
    for (let nodeIndex = 0; nodeIndex < timeline.nodes.length; nodeIndex++) {
        let node = timeline.nodes.items[nodeIndex];
        if (node.nodeInputState.selected) {
            if (timeline.inputMode.mode === InputMode.Move) {
                let pointerStartPos = timeline.inputMode.pointerStartPos;
                let x = ((pointerPos[0] - pointerStartPos[0]) + node.range[0]);
                let y = ((pointerPos[1] - pointerStartPos[1]) + layer_index_to_top(node.layer));
                let width = (node.range[1] - node.range[0]);
                let height = get_node_height(node);
                let constrainedY = layer_index_to_top(y_to_layer(y));
                update_numeric_data(startData, x);
                update_numeric_data(endData, x + width);
                update_numeric_data(layerData, y_to_layer(y));
            } else {
                update_numeric_data(startData, node.range[0]);
                update_numeric_data(endData, node.range[1]);
                update_numeric_data(layerData, node.layer);
            }
            update_numeric_data(durationData, node.range[1] - node.range[0]);
            name = node.name;
            selectedNodes++;
        } 
    }

    let edit_layer = timeline.inspectorFunctions.edit_layer;
    let edit_name = timeline.inspectorFunctions.edit_name;
    let edit_duration = timeline.inspectorFunctions.edit_duration;
    let edit_start = timeline.inspectorFunctions.edit_start;
    let edit_end = timeline.inspectorFunctions.edit_end;

    return h('div', [h('p', ['Total Nodes: ', totalNodes]),
                     h('p', ['Selected Nodes: ', selectedNodes]),
                     h('input', { value: `${name}`, onchange: edit_name, /*oninput: edit_name*/ }),
                     selectedNodes > 0? [h_number_scrubber('Layer', layerData, edit_layer),
                     h_number_scrubber('Start', startData, edit_start),
                     h_number_scrubber('End', endData, edit_end),
                     h_number_scrubber('Duration', durationData, edit_duration)]: [],
                     ]);
}

function init () {
    let timelineElems: HTMLCollectionOf<Element> = document.getElementsByClassName('js-timeline');
    let timelines: ITimeline[] = [];
    for (let i = 0; i < timelineElems.length; i++) {
        let timelineElem = timelineElems[i];

        let timeline = make_timeline(<HTMLCanvasElement>timelineElem);

        let inspectorElems = document.getElementsByClassName('js-timeline-inspector');
        for (let i = 0; i < inspectorElems.length; i++) {
            attach_inspector_to_timeline(inspectorElems[i], timeline);
        }
        timelines.push(timeline);
    }

    window.addEventListener('resize', () => {
        for (let timeline of timelines) {
            resize_timeline(timeline);
        }
    });

    // requirejs(["helper/util"], function(util) {
    //     //This function is called when scripts/helper/util.js is loaded.
    //     //If util.js calls define(), then this function is not fired until
    //     //util's dependencies have loaded, and the util argument will hold
    //     //the module value for "helper/util".
    // });

    for (let timeline of timelines) {
        request_rerender(timeline);
    }
}

init();