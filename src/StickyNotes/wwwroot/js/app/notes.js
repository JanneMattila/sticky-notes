// ---------------------------------------------------------------------------
// Notes: model, rendering, sync and edit dialogs
//
// Notes are represented both as plain objects (synced over SignalR) and as DOM
// `.stickynote` divs on the canvas. This module owns the conversion between the
// two, the create/update/delete flows, and the note edit / rotation dialogs. It
// also registers the AllNotes / UpdateNotes / DeleteNotes hub handlers.
// ---------------------------------------------------------------------------

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
                const importSettingsNote = (json || []).find(n => n.id === SETTINGS_NOTE_ID);
                if (importSettingsNote) applySettingsFromNote(importSettingsNote);
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

const deSelectNotes = () => {
    const matches = document.getElementsByClassName("selected");
    while (matches.length > 0) {
        matches[0].classList.remove("selected");
    }
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

// Creates a fresh DOM element for a note and inserts it at the top of the
// canvas z-order. Shared by import, add, zoom-to-fit and the UpdateNotes handler.
const renderNoteIntoCanvas = note => {
    const element = document.createElement('div');
    createOrUpdateNoteElement(element, note);
    _notesElement.insertBefore(element, _notesElement.firstChild);
    return element;
}

const importNotes = (notes, randomize) => {
    if (randomize && isReadonly()) return;
    if (notes !== undefined && notes.length !== undefined) {
        deSelectNotes();

        const elementsCreated = [];
        const { minX, minY } = computeBounds(notes);
        for (let i = 0; i < notes.length; i++) {
            const note = notes[i];
            if (isReservedNote(note)) continue;
            if (randomize) {
                note.id = generateId();
                note.position.x += _lastCanvasClickX - minX;
                note.position.y += _lastCanvasClickY - minY;
                note.position.rotation = Math.floor(Math.random() * 8) - 4;
            }
            const element = renderNoteIntoCanvas(note);
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
    if (isReadonly()) return;

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

    // Read-only board: the editor becomes view-only (no Save, no markdown editing).
    updateNoteSaveButtonElement.classList.toggle("d-none", isReadonly());
    if (noteEditMarkdownButtonElement) {
        noteEditMarkdownButtonElement.classList.toggle("d-none", isReadonly());
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

        // Read-only boards only allow viewing; hide actions that mutate notes.
        const mutatingMenuItems = [noteMenuBringToFrontElement, noteMenuSendToBackElement, noteMenuNoteSettingsElement, noteMenuDeleteNoteElement];
        mutatingMenuItems.forEach(item => item && item.classList.toggle("d-none", isReadonly()));

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
                    deleteNotesOnServer([note.id]);
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
    const element = renderNoteIntoCanvas(note);

    await updateNoteElementsToServer([element]);
}

const deleteAllNotesByClassFilter = (filter, remove) => {
    if (remove && isReadonly()) return;
    const matches = document.getElementsByClassName(filter);
    let noteIds = [];
    while (matches.length > 0) {
        noteIds.push(matches[0].id);
        _notesElement.removeChild(matches[0]);
    }

    if (remove && !_imported) {
        deleteNotesOnServer(noteIds, showErrorDialog);
    }
    _selectedElement = undefined;
}

const showNoteDialog = () => {
    _isMove = false;
    _pointers = [];
    if (_isModalOpen) {
        return;
    }
    if (isReadonly()) return;

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

connection.on("AllNotes", notes => {
    console.log("Notes:");
    console.log(notes);

    if (_isInitialNotesLoadPending) {
        _isInitialNotesLoadPending = false;
        setInitialNotesLoadingVisible(false);
    }

    const settingsNote = (notes || []).find(n => n.id === SETTINGS_NOTE_ID);
    if (settingsNote) {
        applySettingsFromNote(settingsNote);
    } else {
        resetSettingsDefault();
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
        if (isReservedNote(note)) {
            applySettingsFromNote(note);
            continue;
        }
        note.position.x -= _coordinateAdjustX;
        note.position.y -= _coordinateAdjustY;

        let element = document.getElementById(note.id);
        if (element === undefined || element == null) {
            renderNoteIntoCanvas(note);
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
