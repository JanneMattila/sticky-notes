let notesElement = document.getElementById("notes");

let scale = 1;
let isMove = false;
let isResize = false;
let isModalOpen = false;
let currentX = 100, currentY = 100;
let endX, endY;
let sourceElement = undefined;
let selectedElement = undefined;
let pointers = new Array();
let pointerDiff = 0;
let updateSend = new Date();
let coordinateAdjustX = 0, coordinateAdjustY = 0;

const showErrorDialog = () => {
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

const getId = () => {
    let id = document.location.hash.replace("#", "");
    if (id.length === 0) {
        id = generateId();
        document.location.hash = id;
    }

    document.querySelector('meta[property="og:url"]').setAttribute("content", document.location.href);
    return id;
}
let id = getId();
console.log(id);

window.addEventListener("hashchange", e => {
    if (e.oldURL.indexOf("#") != -1) {
        console.log("hashchange event occured!");
        connection.invoke("Leave", id)
            .then(function () {
                console.log("Leave called");

                id = getId();
                console.log(id);

                const matches = document.getElementsByClassName("stickynote");
                while (matches.length > 0) {
                    notesElement.removeChild(matches[0]);
                }
                selectedElement = selectedElement = undefined;
                pointers = [];
                scale = 1;
                isMove = false;
                isResize = false;
                isModalOpen = false;
                coordinateAdjustX = coordinateAdjustY = 0;

                connection.invoke("Join", id);
            })
            .catch(function (err) {
                console.log("Leave error");
                console.log(err);
                showErrorDialog();
            });
    }
});

const deSelectNotes = () => {
    const matches = document.getElementsByClassName("selected");
    while (matches.length > 0) {
        matches[0].classList.remove("selected");
    }
}

const pointerDown = e => {
    if (isModalOpen) return;

    pointers.push(e);
    currentX = e.clientX / scale;
    currentY = e.clientY / scale;

    const width = e.srcElement.offsetWidth;
    const height = e.srcElement.offsetHeight;

    if (e.ctrlKey) {
        // Ctrl+pointer enables multi-select
    }
    else {
        deSelectNotes();
    }
    selectedElement = sourceElement = e.srcElement;
    sourceElement.className = "stickynote selected";
    isResize = e.offsetX >= width * 0.7 && e.offsetY >= height * 0.6;
    e.stopPropagation();
}

const convertElementToNote = (element) => {
    const noteX = Math.floor(element.style.left.replace("px", ""));
    const noteY = Math.floor(element.style.top.replace("px", ""));
    const noteZ = Math.floor(element.style.zIndex);
    const noteWidth = Math.floor(element.style.width.replace("px", ""));
    const noteHeight = Math.floor(element.style.height.replace("px", ""));
    const noteRotation = Math.floor(element.style.transform.replace("rotateZ(", "").replace("deg)", ""));

    return {
        id: element.id,
        text: element.innerText,
        color: element.style.backgroundColor,
        position: {
            x: noteX + coordinateAdjustX,
            y: noteY + coordinateAdjustY,
            z: noteZ,
            rotation: noteRotation
        },
        width: noteWidth,
        height: noteHeight
    };
}

const updateNoteElementsToServer = (elements) => {
    let notes = [];
    for (let i = 0; i < elements.length; i++) {
        const element = elements[i];
        let note = convertElementToNote(element);
        notes.push(note);
    }
    connection.invoke("UpdateNotes", id, notes)
        .then(function () {
            console.log("updateNoteMove called");
        })
        .catch(function (err) {
            console.log("updateNoteMove error");
            console.log(err);
            showErrorDialog();
        });
}

const pointerMove = e => {
    e.stopPropagation();
    if (isModalOpen) return;

    const clientX = e.clientX / scale;
    const clientY = e.clientY / scale;

    for (let i = 0; i < pointers.length; i++) {
        if (pointers[i].pointerId == e.pointerId) {
            pointers[i] = e;
            break;
        }
    }
    if (pointers.length > 1) {
        // Handle gesture
        console.log("handle gesture: " + pointers.length);
        if (pointers.length === 2) {
            // Support pinch and zoom
            const diffX = Math.abs(pointers[0].clientX - pointers[1].clientX);
            const diffY = Math.abs(pointers[0].clientY - pointers[1].clientY);
            const diff = Math.sqrt(diffX * diffX + diffY * diffY);
            if (pointerDiff > 0) {
                const delta = pointerDiff - diff;
                scale += delta * -0.001;
                scale = Math.min(Math.max(0.1, scale), 10);
                notesElement.style.transform = `scale(${scale})`;
            }
            //else {
            //    console.log("TODO: Calculate center position");
            //    console.log({ p1X: pointers[0].clientX, p1Y: pointers[0].clientY });
            //    console.log({ p2X: pointers[1].clientX, p2Y: pointers[1].clientY });

            //    const centerX = pointers[0].clientX + (pointers[1].clientX - pointers[0].clientX) / 2;
            //    const centerY = pointers[0].clientY + (pointers[1].clientY - pointers[0].clientY) / 2;
            //    console.log({ centerX, centerY, coordinateAdjustX, coordinateAdjustY });

            //    const elements = document.getElementsByClassName("stickynote");
            //    for (let i = 0; i < elements.length; i++) {
            //        const element = elements[i];
            //        let noteX = Math.floor(element.style.left.replace("px", ""));
            //        let noteY = Math.floor(element.style.top.replace("px", ""));
            //        console.log({ noteX, noteY });
            //        noteX = centerX - noteX + coordinateAdjustX;
            //        noteY = centerY - noteY + coordinateAdjustY;
            //        console.log({ noteX, noteY });

            //        //element.style.left = `${noteX}px`;
            //        //element.style.top = `${noteY}px`;
            //    }

            //    coordinateAdjustX = -centerX;
            //    coordinateAdjustY = -centerY;
            //}
            pointerDiff = diff;
        }
        return;
    }

    endX = currentX - clientX;
    endY = currentY - clientY;
    currentX = clientX;
    currentY = clientY;

    if (sourceElement === undefined) {
        if (isMove) {
            const notes = document.getElementsByClassName("stickynote");
            coordinateAdjustX += endX;
            coordinateAdjustY += endY;
            for (let i = 0; i < notes.length; i++) {
                const element = notes[i];
                element.style.left = `${element.offsetLeft - endX}px`;
                element.style.top = `${element.offsetTop - endY}px`;
            }
        }
        return;
    }

    if (isResize) {
        const width = Math.floor(sourceElement.style.width.replace("px", ""));
        const height = Math.floor(sourceElement.style.height.replace("px", ""));

        sourceElement.style.width = `${width - endX}px`;
        sourceElement.style.height = `${height - endY}px`;

        if (new Date() - updateSend > 80) {
            updateNoteElementsToServer([sourceElement]);
            updateSend = new Date();
        }
    }
    else {
        // Move all selected notes
        const sourceElements = document.getElementsByClassName("selected");
        for (let i = 0; i < sourceElements.length; i++) {
            const selectedSourceElement = sourceElements[i];
            selectedSourceElement.style.left = `${selectedSourceElement.offsetLeft - endX}px`;
            selectedSourceElement.style.top = `${selectedSourceElement.offsetTop - endY}px`;
        }
        if (new Date() - updateSend > 80) {
            updateNoteElementsToServer(sourceElements);
            updateSend = new Date();
        }
    }
}

const pointerUp = e => {
    isMove = false;
    for (let i = 0; i < pointers.length; i++) {
        const p = pointers[i];
        if (p.pointerId == e.pointerId) {
            pointers.splice(i, 1);
            break;
        }
    }

    if (sourceElement !== undefined) {
        const sourceElements = document.getElementsByClassName("selected");
        updateNoteElementsToServer(sourceElements);
    }
    sourceElement = undefined;
    e.stopPropagation();
}

window.addEventListener("pointermove", pointerMove, { passive: true });
window.addEventListener("pointerup", pointerUp);
window.addEventListener("wheel", e => {
    scale += e.deltaY * -0.001;
    scale = Math.min(Math.max(0.1, scale), 10);
    notesElement.style.transform = `scale(${scale})`;
});

let protocol = new signalR.JsonHubProtocol();
let hubRoute = "Notes";
let connection = new signalR.HubConnectionBuilder()
    .withUrl(hubRoute)
    .withAutomaticReconnect()
    .withHubProtocol(protocol)
    .build();

const editNoteMenu = (element, note) => {
    const modalElement = document.getElementById("colorModal");
    const noteTextElement = document.getElementById("noteText");
    const noteColorSelectElement = document.getElementById("noteColor");
    const updateNoteSaveButtonElement = document.getElementById("updateNoteSaveButton");

    const updateNoteSaveButtonClick = e => {
        modal.hide();

        const isTextUpdated = noteTextElement.value !== element.innerText;
        note.text = element.innerText = noteTextElement.value;
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
        isModalOpen = true;
        noteTextElement.focus();
    }

    const dialogClosed = e => {
        isModalOpen = false;

        updateNoteSaveButtonElement.removeEventListener("click", updateNoteSaveButtonClick);
        modalElement.removeEventListener("shown.bs.modal", dialogShown);
        modalElement.removeEventListener("hidden.bs.modal", dialogClosed);
    }

    updateNoteSaveButtonElement.addEventListener("click", updateNoteSaveButtonClick);
    modalElement.addEventListener("shown.bs.modal", dialogShown);
    modalElement.addEventListener("hidden.bs.modal", dialogClosed);

    noteTextElement.value = note.text;
    noteColorSelectElement.value = note.color;

    const modal = new bootstrap.Modal(modalElement);
    modal.show();
};

const createOrUpdateNoteElement = (element, note) => {
    element.id = note.id;
    element.innerText = note.text;
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
        pointers = [];
        editNoteMenu(element, note);
    });
    element.addEventListener("contextmenu", e => {
        pointers = [];

        e.preventDefault();
        e.stopPropagation();

        isModalOpen = true;

        const modalElement = document.getElementById("noteMenuModal");
        const noteMenuEditNoteElement = document.getElementById("noteMenuEditNote");
        const noteMenuDeleteNoteElement = document.getElementById("noteMenuDeleteNote");

        let newDialogOpened = false;
        const menuEditNoteButtonClick = e => {
            modal.hide();

            newDialogOpened = true;
            isModalOpen = false;
            editNoteMenu(element, note);
        }
        const menuDeleteNoteButtonClick = e => {
            modal.hide();

            console.log(note.id);
            if (confirm("Do you really want to delete this note?")) {
                connection.invoke("DeleteNotes", id, [note.id])
                    .then(function () {
                        console.log("DeleteNotes called");
                    })
                    .catch(function (err) {
                        console.log("DeleteNotes error");
                        console.log(err);
                    });
                notesElement.removeChild(element);
            }
        }

        const dialogClosed = e => {
            if (!newDialogOpened) {
                isModalOpen = false;
            }
            noteMenuEditNoteElement.removeEventListener("click", menuEditNoteButtonClick);
            noteMenuDeleteNoteElement.removeEventListener("click", menuDeleteNoteButtonClick);
            modalElement.removeEventListener("hidden.bs.modal", dialogClosed);
        }

        noteMenuEditNoteElement.addEventListener("click", menuEditNoteButtonClick);
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
        let rowWidth = line.length * 16;
        if (width < rowWidth) {
            width = rowWidth;
        }
    }
    height = Math.max(100, 32 /* row height */ * lines.length);

    console.log({ lines: lines.length, height, width });
    return { width, height };
}

const addNote = (noteText, color) => {
    const size = calculateNoteSize(noteText);
    let note = {
        id: generateId(),
        text: noteText,
        color: color,
        position: {
            x: currentX - 100 + 200 * Math.random(),
            y: currentY - 100 + 200 * Math.random(),
            z: 100,
            rotation: Math.floor(Math.random() * 8) - 4
        },
        width: size.width,
        height: size.height
    }
    let element = document.createElement('div');
    createOrUpdateNoteElement(element, note);
    notesElement.insertBefore(element, notesElement.firstChild);

    updateNoteElementsToServer([element]);
}

const deleteAllNotesByClassFilter = (filter, remove) => {
    const matches = document.getElementsByClassName(filter);
    let noteIds = [];
    while (matches.length > 0) {
        noteIds.push(matches[0].id);
        notesElement.removeChild(matches[0]);
    }

    if (remove) {
        connection.invoke("DeleteNotes", id, noteIds)
            .then(function () {
                console.log("DeleteNotes by filter called");
            })
            .catch(function (err) {
                console.log("DeleteNotes by filter error");
                console.log(err);
                showErrorDialog();
            });
    }
    selectedElement = undefined;
}

const showNoteDialog = () => {
    isMove = false;
    pointers = [];
    if (isModalOpen) {
        return;
    }

    isModalOpen = true;
    const modalElement = document.getElementById("colorModal");
    const noteTextElement = document.getElementById("noteText");
    const noteColorSelectElement = document.getElementById("noteColor");
    const updateNoteSaveButtonElement = document.getElementById("updateNoteSaveButton");

    noteTextElement.value = "";
    noteColorSelectElement.value = "lightyellow";
    let addedNotes = [];

    const updateNoteSaveButtonClick = e => {

        if (noteTextElement.value.length !== 0) {
            addedNotes.push({ text: noteTextElement.value, color: noteColorSelectElement.value });
            noteTextElement.value = "";
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
        isModalOpen = false;

        updateNoteSaveButtonElement.removeEventListener("click", updateNoteSaveButtonClick);
        modalElement.removeEventListener("shown.bs.modal", dialogShown);
        modalElement.removeEventListener("hidden.bs.modal", dialogClosed);

        for (let i = 0; i < addedNotes.length; i++) {
            const addedNote = addedNotes[i];
            addNote(addedNote.text, addedNote.color);
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
    if (isModalOpen) return;

    deSelectNotes();

    pointerDiff = 0;
    pointers.push(e);
    currentX = e.clientX / scale;
    currentY = e.clientY / scale;
    isMove = true;
});

window.addEventListener('contextmenu', e => {
    e.preventDefault();

    if (sourceElement === undefined) {
        isModalOpen = true;

        const modalElement = document.getElementById("menuModal");
        const menuAddNotesElement = document.getElementById("menuAddNotes");
        const menuRemoveAllNotesElement = document.getElementById("menuRemoveAllNotes");

        let newDialogOpened = false;
        const menuAddNotesButtonClick = e => {
            modal.hide();

            newDialogOpened = true;
            isModalOpen = false;
            showNoteDialog();
        }
        const menuRemoveAllNotesButtonClick = e => {
            modal.hide();

            if (confirm("Do you really want to delete all notes?")) {
                deleteAllNotesByClassFilter("stickynote", true);
            }
        }

        const dialogClosed = e => {
            if (!newDialogOpened) {
                isModalOpen = false;
            }
            menuAddNotesElement.removeEventListener("click", menuAddNotesButtonClick);
            menuRemoveAllNotesElement.removeEventListener("click", menuRemoveAllNotesButtonClick);
            modalElement.removeEventListener("hidden.bs.modal", dialogClosed);
        }

        menuAddNotesElement.addEventListener("click", menuAddNotesButtonClick);
        menuRemoveAllNotesElement.addEventListener("click", menuRemoveAllNotesButtonClick);
        modalElement.addEventListener("hidden.bs.modal", dialogClosed);

        const modal = new bootstrap.Modal(modalElement);
        modal.show();
    }
});

connection.onclose(err => {
    console.log(`onclose: ${err}`);
});

const startConnection = () => {
    connection.start()
        .then(function () {
            // Connected
            connection.invoke("Join", id);
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
        scale = scaleX;
        coordinateAdjustX = minX - 20 - (document.documentElement.clientWidth - deltaX * scale) / 2;
        coordinateAdjustY = minY - 20 - (document.documentElement.clientHeight - deltaY * scale) / 2;
    }
    else if (scaleY < 1 && scaleY <= scaleX) {
        console.log("scale y axes: " + scaleY);
        scale = scaleY;
        coordinateAdjustX = minX - 20 - (document.documentElement.clientWidth - deltaX * scale) / 2;
        coordinateAdjustY = minY - 20 - (document.documentElement.clientHeight - deltaY * scale) / 2;
    }
    else {
        // No need to scale but let's center
        console.log("no scale required, centering");
        scale = 1.0;
        coordinateAdjustX = minX - document.documentElement.clientWidth / 2 + deltaX / 2;
        coordinateAdjustY = minY - document.documentElement.clientHeight / 2 + deltaY / 2;
    }

    for (let i = 0; i < notes.length; i++) {
        const note = notes[i];

        note.position.x -= coordinateAdjustX;
        note.position.y -= coordinateAdjustY;

        const element = document.createElement('div');
        createOrUpdateNoteElement(element, note);
        notesElement.insertBefore(element, notesElement.firstChild);
    }

    notesElement.style.transform = `scale(${scale})`;
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
        note.position.x -= coordinateAdjustX;
        note.position.y -= coordinateAdjustY;

        let element = document.getElementById(note.id);
        if (element === undefined || element == null) {
            element = document.createElement('div');
            createOrUpdateNoteElement(element, note);
            notesElement.insertBefore(element, notesElement.firstChild);
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
            notesElement.removeChild(element);
        }
    }
});

document.addEventListener('keyup', (e) => {
    if (e.key === "Escape") {
        deSelectNotes();
        selectedElement = undefined;
    }
    else if (!isModalOpen) {
        if (e.ctrlKey && e.key === "c") {
            // Copy
            const selectedElements = document.getElementsByClassName("selected");
            const notes = [];
            for (let i = 0; i < selectedElements.length; i++) {
                const selectedlement = selectedElements[i];
                notes.push(convertElementToNote(selectedlement));
            }
            sessionStorage.setItem("copy", JSON.stringify(notes));
        }
        else if (e.ctrlKey && e.key === "v") {
            // Paste
            const json = sessionStorage.getItem("copy");
            console.log(json);

            const notes = JSON.parse(json);
            if (notes !== undefined && notes.length !== undefined) {
                const elementsCreated = [];
                for (let i = 0; i < notes.length; i++) {
                    const note = notes[i];
                    note.id = generateId();
                    note.position.x += 100;
                    note.position.y += 100;
                    note.position.rotation = Math.floor(Math.random() * 8) - 4;
                    let element = document.createElement('div');
                    createOrUpdateNoteElement(element, note);
                    notesElement.insertBefore(element, notesElement.firstChild);
                    elementsCreated.push(element);
                }

                if (elementsCreated.length > 0) {
                    updateNoteElementsToServer(elementsCreated);
                }
            }
        }
        else if (e.key === "Alt" || e.key === "Control" || e.key === "F12" || e.key === "Tab" ||
            (e.ctrlKey && (e.key === "w" || e.key === "r"))) {
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
            scale = 1.0;
            notesElement.style.transform = `scale(${scale})`;
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
