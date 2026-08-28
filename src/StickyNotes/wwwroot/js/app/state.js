// ---------------------------------------------------------------------------
// Shared application state
//
// Sticky Notes is loaded as a set of ordered classic <script> files. Top-level
// `let`/`const` declarations live in the shared global lexical scope, so every
// module below can read and write this state directly. Keeping all mutable
// state in one place makes the coupling between modules explicit.
// ---------------------------------------------------------------------------

console.log(`StickyNotes.WwwRoot: ${StickyNotes.WwwRoot}`);

let _notesElement = document.getElementById("notes");
let _initialNotesLoadingElement = document.getElementById("initialNotesLoadingIndicator");

let _id;
let _scale = 1;
let _originalScale = 1;
let _isMove = false;
let _isResize = false;
let _isModalOpen = false;
let _isErrorDialogOpen = false;
let _currentX = 100, _currentY = 100;
let _endX, _endY;
let _sourceElement = undefined;
let _selectedElement = undefined;
let _pointers = new Array();
let _pointerDiff = 0;
let _updateSend = new Date();
let _coordinateAdjustX = 0, _coordinateAdjustY = 0;
let _imported = false;
let _isInitialNotesLoadPending = true;
let _isRectSelect = false;
let _rectStartScreenX = 0, _rectStartScreenY = 0;
let _preSelectedNotes = new Set();
let _lastCanvasClickX = 100, _lastCanvasClickY = 100;
const _selectionRect = document.createElement('div');
_selectionRect.id = 'selectionRect';
document.body.appendChild(_selectionRect);

// Markdown document state (view/edit overlay + live collaboration).
let _mdDoc = null;
let _mdHistoryPushed = false;
let _mermaidInitialized = false;
let _mermaidTheme = "default";
let _markdownAutoOpenChecked = false;

// Board-level settings are persisted in a hidden "reserved" note. Reserved notes
// are stored/synced like any other note but are never rendered on the canvas.
const RESERVED_NOTE_PREFIX = "__reserved__";
const SETTINGS_NOTE_ID = "__reserved__settings";
let _settings = { readonly: false };
