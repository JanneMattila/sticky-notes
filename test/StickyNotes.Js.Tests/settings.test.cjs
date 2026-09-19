const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const vm = require("node:vm");

const scriptsPath = path.resolve(__dirname, "../../src/StickyNotes/wwwroot/js/app");

const createApp = () => {
    const elements = new Map();
    const handlers = new Map();
    const calls = [];
    const window = new EventTarget();
    const createElement = () => {
        const element = new EventTarget();
        const classes = new Set();
        element.classList = {
            toggle(name, enabled) {
                if (enabled) classes.add(name);
                else classes.delete(name);
            },
            contains: name => classes.has(name)
        };
        element.appendChild = () => {};
        element.focus = () => {};
        return element;
    };
    const getElement = id => {
        if (!elements.has(id)) elements.set(id, createElement());
        return elements.get(id);
    };
    const context = vm.createContext({
        console: { log() {} },
        window,
        StickyNotes: { WwwRoot: "/" },
        document: { body: getElement("body"), getElementById: getElement, createElement },
        connection: {
            on: (event, handler) => handlers.set(event, handler),
            invoke: async (...args) => { calls.push(args); }
        },
        bootstrap: {
            Modal: class {
                constructor(element) { this.element = element; }
                show() { this.element.dispatchEvent(new Event("shown.bs.modal")); }
                hide() { this.element.dispatchEvent(new Event("hidden.bs.modal")); }
            }
        }
    });
    const run = source => vm.runInContext(source, context);
    for (const script of ["state.js", "settings.js", "notes.js", "interaction.js", "menu.js"]) {
        run(readFileSync(path.join(scriptsPath, script), "utf8"));
    }
    return { run, getElement, handlers, calls, window };
};

test("unlocking through settings restores Save in the shared Add Notes dialog", async () => {
    const { run, getElement, calls } = createApp();
    run(`
        _id = "test-board";
        applySettingsFromNote({ text: '{"readonly":true}' });
        editNoteMenu({ dataset: {} }, { text: "Existing note", link: "", color: "lightyellow" });
    `);
    assert.equal(getElement("updateNoteSaveButton").classList.contains("d-none"), true);
    getElement("noteModal").dispatchEvent(new Event("hidden.bs.modal"));
    run("showSettingsDialog()");
    assert.equal(getElement("settingsReadonly").checked, true);
    getElement("settingsReadonly").checked = false;
    getElement("settingsSaveButton").dispatchEvent(new Event("click"));
    await new Promise(resolve => setImmediate(resolve));
    run("showNoteDialog()");
    assert.equal(run("isReadonly()"), false);
    assert.equal(run("_isModalOpen"), true);
    assert.equal(getElement("updateNoteSaveButton").classList.contains("d-none"), false);
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], "UpdateNotes");
    assert.equal(calls[0][1], "test-board");
    assert.equal(calls[0][2][0].id, "__reserved__settings");
    assert.deepEqual(JSON.parse(calls[0][2][0].text), { readonly: false });
});

test("remote settings refresh existing editing controls on repeated toggles", () => {
    const { handlers, getElement } = createApp();
    const controlIds = [
        "menuAddNotes", "menuRemoveAllNotes", "updateNoteSaveButton",
        "noteEditMarkdownButton", "markdownViewEditButton", "noteMenuBringToFront",
        "noteMenuSendToBack", "noteMenuNoteSettings", "noteMenuDeleteNote",
        "updateNoteSettingsButton"
    ];
    for (const readonly of [true, false, true, false]) {
        handlers.get("UpdateNotes")([
            { id: "__reserved__settings", text: JSON.stringify({ readonly }) }
        ]);
        assert.equal(getElement("body").classList.contains("readonly"), readonly);
        for (const controlId of controlIds) {
            assert.equal(getElement(controlId).classList.contains("d-none"), readonly, controlId);
        }
    }
});

test("resetting settings restores editing controls", () => {
    const { run, getElement } = createApp();
    run(`applySettingsFromNote({ text: '{"readonly":true}' }); resetSettingsDefault();`);
    assert.equal(run("isReadonly()"), false);
    assert.equal(getElement("updateNoteSaveButton").classList.contains("d-none"), false);
    assert.equal(getElement("markdownViewEditButton").classList.contains("d-none"), false);
});

test("an open note editor preserves native context-menu events", () => {
    const { run, getElement, window } = createApp();
    let canvasMenuShown = false;
    getElement("menuModal").addEventListener("shown.bs.modal", () => { canvasMenuShown = true; });
    run(`editNoteMenu({ dataset: {} }, { text: "Copy this text", link: "", color: "lightyellow" });`);

    const event = new Event("contextmenu", { cancelable: true });
    window.dispatchEvent(event);

    assert.equal(event.defaultPrevented, false);
    assert.equal(canvasMenuShown, false);
    assert.equal(run("_isModalOpen"), true);
});

test("canvas context menus still open after closing the note editor", () => {
    const { run, getElement, window } = createApp();
    let canvasMenuShown = false;
    getElement("menuModal").addEventListener("shown.bs.modal", () => { canvasMenuShown = true; });
    run(`editNoteMenu({ dataset: {} }, { text: "Existing note", link: "", color: "lightyellow" });`);
    getElement("noteModal").dispatchEvent(new Event("hidden.bs.modal"));

    const event = new Event("contextmenu", { cancelable: true });
    window.dispatchEvent(event);

    assert.equal(event.defaultPrevented, true);
    assert.equal(canvasMenuShown, true);
    assert.equal(run("_isModalOpen"), true);
});

test("right-button dragging suppresses the context menu", () => {
    const { run, getElement, window } = createApp();
    let canvasMenuShown = false;
    getElement("menuModal").addEventListener("shown.bs.modal", () => { canvasMenuShown = true; });
    run(`
        beginContextMenuGesture({ button: 2, pointerType: "mouse", pointerId: 1, clientX: 100, clientY: 100 });
        updateContextMenuGesture({ pointerId: 1, clientX: 106, clientY: 100 });
    `);

    const event = new Event("contextmenu", { cancelable: true });
    Object.defineProperties(event, {
        clientX: { value: 106 },
        clientY: { value: 100 }
    });
    window.dispatchEvent(event);

    assert.equal(event.defaultPrevented, true);
    assert.equal(canvasMenuShown, false);
    assert.equal(run("_isModalOpen"), false);
});

test("tiny touch movement does not suppress the context menu", () => {
    const { run, getElement, window } = createApp();
    let canvasMenuShown = false;
    getElement("menuModal").addEventListener("shown.bs.modal", () => { canvasMenuShown = true; });
    run(`
        beginContextMenuGesture({ button: 0, pointerType: "touch", pointerId: 2, clientX: 100, clientY: 100 });
        updateContextMenuGesture({ pointerId: 2, clientX: 108, clientY: 100 });
    `);

    const event = new Event("contextmenu", { cancelable: true });
    Object.defineProperties(event, {
        clientX: { value: 108 },
        clientY: { value: 100 }
    });
    window.dispatchEvent(event);

    assert.equal(event.defaultPrevented, true);
    assert.equal(canvasMenuShown, true);
    assert.equal(run("_isModalOpen"), true);
});