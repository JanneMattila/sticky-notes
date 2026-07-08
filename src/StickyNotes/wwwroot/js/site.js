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

const showErrorDialog = () => {
    if (_isErrorDialogOpen) return;

    _isErrorDialogOpen = true;
    const modalElement = document.getElementById("errorModal");
    const modal = new bootstrap.Modal(modalElement);
    modal.show();
}

const setInitialNotesLoadingVisible = visible => {
    if (_initialNotesLoadingElement === undefined || _initialNotesLoadingElement == null) {
        return;
    }

    if (visible) {
        _initialNotesLoadingElement.classList.add("visible");
    }
    else {
        _initialNotesLoadingElement.classList.remove("visible");
    }
}

const generateId = () => {
    try {
        const random = window.crypto.getRandomValues(new Uint32Array(4));
        return random[0].toString(16) + "-" + random[1].toString(16) + "-" + random[2].toString(16) + "-" + random[3].toString(16);
    } catch (e) {
        console.log("Secure random number generation is not supported.");
        return Math.floor(Math.random() * 10000000000).toString();
    }
}

const parseQueryString = () => {
    let parsedResult = new Map();
    const qs = document.location.search.substring(1); // Ignore starting '?'
    const items = qs.split('&');
    items.forEach(item => {
        const params = item.split('=');
        parsedResult.set(params[0], params[1]);
    });
    return parsedResult;
}

const getId = async () => {

    _id = document.location.pathname.substring(StickyNotes.WwwRoot.length);
    if (_id.indexOf('/') > 0) {
        const firstPart = _id.substring(0, _id.indexOf('/'));
        if (firstPart.indexOf('.') > 0) {
            // This is an import since it has a dot in the first part
            // e.g. raw.githubusercontent.com
            _imported = true;

            const importUri = _id;
            console.log(importUri);
            const response = await fetch(`https://${importUri}`);
            if (response.status === 200) {
                console.log(response.status);

                const json = await response.json();
                console.log(json);
                importNotes(json, false);
                zoomOut(json);
            }
            return;
        }
    }

    if (_id.length === 0) {
        _id = generateId();
        document.location.pathname = `${StickyNotes.WwwRoot}${_id}`;
    }

    document.querySelector('meta[property="og:url"]').setAttribute("content", document.location.href);
}

getId();

const deSelectNotes = () => {
    const matches = document.getElementsByClassName("selected");
    while (matches.length > 0) {
        matches[0].classList.remove("selected");
    }
}

const pointerDown = e => {
    if (_isModalOpen) return;

    _pointers.push(e);
    _currentX = e.clientX / _scale;
    _currentY = e.clientY / _scale;

    const width = e.srcElement.offsetWidth;
    const height = e.srcElement.offsetHeight;

    if (e.ctrlKey) {
        // Ctrl+pointer enables multi-select
    }
    else {
        deSelectNotes();
    }
    _selectedElement = _sourceElement = e.srcElement;
    _sourceElement.className = "stickynote selected";
    _isResize = e.offsetX >= width * 0.7 && e.offsetY >= height * 0.6;
    e.stopPropagation();
}

const convertElementToNote = (element) => {
    const noteX = element.offsetLeft;
    const noteY = element.offsetTop;
    const noteZ = Math.floor(element.style.zIndex);
    const noteWidth = Math.floor(element.style.width.replace("px", ""));
    const noteHeight = Math.floor(element.style.height.replace("px", ""));
    const noteRotation = Math.floor(element.style.transform.replace("rotateZ(", "").replace("deg)", ""));

    return {
        id: element.id,
        text: element.innerText,
        link: element.dataset.link,
        color: element.style.backgroundColor,
        position: {
            x: noteX + _coordinateAdjustX,
            y: noteY + _coordinateAdjustY,
            z: noteZ,
            rotation: noteRotation
        },
        width: noteWidth,
        height: noteHeight,
        markdown: element.dataset.markdown || ""
    };
}

const importNotes = (notes, randomize) => {
    if (notes !== undefined && notes.length !== undefined) {
        deSelectNotes();

        const elementsCreated = [];
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (let i = 0; i < notes.length; i++) {
            const note = notes[i];

            if (note.position.x < minX) minX = note.position.x;
            if (note.position.y < minY) minY = note.position.y;
        }
        for (let i = 0; i < notes.length; i++) {
            const note = notes[i];
            if (randomize) {
                note.id = generateId();
                note.position.x += _lastCanvasClickX - minX;
                note.position.y += _lastCanvasClickY - minY;
                note.position.rotation = Math.floor(Math.random() * 8) - 4;
            }
            let element = document.createElement('div');
            createOrUpdateNoteElement(element, note);
            _notesElement.insertBefore(element, _notesElement.firstChild);
            elementsCreated.push(element);
            element.classList.add("selected");
        }

        if (elementsCreated.length > 0) {
            updateNoteElementsToServer(elementsCreated);
        }
    }
}

const updateNoteElementsToServer = async (elements) => {
    if (_imported) return;

    let notes = [];
    for (let i = 0; i < elements.length; i++) {
        const element = elements[i];
        let note = convertElementToNote(element);
        notes.push(note);
    }

    try {
        await connection.invoke("UpdateNotes", _id, notes);
        console.log("updateNoteMove called", notes);
    } catch (err) {
        console.log("updateNoteMove error");
        console.log(err);
        showErrorDialog();
    }
}

const pointerMove = e => {
    e.stopPropagation();
    if (_isModalOpen) return;

    const clientX = e.clientX / _scale;
    const clientY = e.clientY / _scale;

    for (let i = 0; i < _pointers.length; i++) {
        if (_pointers[i].pointerId == e.pointerId) {
            _pointers[i] = e;
            break;
        }
    }
    if (_pointers.length > 1) {
        // Handle gesture
        if (_pointers.length === 2) {
            // Support pinch and zoom
            const diffX = Math.abs(_pointers[0].clientX - _pointers[1].clientX);
            const diffY = Math.abs(_pointers[0].clientY - _pointers[1].clientY);
            const diff = Math.sqrt(diffX * diffX + diffY * diffY);
            if (_pointerDiff > 0) {
                const delta = _pointerDiff - diff;
                const previousScale = _scale;
                _scale += delta * -0.002;
                _scale = Math.min(Math.max(0.1, _scale), 10);
                _notesElement.style.transform = `scale(${_scale})`;

                const scaleChange = previousScale - _scale;
                const centerX = document.documentElement.clientWidth / _scale / 2; // pointers[0].clientX + (pointers[1].clientX - pointers[0].clientX) / 2;
                const centerY = document.documentElement.clientHeight / _scale / 2; //  pointers[0].clientY + (pointers[1].clientY - pointers[0].clientY) / 2;
                const correctionX = Math.floor(centerX * scaleChange);
                const correctionY = Math.floor(centerY * scaleChange);
                console.table({ centerX, correctionX, scaleChange, correctionX, _scale });

                _coordinateAdjustX -= correctionX;
                _coordinateAdjustY -= correctionY;
                const elements = document.getElementsByClassName("stickynote");
                for (let i = 0; i < elements.length; i++) {
                    const element = elements[i];
                    element.style.left = `${element.offsetLeft + correctionX}px`;
                    element.style.top = `${element.offsetTop + correctionY}px`;
                }
            }
            _pointerDiff = diff;
        }
        return;
    }

    if (_isRectSelect) {
        const screenX = e.clientX;
        const screenY = e.clientY;
        const left = Math.min(_rectStartScreenX, screenX);
        const top = Math.min(_rectStartScreenY, screenY);
        const width = Math.abs(screenX - _rectStartScreenX);
        const height = Math.abs(screenY - _rectStartScreenY);

        _selectionRect.style.left = `${left}px`;
        _selectionRect.style.top = `${top}px`;
        _selectionRect.style.width = `${width}px`;
        _selectionRect.style.height = `${height}px`;

        const selRect = { left, top, right: left + width, bottom: top + height };
        const notes = document.getElementsByClassName("stickynote");
        for (let i = 0; i < notes.length; i++) {
            const noteRect = notes[i].getBoundingClientRect();
            const intersects = !(noteRect.left > selRect.right || noteRect.right < selRect.left ||
                                 noteRect.top > selRect.bottom || noteRect.bottom < selRect.top);
            if (intersects) {
                notes[i].classList.add("selected");
            } else if (!_preSelectedNotes.has(notes[i].id)) {
                notes[i].classList.remove("selected");
            }
        }
        return;
    }

    _endX = Math.floor(_currentX - clientX);
    _endY = Math.floor(_currentY - clientY);
    _currentX = clientX;
    _currentY = clientY;

    if (_sourceElement === undefined) {
        if (_isMove && !_isRectSelect) {
            _coordinateAdjustX += _endX;
            _coordinateAdjustY += _endY;
            const notes = document.getElementsByClassName("stickynote");
            for (let i = 0; i < notes.length; i++) {
                const element = notes[i];
                element.style.left = `${element.offsetLeft - _endX}px`;
                element.style.top = `${element.offsetTop - _endY}px`;
            }
        }
        return;
    }

    if (_isResize) {
        const width = Math.floor(_sourceElement.style.width.replace("px", ""));
        const height = Math.floor(_sourceElement.style.height.replace("px", ""));

        _sourceElement.style.width = `${width - _endX}px`;
        _sourceElement.style.height = `${height - _endY}px`;

        if (new Date() - _updateSend > 80) {
            updateNoteElementsToServer([_sourceElement]);
            _updateSend = new Date();
        }
    }
    else {
        // Move all selected notes
        const sourceElements = document.getElementsByClassName("selected");
        for (let i = 0; i < sourceElements.length; i++) {
            const selectedSourceElement = sourceElements[i];
            selectedSourceElement.style.left = `${selectedSourceElement.offsetLeft - _endX}px`;
            selectedSourceElement.style.top = `${selectedSourceElement.offsetTop - _endY}px`;
        }
        if (new Date() - _updateSend > 80) {
            updateNoteElementsToServer(sourceElements);
            _updateSend = new Date();
        }
    }
}

const pointerUp = e => {
    _isMove = false;

    if (_isRectSelect) {
        _isRectSelect = false;
        _selectionRect.classList.remove('active');
        _preSelectedNotes.clear();
        for (let i = 0; i < _pointers.length; i++) {
            if (_pointers[i].pointerId == e.pointerId) {
                _pointers.splice(i, 1);
                break;
            }
        }
        e.stopPropagation();
        return;
    }

    for (let i = 0; i < _pointers.length; i++) {
        const p = _pointers[i];
        if (p.pointerId == e.pointerId) {
            _pointers.splice(i, 1);
            break;
        }
    }

    if (_sourceElement !== undefined) {
        const sourceElements = document.getElementsByClassName("selected");
        updateNoteElementsToServer(sourceElements);
    }
    _sourceElement = undefined;
    e.stopPropagation();
}

window.addEventListener("pointermove", pointerMove, { passive: true });
window.addEventListener("pointerup", pointerUp);
window.addEventListener("wheel", e => {
    e.stopPropagation();
    if (_isModalOpen) return;

    const previousScale = _scale;
    _scale += e.deltaY * -0.001;
    _scale = Math.min(Math.max(0.1, _scale), 10);
    _notesElement.style.transform = `scale(${_scale})`;

    const scaleChange = previousScale - _scale;
    const centerX = e.clientX / _scale;
    const centerY = e.clientY / _scale;
    const correctionX = Math.floor(centerX * scaleChange);
    const correctionY = Math.floor(centerY * scaleChange);
    console.table({ centerX, correctionX, scaleChange, correctionX, _scale });

    _coordinateAdjustX -= correctionX;
    _coordinateAdjustY -= correctionY;
    const elements = document.getElementsByClassName("stickynote");
    for (let i = 0; i < elements.length; i++) {
        const element = elements[i];
        element.style.left = `${element.offsetLeft + correctionX}px`;
        element.style.top = `${element.offsetTop + correctionY}px`;
    }
});

let protocol = new signalR.JsonHubProtocol();
let hubRoute = `${StickyNotes.WwwRoot}Notes`;
let connection = new signalR.HubConnectionBuilder()
    .withUrl(hubRoute)
    .withAutomaticReconnect()
    .withHubProtocol(protocol)
    .build();

// ---------------------------------------------------------------------------
// Markdown documents
//
// A note can own a GitHub-flavored markdown document. It is stored in Blob
// Storage and edited collaboratively. Real-time sync uses a separate SignalR
// group ("md|{boardId}|{markdownId}") so that people only looking at the notes
// canvas never receive markdown traffic. Edits are exchanged as exact,
// revision-gated single-range splices; any mismatch triggers a full resync so
// clients can never silently drift out of sync.
// ---------------------------------------------------------------------------

const markdownGroup = markdownId => `md|${_id}|${markdownId}`;

const markdownUrl = (markdownId, mode) =>
    `${document.location.pathname}?md=${encodeURIComponent(markdownId)}&mode=${mode}`;

// Convert bare "[ ] item" / "[x] item" lines (without a leading list marker)
// into proper GFM task-list items so they render as checkboxes.
const normalizeMarkdown = text => (text || "").replace(/^([ \t]*)\[([ xX])\]([ \t]+)/gm, "$1- [$2]$3");

const markdownToHtml = text => {
    const prepared = normalizeMarkdown(text);
    if (window.marked && typeof marked.parse === "function") {
        return marked.parse(prepared, { gfm: true, breaks: false });
    }
    if (typeof marked === "function") {
        return marked(prepared, { gfm: true, breaks: false });
    }
    return prepared;
};

const computeSplice = (base, target) => {
    if (base === target) return null;

    let start = 0;
    const minLength = Math.min(base.length, target.length);
    while (start < minLength && base.charCodeAt(start) === target.charCodeAt(start)) {
        start++;
    }

    let endBase = base.length;
    let endTarget = target.length;
    while (endBase > start && endTarget > start &&
        base.charCodeAt(endBase - 1) === target.charCodeAt(endTarget - 1)) {
        endBase--;
        endTarget--;
    }

    return {
        start,
        deleteCount: endBase - start,
        insert: target.substring(start, endTarget)
    };
};

const applySplice = (text, start, deleteCount, insert) =>
    text.substring(0, start) + (insert || "") + text.substring(start + deleteCount);

const isDarkTheme = () =>
    document.body.classList.contains("dark") ||
    document.getElementsByTagName("html")[0].className === "dark";

const applyMarkdownTheme = () => {
    const dark = isDarkTheme();

    const lightCss = document.getElementById("ghMarkdownLight");
    const darkCss = document.getElementById("ghMarkdownDark");
    if (lightCss && darkCss) {
        lightCss.disabled = dark;
        darkCss.disabled = !dark;
    }

    const hljsLight = document.getElementById("hljsLight");
    const hljsDark = document.getElementById("hljsDark");
    if (hljsLight && hljsDark) {
        hljsLight.disabled = dark;
        hljsDark.disabled = !dark;
    }

    const desiredTheme = dark ? "dark" : "default";
    if (window.mermaid) {
        if (!_mermaidInitialized || _mermaidTheme !== desiredTheme) {
            mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: desiredTheme });
            _mermaidInitialized = true;
            _mermaidTheme = desiredTheme;
        }
    }
};

const MD_COPY_ICON = '<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z"></path><path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z"></path></svg>';
const MD_CHECK_ICON = '<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z"></path></svg>';
const MD_LINK_ICON = '<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="m7.775 3.275 1.25-1.25a3.5 3.5 0 1 1 4.95 4.95l-2.5 2.5a3.5 3.5 0 0 1-4.95 0 .751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018 2 2 0 0 0 2.83 0l2.5-2.5a2.002 2.002 0 0 0-2.83-2.83l-1.25 1.25a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042Zm-4.69 9.64a2 2 0 0 0 2.83 0l1.25-1.25a.751.751 0 0 1 1.042.018.751.751 0 0 1 .018 1.042l-1.25 1.25a3.5 3.5 0 1 1-4.95-4.95l2.5-2.5a3.5 3.5 0 0 1 4.95 0 .751.751 0 0 1-.018 1.042.751.751 0 0 1-1.042.018 2 2 0 0 0-2.83 0l-2.5 2.5a2 2 0 0 0 0 2.83Z"></path></svg>';

const slugifyHeading = text => (text || "").toLowerCase().trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");

const addCodeCopyButtons = container => {
    const pres = container.querySelectorAll("pre");
    pres.forEach(pre => {
        if (pre.classList.contains("mermaid") || pre.querySelector(".md-copy-btn")) {
            return;
        }
        pre.classList.add("md-has-copy");
        const button = document.createElement("button");
        button.type = "button";
        button.className = "md-copy-btn";
        button.title = "Copy";
        button.setAttribute("aria-label", "Copy code");
        button.innerHTML = MD_COPY_ICON;
        button.addEventListener("click", async () => {
            const code = pre.querySelector("code");
            const value = code ? code.innerText : pre.innerText;
            try {
                await navigator.clipboard.writeText(value);
                button.classList.add("copied");
                button.innerHTML = MD_CHECK_ICON;
                button.title = "Copied!";
                setTimeout(() => {
                    button.classList.remove("copied");
                    button.innerHTML = MD_COPY_ICON;
                    button.title = "Copy";
                }, 1500);
            } catch (err) {
                console.log("Copy failed", err);
            }
        });
        pre.appendChild(button);
    });
};

const addHeadingAnchors = container => {
    const used = {};
    const headings = container.querySelectorAll("h1, h2, h3, h4, h5, h6");
    headings.forEach(heading => {
        let slug = slugifyHeading(heading.textContent) || "section";
        if (used[slug] !== undefined) {
            used[slug] += 1;
            slug = `${slug}-${used[slug]}`;
        } else {
            used[slug] = 0;
        }
        heading.id = slug;
        heading.classList.add("md-heading");

        const anchor = document.createElement("a");
        anchor.className = "md-anchor";
        anchor.href = `#${slug}`;
        anchor.title = "Copy link to this section";
        anchor.setAttribute("aria-label", "Link to this section");
        anchor.innerHTML = MD_LINK_ICON;
        anchor.addEventListener("click", e => {
            e.preventDefault();
            const path = `${document.location.pathname}${document.location.search}#${slug}`;
            try {
                history.replaceState(history.state, "", path);
            } catch (err) { /* ignore */ }
            heading.scrollIntoView({ behavior: "smooth", block: "start" });
            if (navigator.clipboard) {
                navigator.clipboard.writeText(`${document.location.origin}${path}`).catch(() => { /* ignore */ });
            }
        });
        heading.insertBefore(anchor, heading.firstChild);
    });
};

const renderMermaidBlocks = container => {
    const blocks = container.querySelectorAll("code.language-mermaid");
    const nodes = [];
    blocks.forEach(code => {
        const pre = code.closest("pre");
        const target = pre || code;
        const div = document.createElement("div");
        div.className = "mermaid";
        div.textContent = code.textContent;
        target.replaceWith(div);
        nodes.push(div);
    });

    if (nodes.length > 0 && window.mermaid) {
        try {
            mermaid.run({ nodes });
        } catch (err) {
            console.log("mermaid render error", err);
        }
    }
};

const highlightCodeBlocks = container => {
    if (!window.hljs) return;
    container.querySelectorAll("pre code").forEach(code => {
        if (code.classList.contains("language-mermaid")) return;
        try {
            hljs.highlightElement(code);
        } catch (err) {
            console.log("Highlight error", err);
        }
    });
};

const placeEditButton = body => {
    const button = document.getElementById("markdownViewEditButton");
    if (!button) return;
    button.classList.remove("md-edit-floating");
    const firstHeading = body.querySelector("h1, h2, h3, h4, h5, h6");
    if (firstHeading) {
        firstHeading.classList.add("md-has-edit");
        firstHeading.appendChild(button);
    } else {
        button.classList.add("md-edit-floating");
        body.insertBefore(button, body.firstChild);
    }
};

const renderMarkdownView = text => {
    const body = document.getElementById("markdownViewBody");
    if (!body) return;

    // Park the edit button outside the body before wiping it, so the element and
    // its click handler survive the re-render, then re-place it on the heading line.
    const editButton = document.getElementById("markdownViewEditButton");
    const overlay = document.getElementById("markdownViewOverlay");
    if (editButton && overlay && editButton.parentElement !== overlay) {
        overlay.appendChild(editButton);
    }

    const rawHtml = markdownToHtml(text || "");
    const cleanHtml = window.DOMPurify ? DOMPurify.sanitize(rawHtml) : rawHtml;
    body.innerHTML = cleanHtml;
    renderMermaidBlocks(body);
    highlightCodeBlocks(body);
    addCodeCopyButtons(body);
    addHeadingAnchors(body);
    placeEditButton(body);
};

const setMarkdownStatus = status => {
    const el = document.getElementById("markdownEditStatus");
    if (el) el.innerText = status;
};

const switchMarkdownMode = mode => {
    if (!_mdDoc) return;

    _mdDoc.mode = mode;
    _isModalOpen = true;

    // Drop focus before toggling aria-hidden to avoid the browser warning about
    // aria-hidden on an ancestor of the focused element.
    if (document.activeElement && typeof document.activeElement.blur === "function") {
        document.activeElement.blur();
    }

    const viewOverlay = document.getElementById("markdownViewOverlay");
    const editOverlay = document.getElementById("markdownEditOverlay");

    applyMarkdownTheme();

    if (mode === "view") {
        editOverlay.classList.remove("visible");
        viewOverlay.classList.add("visible");
        viewOverlay.setAttribute("aria-hidden", "false");
        editOverlay.setAttribute("aria-hidden", "true");
        renderMarkdownView(_mdDoc.text);
    }
    else {
        viewOverlay.classList.remove("visible");
        editOverlay.classList.add("visible");
        editOverlay.setAttribute("aria-hidden", "false");
        viewOverlay.setAttribute("aria-hidden", "true");
        const textarea = document.getElementById("markdownEditText");
        textarea.value = _mdDoc.text;
        setMarkdownStatus("");
        setTimeout(() => textarea.focus(), 50);
    }

    try {
        history.replaceState({ md: _mdDoc.markdownId }, "", markdownUrl(_mdDoc.markdownId, mode));
    } catch (e) { /* ignore */ }
};

const openMarkdownDoc = (element, note, mode) => {
    let markdownId = note.markdown || element.dataset.markdown || "";

    if (mode === "edit" && !markdownId) {
        // First time editing: create the document identifier and persist the note.
        markdownId = generateId();
        note.markdown = markdownId;
        element.dataset.markdown = markdownId;
        updateNoteElementsToServer([element]);
    }

    if (!markdownId) return;

    note.markdown = markdownId;
    element.dataset.markdown = markdownId;

    if (_mdDoc && _mdDoc.markdownId === markdownId) {
        switchMarkdownMode(mode);
        return;
    }

    if (_mdDoc) {
        leaveMarkdownGroup();
    }

    _mdDoc = {
        markdownId,
        group: markdownGroup(markdownId),
        note,
        element,
        mode,
        text: "",
        revision: 0,
        loaded: false,
        inflight: false,
        pendingTarget: undefined,
        pendingTimer: null
    };

    connection.invoke("Join", _mdDoc.group).catch(err => console.log("Join markdown error", err));

    if (!_mdHistoryPushed) {
        try {
            history.pushState({ md: markdownId }, "", markdownUrl(markdownId, mode));
            _mdHistoryPushed = true;
        } catch (e) { /* ignore */ }
    }

    switchMarkdownMode(mode);
};

// Opens the markdown document referenced by the ?md=...&mode=... query string
// (e.g. a shared link), once the board's notes have loaded.
const openMarkdownFromUrl = () => {
    const queryString = parseQueryString();
    let markdownId = queryString.get("md");
    if (!markdownId) return;
    markdownId = decodeURIComponent(markdownId);

    const mode = queryString.get("mode") === "edit" ? "edit" : "view";

    let target = null;
    const elements = _notesElement.getElementsByClassName("stickynote");
    for (let i = 0; i < elements.length; i++) {
        if (elements[i].dataset.markdown === markdownId) {
            target = elements[i];
            break;
        }
    }
    if (!target) return;

    // Establish a clean history base so closing returns to the plain board view.
    try {
        history.replaceState({}, "", document.location.pathname);
    } catch (e) { /* ignore */ }
    _mdHistoryPushed = false;

    openMarkdownDoc(target, convertElementToNote(target), mode);
};

const scheduleMarkdownSend = () => {
    if (!_mdDoc) return;
    if (_mdDoc.pendingTimer) clearTimeout(_mdDoc.pendingTimer);
    _mdDoc.pendingTimer = setTimeout(() => {
        _mdDoc.pendingTimer = null;
        sendMarkdownEdit();
    }, 250);
};

const sendMarkdownEdit = () => {
    if (!_mdDoc || _mdDoc.mode !== "edit") return;
    if (_mdDoc.inflight) return; // Wait for the current splice to be acknowledged.

    const textarea = document.getElementById("markdownEditText");
    const target = textarea.value;
    const splice = computeSplice(_mdDoc.text, target);
    if (!splice) return;

    _mdDoc.inflight = true;
    _mdDoc.pendingTarget = target;
    setMarkdownStatus("Saving…");

    connection.invoke("UpdateMarkdown", _mdDoc.group, _mdDoc.revision, splice.start, splice.deleteCount, splice.insert)
        .catch(err => {
            console.log("UpdateMarkdown error", err);
            _mdDoc.inflight = false;
            setMarkdownStatus("Save failed");
        });
};

const insertAtCursor = (textarea, text) => {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    textarea.value = textarea.value.substring(0, start) + text + textarea.value.substring(end);
    const position = start + text.length;
    textarea.selectionStart = textarea.selectionEnd = position;
};

const uploadAndInsertImage = async file => {
    if (!_mdDoc) return;

    const textarea = document.getElementById("markdownEditText");
    const token = `![uploading ${(file.name || "image")}…]()`;
    insertAtCursor(textarea, token);
    setMarkdownStatus("Uploading image…");

    try {
        const form = new FormData();
        form.append("file", file, file.name || "image.png");
        const url = `${StickyNotes.WwwRoot}api/attachments/upload?boardId=${encodeURIComponent(_id)}&markdownId=${encodeURIComponent(_mdDoc.markdownId)}`;
        const response = await fetch(url, { method: "POST", body: form });
        if (!response.ok) throw new Error(`Upload failed: ${response.status}`);

        const data = await response.json();
        textarea.value = textarea.value.replace(token, `![image](${data.url})`);
        setMarkdownStatus("");
        scheduleMarkdownSend();
    }
    catch (err) {
        console.log("Image upload error", err);
        textarea.value = textarea.value.replace(token, "");
        setMarkdownStatus("Image upload failed");
    }
};

const leaveMarkdownGroup = () => {
    if (!_mdDoc) return;
    if (_mdDoc.pendingTimer) {
        clearTimeout(_mdDoc.pendingTimer);
        _mdDoc.pendingTimer = null;
    }
    if (_mdDoc.mode === "edit") {
        // Flush any pending local changes before leaving.
        sendMarkdownEdit();
    }
    const group = _mdDoc.group;
    connection.invoke("Leave", group).catch(err => console.log("Leave markdown error", err));
};

const closeMarkdownOverlay = () => {
    if (!_mdDoc) return;

    if (document.activeElement && typeof document.activeElement.blur === "function") {
        document.activeElement.blur();
    }

    leaveMarkdownGroup();

    const viewOverlay = document.getElementById("markdownViewOverlay");
    const editOverlay = document.getElementById("markdownEditOverlay");
    viewOverlay.classList.remove("visible");
    editOverlay.classList.remove("visible");
    viewOverlay.setAttribute("aria-hidden", "true");
    editOverlay.setAttribute("aria-hidden", "true");

    // A markdown document that ends up empty should not keep its id on the note,
    // otherwise the note keeps offering an empty view.
    if (_mdDoc.loaded && _mdDoc.note && (_mdDoc.element instanceof HTMLElement) && (_mdDoc.text || "").trim() === "") {
        _mdDoc.note.markdown = "";
        _mdDoc.element.dataset.markdown = "";
        updateNoteElementsToServer([_mdDoc.element]);
    }

    _mdDoc = null;
    _mdHistoryPushed = false;
    _isModalOpen = false;
};

const requestCloseMarkdown = () => {
    if (!_mdDoc) return;
    if (_mdHistoryPushed) {
        // Let the browser Back button semantics drive the close (mobile-friendly).
        history.back();
    }
    else {
        closeMarkdownOverlay();
    }
};

connection.on("MarkdownContent", (markdownId, text, revision) => {
    if (!_mdDoc || _mdDoc.markdownId !== markdownId) return;

    const previousBase = _mdDoc.text;
    _mdDoc.text = text;
    _mdDoc.revision = revision;
    _mdDoc.inflight = false;
    _mdDoc.loaded = true;

    if (_mdDoc.mode === "view") {
        if ((text || "").trim() === "") {
            // Nothing to view: fall back to editing the note (closeMarkdownOverlay
            // also drops the empty markdown id from the note).
            const note = _mdDoc.note;
            const element = _mdDoc.element;
            if (_mdHistoryPushed) {
                try { history.replaceState({}, "", document.location.pathname); } catch (e) { /* ignore */ }
            }
            closeMarkdownOverlay();
            if ((element instanceof HTMLElement) && note) {
                editNoteMenu(element, note);
            }
            return;
        }
        renderMarkdownView(text);
    }
    else {
        const textarea = document.getElementById("markdownEditText");
        if (textarea.value === previousBase || textarea.value === "") {
            // No unsent local edits: adopt the authoritative text.
            const cursor = textarea.selectionStart;
            textarea.value = text;
            try {
                textarea.selectionStart = textarea.selectionEnd = Math.min(cursor, text.length);
            } catch (e) { /* ignore */ }
        }
        else {
            // Local edits exist: re-send them on top of the new base (last-write-wins).
            scheduleMarkdownSend();
        }
    }
    setMarkdownStatus("");
});

connection.on("MarkdownAck", (markdownId, baseRevision, revision) => {
    if (!_mdDoc || _mdDoc.markdownId !== markdownId) return;

    if (_mdDoc.pendingTarget !== undefined) {
        _mdDoc.text = _mdDoc.pendingTarget;
        _mdDoc.pendingTarget = undefined;
    }
    _mdDoc.revision = revision;
    _mdDoc.inflight = false;
    setMarkdownStatus("Saved");

    const textarea = document.getElementById("markdownEditText");
    if (textarea && textarea.value !== _mdDoc.text) {
        scheduleMarkdownSend();
    }
});

connection.on("MarkdownPatch", (markdownId, baseRevision, start, deleteCount, insert, revision) => {
    if (!_mdDoc || _mdDoc.markdownId !== markdownId) return;

    if (_mdDoc.revision !== baseRevision || _mdDoc.inflight) {
        // We are not exactly on the patch's base revision, or we have an
        // in-flight edit: resynchronize fully rather than risk divergence.
        connection.invoke("GetMarkdown", _mdDoc.group).catch(err => console.log(err));
        return;
    }

    const oldText = _mdDoc.text;
    const newText = applySplice(oldText, start, deleteCount, insert);
    _mdDoc.text = newText;
    _mdDoc.revision = revision;

    if (_mdDoc.mode === "view") {
        renderMarkdownView(newText);
    }
    else {
        const textarea = document.getElementById("markdownEditText");
        if (textarea.value === oldText) {
            // No local edits: mirror the remote change and keep the caret sensible.
            const cursor = textarea.selectionStart;
            textarea.value = newText;
            let newCursor = cursor;
            if (cursor > start) {
                newCursor = cursor >= start + deleteCount
                    ? cursor - deleteCount + (insert ? insert.length : 0)
                    : start + (insert ? insert.length : 0);
            }
            try {
                textarea.selectionStart = textarea.selectionEnd = Math.min(newCursor, newText.length);
            } catch (e) { /* ignore */ }
        }
        else {
            // Concurrent local edits: resync to reconcile safely.
            connection.invoke("GetMarkdown", _mdDoc.group).catch(err => console.log(err));
        }
    }
});

window.addEventListener("popstate", () => {
    if (_mdDoc) {
        _mdHistoryPushed = false;
        closeMarkdownOverlay();
    }
});

document.addEventListener("keydown", e => {
    if (_mdDoc && e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        requestCloseMarkdown();
    }
}, true);

document.getElementById("markdownViewCloseButton")?.addEventListener("click", requestCloseMarkdown);
document.getElementById("markdownEditCloseButton")?.addEventListener("click", requestCloseMarkdown);
document.getElementById("markdownViewEditButton")?.addEventListener("click", () => switchMarkdownMode("edit"));
document.getElementById("markdownEditViewButton")?.addEventListener("click", () => {
    if (_mdDoc) {
        const textarea = document.getElementById("markdownEditText");
        _mdDoc.text = textarea.value;
    }
    switchMarkdownMode("view");
});

const markdownEditTextElement = document.getElementById("markdownEditText");
if (markdownEditTextElement) {
    markdownEditTextElement.addEventListener("input", () => {
        if (_mdDoc && _mdDoc.mode === "edit") {
            scheduleMarkdownSend();
        }
    });
    markdownEditTextElement.addEventListener("paste", async e => {
        const items = e.clipboardData && e.clipboardData.items;
        if (!items) return;
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (item.type && item.type.startsWith("image/")) {
                e.preventDefault();
                const file = item.getAsFile();
                if (file) {
                    await uploadAndInsertImage(file);
                }
                return;
            }
        }
    });
}

const editNoteMenu = (element, note) => {
    _isModalOpen = true;

    const modalElement = document.getElementById("noteModal");
    const noteTextElement = document.getElementById("noteText");
    const noteLinkElement = document.getElementById("noteLink");
    const noteColorSelectElement = document.getElementById("noteColor");
    const updateNoteSaveButtonElement = document.getElementById("updateNoteSaveButton");
    const noteEditMarkdownButtonElement = document.getElementById("noteEditMarkdownButton");
    const noteViewMarkdownButtonElement = document.getElementById("noteViewMarkdownButton");

    const updateNoteSaveButtonClick = e => {
        modal.hide();

        const isTextUpdated = noteTextElement.value !== element.innerText;
        note.text = element.innerText = noteTextElement.value;
        note.link = element.dataset.link = noteLinkElement.value;
        note.color = element.style.backgroundColor = noteColorSelectElement.value;
        if (isTextUpdated) {
            console.log("Re-calculate the size due to text update");
            const size = calculateNoteSize(note.text);
            element.style.width = `${size.width}px`;
            element.style.height = `${size.height}px`;
        }

        updateNoteElementsToServer([element]);
    }

    const editMarkdownButtonClick = e => {
        modal.hide();
        openMarkdownDoc(element, note, "edit");
    }

    const viewMarkdownButtonClick = e => {
        modal.hide();
        openMarkdownDoc(element, note, "view");
    }

    const dialogShown = e => {
        noteTextElement.focus();
    }

    const dialogClosed = e => {
        // Keep interactions blocked if the markdown overlay took over.
        _isModalOpen = _mdDoc != null;

        updateNoteSaveButtonElement.removeEventListener("click", updateNoteSaveButtonClick);
        noteEditMarkdownButtonElement?.removeEventListener("click", editMarkdownButtonClick);
        noteViewMarkdownButtonElement?.removeEventListener("click", viewMarkdownButtonClick);
        modalElement.removeEventListener("shown.bs.modal", dialogShown);
        modalElement.removeEventListener("hidden.bs.modal", dialogClosed);
    }

    updateNoteSaveButtonElement.addEventListener("click", updateNoteSaveButtonClick);
    noteEditMarkdownButtonElement?.addEventListener("click", editMarkdownButtonClick);
    noteViewMarkdownButtonElement?.addEventListener("click", viewMarkdownButtonClick);
    modalElement.addEventListener("shown.bs.modal", dialogShown);
    modalElement.addEventListener("hidden.bs.modal", dialogClosed);

    noteTextElement.value = note.text;
    noteLinkElement.value = note.link;
    noteColorSelectElement.value = note.color;
    // "View markdown" only makes sense when the note actually has a markdown document.
    if (noteViewMarkdownButtonElement) {
        noteViewMarkdownButtonElement.disabled = !(note.markdown || element.dataset.markdown);
    }

    const modal = new bootstrap.Modal(modalElement);
    modal.show();
};

const editNoteSettings = (element, note) => {
    _isModalOpen = true;

    const modalElement = document.getElementById("noteSettingsModal");
    const noteRotationElement = document.getElementById("noteRotation");
    const updateNoteSettingsButtonElement = document.getElementById("updateNoteSettingsButton");

    const updateNoteSaveButtonClick = e => {
        modal.hide();

        const isRotationUpdated = noteRotationElement.value !== note.position.rotation;
        if (isRotationUpdated) {
            note.position.rotation = noteRotationElement.value;
            element.style.transform = `rotateZ(${note.position.rotation}deg)`;
        }

        updateNoteElementsToServer([element]);
    }

    const dialogClosed = e => {
        _isModalOpen = false;

        updateNoteSettingsButtonElement.removeEventListener("click", updateNoteSaveButtonClick);
        modalElement.removeEventListener("hidden.bs.modal", dialogClosed);
    }

    updateNoteSettingsButtonElement.addEventListener("click", updateNoteSaveButtonClick);
    modalElement.addEventListener("hidden.bs.modal", dialogClosed);

    noteRotationElement.value = note.position.rotation;

    const modal = new bootstrap.Modal(modalElement);
    modal.show();
};

const createOrUpdateNoteElement = (element, note) => {
    element.id = note.id;
    element.innerText = note.text;
    element.dataset.link = note.link;
    element.dataset.markdown = note.markdown || "";
    element.className = "stickynote";
    element.style.backgroundColor = note.color;
    element.style.left = `${note.position.x}px`;
    element.style.top = `${note.position.y}px`;
    element.style.zIndex = note.position.z;
    element.style.transform = `rotateZ(${note.position.rotation}deg)`;
    element.style.width = `${note.width}px`;
    element.style.height = `${note.height}px`;
    element.addEventListener("pointerdown", pointerDown, { passive: true });
    element.addEventListener("dblclick", e => {
        _pointers = [];

        // Plain double-click always opens the note editor.
        if (!e.ctrlKey) {
            editNoteMenu(element, note);
            return;
        }

        // Ctrl+double-click priority: 1) open link, 2) view markdown, 3) edit note.
        const link = element.dataset.link;
        const markdown = element.dataset.markdown;
        if (link && link !== "undefined") {
            if (link.startsWith("http")) {
                window.open(link, "_blank");
            }
            else {
                document.location.href = link;
            }
        }
        else if (markdown) {
            openMarkdownDoc(element, note, "view");
        }
        else {
            editNoteMenu(element, note);
        }
    });
    element.addEventListener("contextmenu", e => {
        if (_isModalOpen) return;
        _isModalOpen = true;
        _pointers = [];

        e.preventDefault();
        e.stopPropagation();

        const modalElement = document.getElementById("noteMenuModal");
        const noteMenuOpenLinkElement = document.getElementById("noteMenuOpenLink");
        const noteMenuOpenLinkNewWindowElement = document.getElementById("noteMenuOpenLinkNewWindow");
        const noteMenuEditNoteElement = document.getElementById("noteMenuEditNote");
        const noteMenuBringToFrontElement = document.getElementById("noteMenuBringToFront");
        const noteMenuSendToBackElement = document.getElementById("noteMenuSendToBack");
        const noteMenuNoteSettingsElement = document.getElementById("noteMenuNoteSettings");
        const noteMenuDeleteNoteElement = document.getElementById("noteMenuDeleteNote");

        let newDialogOpened = false;
        const setZIndex = bringToFront => {
            modal.hide();

            newDialogOpened = true;
            _isModalOpen = false;

            let minZ = 9999999999, maxZ = -9999999999;
            const elements = document.getElementsByClassName("stickynote");
            for (let i = 0; i < elements.length; i++) {
                const zIndex = Math.floor(elements[i].style.zIndex);
                if (zIndex < minZ) minZ = zIndex;
                if (zIndex > maxZ) maxZ = zIndex;
            }

            element.style.zIndex = bringToFront ? maxZ + 1 : minZ - 1;
            updateNoteElementsToServer([element]);
        }
        const menuOpenLinkButtonClick = e => {
            modal.hide();

            newDialogOpened = true;
            _isModalOpen = false;

            if (note.link !== undefined && note.link !== "") {
                document.location.href = note.link;
            }
        }
        const menuOpenLinkNewWindowButtonClick = e => {
            modal.hide();

            newDialogOpened = true;
            _isModalOpen = false;

            if (note.link !== undefined && note.link !== "") {
                window.open(note.link, "_blank");
            }
        }
        const menuEditNoteButtonClick = e => {
            modal.hide();

            newDialogOpened = true;
            _isModalOpen = false;
            editNoteMenu(element, note);
        }
        const menuBringToFrontButtonClick = e => {
            setZIndex(true);
        }
        const menuSendToBackButtonClick = e => {
            setZIndex(false);
        }
        const menuDeleteNoteButtonClick = e => {
            modal.hide();

            console.log(note.id);
            if (confirm(`Do you really want to delete "${note.text}" note?`)) {
                if (!_imported) {
                    connection.invoke("DeleteNotes", _id, [note.id])
                        .then(function () {
                            console.log("DeleteNotes called");
                        })
                        .catch(function (err) {
                            console.log("DeleteNotes error");
                            console.log(err);
                        });
                }
                _notesElement.removeChild(element);
            }
        }
        const menuNoteSettings = e => {
            modal.hide();

            newDialogOpened = true;
            _isModalOpen = false;
            editNoteSettings(element, note);
        }
        const dialogClosed = e => {
            if (!newDialogOpened) {
                _isModalOpen = false;
            }
            noteMenuOpenLinkElement.removeEventListener("click", menuOpenLinkButtonClick);
            noteMenuOpenLinkNewWindowElement.removeEventListener("click", menuOpenLinkNewWindowButtonClick);
            noteMenuEditNoteElement.removeEventListener("click", menuEditNoteButtonClick);
            noteMenuBringToFrontElement.removeEventListener("click", menuBringToFrontButtonClick);
            noteMenuSendToBackElement.removeEventListener("click", menuSendToBackButtonClick);
            noteMenuNoteSettingsElement.removeEventListener("click", menuNoteSettings);
            noteMenuDeleteNoteElement.removeEventListener("click", menuDeleteNoteButtonClick);
            modalElement.removeEventListener("hidden.bs.modal", dialogClosed);
        }

        noteMenuOpenLinkElement.addEventListener("click", menuOpenLinkButtonClick);
        noteMenuOpenLinkNewWindowElement.addEventListener("click", menuOpenLinkNewWindowButtonClick);
        noteMenuEditNoteElement.addEventListener("click", menuEditNoteButtonClick);
        noteMenuBringToFrontElement.addEventListener("click", menuBringToFrontButtonClick);
        noteMenuSendToBackElement.addEventListener("click", menuSendToBackButtonClick);
        noteMenuNoteSettingsElement.addEventListener("click", menuNoteSettings);
        noteMenuDeleteNoteElement.addEventListener("click", menuDeleteNoteButtonClick);
        modalElement.addEventListener("hidden.bs.modal", dialogClosed);

        const modal = new bootstrap.Modal(modalElement);
        modal.show();
    });
}

const calculateNoteSize = text => {
    let width = 100;
    let height = 100;

    const lines = text.split(/\r\n|\r|\n/);
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        let rowWidth = line.length * 17;
        if (width < rowWidth) {
            width = rowWidth;
        }
    }
    height = Math.max(100, 32 /* row height */ * lines.length);

    console.log({ lines: lines.length, height, width });
    return { width, height };
}

const addNote = async (noteText, noteLink, color, first) => {
    const size = calculateNoteSize(noteText);
    let note = {
        id: generateId(),
        text: noteText,
        link: noteLink,
        color: color,
        position: {
            x: first ? _currentX : _currentX - 100 + 200 * Math.random(),
            y: first ? _currentY : _currentY - 100 + 200 * Math.random(),
            z: 100,
            rotation: Math.floor(Math.random() * 8) - 4
        },
        width: size.width,
        height: size.height
    }
    let element = document.createElement('div');
    createOrUpdateNoteElement(element, note);
    _notesElement.insertBefore(element, _notesElement.firstChild);

    await updateNoteElementsToServer([element]);
}

const deleteAllNotesByClassFilter = (filter, remove) => {
    const matches = document.getElementsByClassName(filter);
    let noteIds = [];
    while (matches.length > 0) {
        noteIds.push(matches[0].id);
        _notesElement.removeChild(matches[0]);
    }

    if (remove && !_imported) {
        connection.invoke("DeleteNotes", _id, noteIds)
            .then(function () {
                console.log("DeleteNotes by filter called");
            })
            .catch(function (err) {
                console.log("DeleteNotes by filter error");
                console.log(err);
                showErrorDialog();
            });
    }
    _selectedElement = undefined;
}

const showNoteDialog = () => {
    _isMove = false;
    _pointers = [];
    if (_isModalOpen) {
        return;
    }

    _isModalOpen = true;
    const modalElement = document.getElementById("noteModal");
    const noteTextElement = document.getElementById("noteText");
    const noteLinkElement = document.getElementById("noteLink");
    const noteColorSelectElement = document.getElementById("noteColor");
    const updateNoteSaveButtonElement = document.getElementById("updateNoteSaveButton");

    noteTextElement.value = "";
    noteColorSelectElement.value = "lightyellow";
    noteLinkElement.value = "";
    let addedNotes = [];

    const updateNoteSaveButtonClick = e => {

        if (noteTextElement.value.length !== 0) {
            addedNotes.push({ text: noteTextElement.value, link: noteLinkElement.value, color: noteColorSelectElement.value });
            noteTextElement.value = "";
            noteLinkElement.value = "";
            noteColorSelectElement.value = "lightyellow";
            noteTextElement.focus();
        }
        else {
            modal.hide();
        }
    }

    const dialogShown = e => {
        noteTextElement.focus();
    }

    const dialogClosed = e => {
        _isModalOpen = false;

        updateNoteSaveButtonElement.removeEventListener("click", updateNoteSaveButtonClick);
        modalElement.removeEventListener("shown.bs.modal", dialogShown);
        modalElement.removeEventListener("hidden.bs.modal", dialogClosed);

        for (let i = 0; i < addedNotes.length; i++) {
            const addedNote = addedNotes[i];
            addNote(addedNote.text, addedNote.link, addedNote.color, i === 0 /* is first note to be added */);
        }
    }

    updateNoteSaveButtonElement.addEventListener("click", updateNoteSaveButtonClick);
    modalElement.addEventListener("shown.bs.modal", dialogShown);
    modalElement.addEventListener("hidden.bs.modal", dialogClosed);

    const modal = new bootstrap.Modal(modalElement);
    modal.show();
}

window.addEventListener('focus', () => {
    if (connection.state === "Disconnected") {
        startConnection();
    }
});

window.addEventListener('blur', () => {
});

window.addEventListener('pointerdown', e => {
    if (_isModalOpen) return;

    if (e.ctrlKey) {
        // Start rectangle selection
        _isRectSelect = true;
        _isMove = false;
        _rectStartScreenX = e.clientX;
        _rectStartScreenY = e.clientY;
        _preSelectedNotes.clear();
        const preSelected = document.getElementsByClassName("selected");
        for (let i = 0; i < preSelected.length; i++) {
            _preSelectedNotes.add(preSelected[i].id);
        }
        _selectionRect.style.left = `${e.clientX}px`;
        _selectionRect.style.top = `${e.clientY}px`;
        _selectionRect.style.width = '0px';
        _selectionRect.style.height = '0px';
        _selectionRect.classList.add('active');
        _pointers.push(e);
        return;
    }

    deSelectNotes();

    _pointerDiff = 0;
    _pointers.push(e);
    _currentX = e.clientX / _scale;
    _currentY = e.clientY / _scale;
    _lastCanvasClickX = _currentX;
    _lastCanvasClickY = _currentY;
    _isMove = true;
});

window.addEventListener('contextmenu', e => {
    e.preventDefault();
    if (_isModalOpen) return;

    if (_sourceElement === undefined) {
        _isModalOpen = true;

        const modalElement = document.getElementById("menuModal");
        const menuAddNotesElement = document.getElementById("menuAddNotes");
        const menuZoomOutElement = document.getElementById("menuZoomOut");
        const menuStartNewSessionElement = document.getElementById("menuStartNewSession");
        const menuStartNewSessionWithLinkElement = document.getElementById("menuStartNewSessionWithLink");
        const menuCopyAsImageElement = document.getElementById("menuCopyAsImage");
        const menuRemoveAllNotesElement = document.getElementById("menuRemoveAllNotes");
        const menuThemeElement = document.getElementById("menuThemeButton");

        let newDialogOpened = false;
        const menuAddNotesButtonClick = e => {
            modal.hide();

            newDialogOpened = true;
            _isModalOpen = false;
            showNoteDialog();
        }
        const menuZoomOutClick = e => {
            modal.hide();
            document.location.reload();
        }
        const menuStartNewSessionButtonClick = e => {
            modal.hide();

            _id = generateId();
            document.location.href = `${StickyNotes.WwwRoot}${_id}`;
        }
        const menuStartNewSessionWithLinkButtonClick = async e => {
            modal.hide();

            const currentId = _id;

            let linkId = prompt("Provide link for new session. Leave blank to auto-generate.", "");
            if (linkId == null) {
                return;
            }
            else if (linkId.length === 0) {
                linkId = generateId();
            }

            await addNote("Next", `${linkId}`, "lightblue", true);
            document.location.href = `${StickyNotes.WwwRoot}${linkId}?parent=${currentId}`;
        }
        const menuCopyAsImageButtonClick = async e => {
            modal.hide();
            _isModalOpen = false;

            // Wait for modal to fully close before capturing
            await new Promise(resolve => setTimeout(resolve, 400));

            try {
                const bgColor = getComputedStyle(document.body).backgroundColor || '#ffffff';
                const canvas = await html2canvas(document.body, {
                    backgroundColor: bgColor,
                    scale: 1,
                    useCORS: true,
                    width: window.innerWidth,
                    height: window.innerHeight,
                    windowWidth: window.innerWidth,
                    windowHeight: window.innerHeight
                });
                canvas.toBlob(async blob => {
                    try {
                        await navigator.clipboard.write([
                            new ClipboardItem({ 'image/png': blob })
                        ]);
                    } catch (err) {
                        console.log("Copy to clipboard failed", err);
                    }
                }, 'image/png');
            } catch (err) {
                console.log("html2canvas error", err);
            }
        }
        const menuRemoveAllNotesButtonClick = e => {
            modal.hide();

            if (confirm("Do you really want to delete all notes?")) {
                deleteAllNotesByClassFilter("stickynote", true);
            }
        }
        const menuThemeButtonClick = e => {
            let theme = localStorage.getItem("theme");
            if (theme == null || theme === "light") {
                theme = "dark";
            }
            else {
                theme = "light";
            }

            localStorage.setItem("theme", theme);

            document.getElementsByTagName("html")[0].className = theme;
            document.body.classList.remove("dark");
            document.body.classList.remove("light");
            document.body.classList.add(theme);

            // Keep an open markdown overlay in sync with the new theme.
            applyMarkdownTheme();
            if (_mdDoc && _mdDoc.mode === "view") {
                renderMarkdownView(_mdDoc.text);
            }
        }

        const dialogClosed = e => {
            if (!newDialogOpened) {
                _isModalOpen = false;
            }
            menuAddNotesElement.removeEventListener("click", menuAddNotesButtonClick);
            menuZoomOutElement.removeEventListener("click", menuZoomOutClick);
            menuStartNewSessionElement.removeEventListener("click", menuStartNewSessionButtonClick);
            menuStartNewSessionWithLinkElement.removeEventListener("click", menuStartNewSessionWithLinkButtonClick);
            menuCopyAsImageElement.removeEventListener("click", menuCopyAsImageButtonClick);
            menuRemoveAllNotesElement.removeEventListener("click", menuRemoveAllNotesButtonClick);
            menuThemeElement.removeEventListener("click", menuThemeButtonClick);
            modalElement.removeEventListener("hidden.bs.modal", dialogClosed);
        }

        menuAddNotesElement.addEventListener("click", menuAddNotesButtonClick);
        menuZoomOutElement.addEventListener("click", menuZoomOutClick);
        menuStartNewSessionElement.addEventListener("click", menuStartNewSessionButtonClick);
        menuStartNewSessionWithLinkElement.addEventListener("click", menuStartNewSessionWithLinkButtonClick);
        menuCopyAsImageElement.addEventListener("click", menuCopyAsImageButtonClick);
        menuRemoveAllNotesElement.addEventListener("click", menuRemoveAllNotesButtonClick);
        menuThemeElement.addEventListener("click", menuThemeButtonClick);
        modalElement.addEventListener("hidden.bs.modal", dialogClosed);

        const modal = new bootstrap.Modal(modalElement);
        modal.show();
    }
});

connection.onclose(err => {
    console.log(`onclose: ${err}`);
});

connection.onreconnecting(e => {
    console.log(`onreconnecting : ${e}`);
});

connection.onreconnected(connectionId => {
    console.log(`onreconnected : ${connectionId}`);
    connection.invoke("Join", _id);
    if (_mdDoc) {
        // Rejoin the markdown group and resync from the authoritative copy.
        connection.invoke("Join", _mdDoc.group).catch(err => console.log(err));
    }
});

const startConnection = () => {
    if (_imported) return;

    if (_isInitialNotesLoadPending) {
        setInitialNotesLoadingVisible(true);
    }

    connection.start()
        .then(async () => {
            // Connected
            connection.invoke("Join", _id);

            const queryString = parseQueryString();
            const parentUri = queryString.get("parent");
            if (parentUri !== undefined) {
                await addNote("Previous", `${parentUri}`, "lightblue", true);
                document.location.replace(`${StickyNotes.WwwRoot}${_id}`);
            }
        })
        .catch(function (err) {
            setInitialNotesLoadingVisible(false);
            console.log(err);
            showErrorDialog();
        });
}

const zoomOut = notes => {
    deleteAllNotesByClassFilter("stickynote", false);

    if (!notes || notes.length === 0) {
        // Nothing to fit. Reset the view to a neutral state instead of deriving
        // a scale/offset from sentinel values, which previously produced an
        // enormous (~1e10) coordinate offset that got baked into saved notes.
        _scale = 1.0;
        _originalScale = 1.0;
        _coordinateAdjustX = 0;
        _coordinateAdjustY = 0;
        _notesElement.style.transform = `scale(${_scale})`;
        return;
    }

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < notes.length; i++) {
        const note = notes[i];

        if (note.position.x < minX) minX = note.position.x;
        if (note.position.x + note.width > maxX) maxX = note.position.x + note.width;

        if (note.position.y < minY) minY = note.position.y;
        if (note.position.y + note.height > maxY) maxY = note.position.y + note.height;
    }

    const deltaX = Math.abs(maxX - minX) + 40;
    const deltaY = Math.abs(maxY - minY) + 40;

    const scaleX = document.documentElement.clientWidth / deltaX;
    const scaleY = document.documentElement.clientHeight / deltaY;

    if (scaleX < 1 && scaleX < scaleY) {
        console.log("scale x axes: " + scaleX);
        _scale = scaleX;
        _coordinateAdjustX = minX - 20 - (document.documentElement.clientWidth - deltaX * _scale) / 2;
        _coordinateAdjustY = minY - 20 - (document.documentElement.clientHeight - deltaY * _scale) / 2;
    }
    else if (scaleY < 1 && scaleY <= scaleX) {
        console.log("scale y axes: " + scaleY);
        _scale = scaleY;
        _coordinateAdjustX = minX - 20 - (document.documentElement.clientWidth - deltaX * _scale) / 2;
        _coordinateAdjustY = minY - 20 - (document.documentElement.clientHeight - deltaY * _scale) / 2;
    }
    else {
        // No need to scale but let's center
        console.log("no scale required, centering");
        _scale = 1.0;
        _coordinateAdjustX = minX - document.documentElement.clientWidth / 2 + deltaX / 2;
        _coordinateAdjustY = minY - document.documentElement.clientHeight / 2 + deltaY / 2;
    }

    _originalScale = _scale;
    for (let i = 0; i < notes.length; i++) {
        const note = notes[i];

        note.position.x -= _coordinateAdjustX;
        note.position.y -= _coordinateAdjustY;

        const element = document.createElement('div');
        createOrUpdateNoteElement(element, note);
        _notesElement.insertBefore(element, _notesElement.firstChild);
    }

    _notesElement.style.transform = `scale(${_scale})`;
}

connection.on("AllNotes", notes => {
    console.log("Notes:");
    console.log(notes);

    if (_isInitialNotesLoadPending) {
        _isInitialNotesLoadPending = false;
        setInitialNotesLoadingVisible(false);
    }

    zoomOut(notes);

    if (!_markdownAutoOpenChecked) {
        _markdownAutoOpenChecked = true;
        openMarkdownFromUrl();
    }
});

connection.on("UpdateNotes", notes => {
    console.log("UpdateNotes:");
    console.log(notes);

    for (let i = 0; i < notes.length; i++) {
        const note = notes[i];
        note.position.x -= _coordinateAdjustX;
        note.position.y -= _coordinateAdjustY;

        let element = document.getElementById(note.id);
        if (element === undefined || element == null) {
            element = document.createElement('div');
            createOrUpdateNoteElement(element, note);
            _notesElement.insertBefore(element, _notesElement.firstChild);
        }
        else {
            createOrUpdateNoteElement(element, note);
        }
    }
});

connection.on("DeleteNotes", noteIds => {
    console.log("DeleteNotes:");
    console.log(noteIds);

    for (let i = 0; i < noteIds.length; i++) {
        const noteId = noteIds[i];
        const element = document.getElementById(noteId);
        if (element) {
            _notesElement.removeChild(element);
        }
    }
});

document.addEventListener('keydown', (e) => {
    if (!_isModalOpen && e.ctrlKey && (e.key == "+" || e.key == "-" || e.key == "0")) {
        // Prevent keyboard zooming on the canvas (it has custom zooming). While a
        // dialog or the markdown overlay is open, let the browser zoom natively.
        e.preventDefault();
    }
});

document.addEventListener('keyup', (e) => {
    if (e.key === "Control" && _isRectSelect) {
        // Cancel rectangle selection and restore previous selection state
        _isRectSelect = false;
        _selectionRect.classList.remove('active');
        const notes = document.getElementsByClassName("stickynote");
        for (let i = 0; i < notes.length; i++) {
            if (_preSelectedNotes.has(notes[i].id)) {
                notes[i].classList.add("selected");
            } else {
                notes[i].classList.remove("selected");
            }
        }
        _preSelectedNotes.clear();
        return;
    }
    if (e.key === "Escape") {
        deSelectNotes();
        _selectedElement = undefined;
    }
    else if (!_isModalOpen) {
        if (e.ctrlKey && e.key === "c") {
            // Copy
            const selectedElements = document.getElementsByClassName("selected");
            const notes = [];
            for (let i = 0; i < selectedElements.length; i++) {
                const selectedlement = selectedElements[i];
                notes.push(convertElementToNote(selectedlement));
            }

            const json = JSON.stringify(notes, null, 2);
            navigator.clipboard.writeText(json).then(() => {
                // Clipboard successfully set
            }, () => {
                // Clipboard write failed, so fallback to session storage
                sessionStorage.setItem("copy", json);
            });
        }
        else if (e.ctrlKey && e.key === "v") {
            // Paste
            let json;
            navigator.clipboard.readText().then(text => {
                // Clipboard successfully read
                json = text;
            }, () => {
                // Clipboard read failed, so fallback to session storage
                json = sessionStorage.getItem("copy");
            }).then(() => {
                const notes = JSON.parse(json);
                importNotes(notes, true);
            });
        }
        else if (e.ctrlKey && e.key == "+") {
            // Zoom in
            _scale *= 1.1;
            e.preventDefault();
            _notesElement.style.transform = `scale(${_scale})`;
        }
        else if (e.ctrlKey && e.key == "-") {
            // Zoom out
            _scale *= 0.9;
            e.preventDefault();
            _notesElement.style.transform = `scale(${_scale})`;
        }
        else if (e.ctrlKey && e.key === "0" /* Ctrl-0 to reset zoom */) {
            _scale = _originalScale;
            e.preventDefault();
            _notesElement.style.transform = `scale(${_scale})`;
        }
        else if (e.key === "a" && e.ctrlKey /* Ctrl-a to select all */) {
            deSelectNotes();
            const elements = document.getElementsByClassName("stickynote");
            for (let i = 0; i < elements.length; i++) {
                elements[i].classList.add("selected");
            }
        }
        else if (e.metaKey || e.shiftKey || e.ctrlKey || e.altKey ||
            e.key === "Alt" || e.key === "Control" || e.key === "Shift" ||
            e.key === "F12" || e.key === "Tab" || e.key === "Meta" || e.key === "w") {
            // Ignore these key combinations
        }
        else if (e.key === "Backspace" || e.key === "Delete") {
            deleteAllNotesByClassFilter("selected", true);
        }
        else {
            console.log(e);
            showNoteDialog();
        }
    }
});

document.getElementById("noteText").addEventListener('keyup', (e) => {
    if (e.key === "Enter" && e.ctrlKey) {
        // Auto submit on Ctrl+Enter
        document.getElementById("updateNoteSaveButton").click();
    }
});

// Based on documentation example:
// https://docs.microsoft.com/en-us/aspnet/core/signalr/javascript-client?view=aspnetcore-6.0&tabs=visual-studio#bsleep
let lockResolver;
if (navigator && navigator.locks && navigator.locks.request) {
    // https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API
    console.log("Browser supports Web Locks API. Trying to prevent tab from sleeping.");
    const promise = new Promise((res) => {
        lockResolver = res;
    });

    navigator.locks.request('stickynotes', { mode: "shared" }, () => {
        return promise;
    });
}

startConnection();

const startTheme = localStorage.getItem("theme");
if (startTheme != null) {
    console.log(startTheme);
    document.getElementsByTagName("html")[0].className = startTheme;
    document.body.classList.add(startTheme);
}
