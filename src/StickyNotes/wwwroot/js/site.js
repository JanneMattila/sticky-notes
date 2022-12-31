console.log(`StickyNotes.WwwRoot: ${StickyNotes.WwwRoot}`);

let _notesElement = document.getElementById("notes");

let _id;
let _scale = 1;
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

const showErrorDialog = () => {
    if (_isErrorDialogOpen) return;

    _isErrorDialogOpen = true;
    const modalElement = document.getElementById("errorModal");
    const modal = new bootstrap.Modal(modalElement);
    modal.show();
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
        height: noteHeight
    };
}

const importNotes = (notes, randomize) => {
    if (notes !== undefined && notes.length !== undefined) {
        deSelectNotes();

        const elementsCreated = [];
        let minX = 9999999999, maxX = -9999999999, minY = 9999999999, maxY = -9999999999;
        for (let i = 0; i < notes.length; i++) {
            const note = notes[i];

            if (note.position.x < minX) minX = note.position.x;
            if (note.position.y < minY) minY = note.position.y;
        }
        for (let i = 0; i < notes.length; i++) {
            const note = notes[i];
            if (randomize) {
                note.id = generateId();
                note.position.x += 100 - minX;
                note.position.y += 100 - minY;
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

    _endX = Math.floor(_currentX - clientX);
    _endY = Math.floor(_currentY - clientY);
    _currentX = clientX;
    _currentY = clientY;

    if (_sourceElement === undefined) {
        if (_isMove) {
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

const editNoteMenu = (element, note) => {
    _isModalOpen = true;

    const modalElement = document.getElementById("noteModal");
    const noteTextElement = document.getElementById("noteText");
    const noteLinkElement = document.getElementById("noteLink");
    const noteColorSelectElement = document.getElementById("noteColor");
    const updateNoteSaveButtonElement = document.getElementById("updateNoteSaveButton");

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

    const dialogShown = e => {
        noteTextElement.focus();
    }

    const dialogClosed = e => {
        _isModalOpen = false;

        updateNoteSaveButtonElement.removeEventListener("click", updateNoteSaveButtonClick);
        modalElement.removeEventListener("shown.bs.modal", dialogShown);
        modalElement.removeEventListener("hidden.bs.modal", dialogClosed);
    }

    updateNoteSaveButtonElement.addEventListener("click", updateNoteSaveButtonClick);
    modalElement.addEventListener("shown.bs.modal", dialogShown);
    modalElement.addEventListener("hidden.bs.modal", dialogClosed);

    noteTextElement.value = note.text;
    noteLinkElement.value = note.link;
    noteColorSelectElement.value = note.color;

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
        if (e.ctrlKey && note.link !== undefined && note.link !== "") {
            window.open(note.link, "_blank");
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
            if (confirm("Do you really want to delete this note?")) {
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

    deSelectNotes();

    _pointerDiff = 0;
    _pointers.push(e);
    _currentX = e.clientX / _scale;
    _currentY = e.clientY / _scale;
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
            const newId = generateId();

            await addNote("Next", `${newId}`, "lightblue", true);
            document.location.href = `${StickyNotes.WwwRoot}${newId}?parent=${currentId}`;
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
        }

        const dialogClosed = e => {
            if (!newDialogOpened) {
                _isModalOpen = false;
            }
            menuAddNotesElement.removeEventListener("click", menuAddNotesButtonClick);
            menuZoomOutElement.removeEventListener("click", menuZoomOutClick);
            menuStartNewSessionElement.removeEventListener("click", menuStartNewSessionButtonClick);
            menuStartNewSessionWithLinkElement.removeEventListener("click", menuStartNewSessionWithLinkButtonClick);
            menuRemoveAllNotesElement.removeEventListener("click", menuRemoveAllNotesButtonClick);
            menuThemeElement.removeEventListener("click", menuThemeButtonClick);
            modalElement.removeEventListener("hidden.bs.modal", dialogClosed);
        }

        menuAddNotesElement.addEventListener("click", menuAddNotesButtonClick);
        menuZoomOutElement.addEventListener("click", menuZoomOutClick);
        menuStartNewSessionElement.addEventListener("click", menuStartNewSessionButtonClick);
        menuStartNewSessionWithLinkElement.addEventListener("click", menuStartNewSessionWithLinkButtonClick);
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
});

const startConnection = () => {
    if (_imported) return;

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
            console.log(err);
            showErrorDialog();
        });
}

const zoomOut = notes => {
    deleteAllNotesByClassFilter("stickynote", false);
    let minX = 9999999999, maxX = -9999999999, minY = 9999999999, maxY = -9999999999;
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

    zoomOut(notes);
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

document.addEventListener('keyup', (e) => {
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
        else if (e.metaKey || e.shiftKey || e.ctrlKey ||
            e.key === "Alt" || e.key === "Control" || e.key === "Shift" ||
            e.key === "F12" || e.key === "Tab" || e.key === "Meta") {
            // Ignore
        }
        else if (e.key === "Backspace" || e.key === "Delete") {
            deleteAllNotesByClassFilter("selected", true);
        }
        else if (e.key === "a" && e.ctrlKey /* Ctrl-a to select all */) {
            deSelectNotes();
            const elements = document.getElementsByClassName("stickynote");
            for (let i = 0; i < elements.length; i++) {
                elements[i].classList.add("selected");
            }
        }
        else if (e.key === "0" && e.ctrlKey /* Ctrl-0 to reset zoom */) {
            _scale = 1.0;
            _notesElement.style.transform = `scale(${_scale})`;
        }
        else if (!e.altKey) {
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
