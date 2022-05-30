let notesElement = document.getElementById("notes");

let scale = 1;
let isMove = false;
let isResize = false;
let isModalOpen = false;
let currentX, currentY, endX, endY;
let sourceElement = undefined;
let selectedElement = undefined;
let pointers = new Array();
let pointerDiff = 0;
let updateSend = new Date();
let coordinateAdjustX = 0, coordinateAdjustY = 0;

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

    pointers.push(e);
    currentX = e.clientX / scale;
    currentY = e.clientY / scale;

    const width = e.srcElement.offsetWidth;
    const height = e.srcElement.offsetHeight;

    deSelectNotes();
    selectedElement = sourceElement = e.srcElement;
    sourceElement.className = "stickynote selected";
    isResize = e.offsetX >= width * 0.7 && e.offsetY >= height * 0.7;
    e.stopPropagation();
}

const updateNoteMove = (element) => {
    const noteX = Math.floor(element.style.left.replace("px", ""));
    const noteY = Math.floor(element.style.top.replace("px", ""));
    const noteZ = Math.floor(element.style.zIndex);
    const noteWidth = Math.floor(element.style.width.replace("px", ""));
    const noteHeight = Math.floor(element.style.height.replace("px", ""));
    const noteRotation = Math.floor(element.style.transform.replace("rotateZ(", "").replace("deg)", ""));

    console.log(`${noteX},${noteY}`);

    let note = {
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
    }

    console.log(note);
    connection.invoke("UpdateNote", id, note)
        .then(function () {
            console.log("updateNoteMove called");
        })
        .catch(function (err) {
            console.log("updateNoteMove error");
            console.log(err);
        });
}

const pointerMove = e => {
    e.stopPropagation();

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
    }
    else {
        sourceElement.style.left = `${sourceElement.offsetLeft - endX}px`;
        sourceElement.style.top = `${sourceElement.offsetTop - endY}px`;
    }

    if (new Date() - updateSend > 80) {
        updateNoteMove(sourceElement);
        updateSend = new Date();
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
        updateNoteMove(sourceElement);
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

        note.text = element.innerText = noteTextElement.value;
        note.color = element.style.backgroundColor = noteColorSelectElement.value;
        connection.invoke("UpdateNote", id, note);
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
                connection.invoke("DeleteNote", id, note.id)
                    .then(function () {
                        console.log("DeleteNote called");
                    })
                    .catch(function (err) {
                        console.log("DeleteNote error");
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

const addNote = (noteText, color) => {
    let note = {
        id: generateId(),
        text: noteText,
        color: color,
        position: {
            x: 100 - coordinateAdjustX,
            y: 100 - coordinateAdjustY,
            z: 100,
            rotation: Math.floor(Math.random() * 8) - 4
        },
        width: 100,
        height: 100
    }
    let element = document.createElement('div');
    createOrUpdateNoteElement(element, note);
    notesElement.insertBefore(element, notesElement.firstChild);

    console.log("Calling UpdateNote:");
    console.log(note);
    connection.invoke("UpdateNote", id, note)
        .then(function () {
            console.log("UpdateNote called");
        })
        .catch(function (err) {
            console.log("UpdateNote error");
            console.log(err);
        });
}

const deleteAllNotesByClassFilter = filter => {
    const matches = document.getElementsByClassName(filter);
    while (matches.length > 0) {
        connection.invoke("DeleteNote", id, matches[0].id)
            .then(function () {
                console.log("DeleteNote called");
            })
            .catch(function (err) {
                console.log("DeleteNote error");
                console.log(err);
            });
        notesElement.removeChild(matches[0]);
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
});

window.addEventListener('blur', () => {
});

window.addEventListener('pointerdown', e => {
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
                deleteAllNotesByClassFilter("stickynote");
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

connection.on('notes', function (msg) {
    let data = "Date received: " + new Date().toLocaleTimeString();
    data += "\n" + msg.body;
    addMessage(data);
});

connection.onclose(function (e) {
    if (e) {
        addMessage("Connection closed with error: " + e);
    }
    else {
        addMessage("Disconnected");
    }
});

connection.start()
    .then(function () {
        // Connected
        connection.invoke("Join", id);
    })
    .catch(function (err) {
        addMessage(err);
    });

const zoomOut = notes => {
    deleteAllNotesByClassFilter("stickynote");
    let minX = 9999999999, maxX = -9999999999, minY = 9999999999, maxY = -9999999999;
    for (let i = 0; i < notes.length; i++) {
        const note = notes[i];

        if (note.position.x < minX) minX = note.position.x;
        if (note.position.x + note.width > maxX) maxX = note.position.x + note.width;

        if (note.position.y < minY) minY = note.position.y;
        if (note.position.y + note.height > maxY) maxY = note.position.y + note.height;
    }

    const deltaX = Math.abs(maxX - minX + 20);
    const deltaY = Math.abs(maxY - minY + 20);

    console.log(`${minX},${maxX} - ${minY},${maxY}`);

    const scaleX = document.documentElement.clientWidth / deltaX;
    const scaleY = document.documentElement.clientHeight / deltaY;

    if (scaleX <= 1 && scaleY <= 1) {
        // We must scale both axes to fit the screen
        console.log("scale both axes");
        scale = Math.min(scaleX, scaleY);
        coordinateAdjustX = minX - 10;
        coordinateAdjustY = minY - 10;
    }
    else if (scaleX < 1 && scaleX < scaleY) {
        console.log("scale x axes");
        scale = scaleX;
        coordinateAdjustX = scaleX * minX - 10;
        coordinateAdjustY = minY - document.documentElement.clientHeight / 2 + deltaY / 2;
    }
    else if (scaleY < 1 && scaleY < scaleX) {
        console.log("scale y axes");
        scale = scaleY;
        coordinateAdjustX = minX - document.documentElement.clientWidth / 2 + deltaX / 2;
        coordinateAdjustY = scaleY * minY - 10;
    }
    else {
        // No need to scale but let's center
        console.log("no scale required, centering");
        scale = 1.0;
        coordinateAdjustX = minX - document.documentElement.clientWidth / 2 + deltaX / 2;
        coordinateAdjustY = minY - document.documentElement.clientHeight / 2 + deltaY / 2;
    }

    console.log(`${coordinateAdjustX},${coordinateAdjustY}`);

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

connection.on("UpdateNote", note => {
    console.log("UpdateNote:");
    console.log(note);

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
});

connection.on("DeleteNote", noteId => {
    console.log("DeleteNote:");
    console.log(noteId);

    const element = document.getElementById(noteId);
    if (element) {
        notesElement.removeChild(element);
    }
});

document.addEventListener('keyup', (e) => {
    if (e.key === "Escape") {
        deSelectNotes();
        selectedElement = undefined;
    }
    else if (e.key === "Alt" || e.key === "Control" || e.key === "F12" || e.key === "Tab") {
    }
    else if (e.key === "Backspace" || e.key === "Delete") {
        deleteAllNotesByClassFilter("selected");
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
});
