let notesElement = document.getElementById("notes");

let scale = 1;
let isMove = false;
let isResize = false;
let currentX, currentY, endX, endY;
let sourceElement = undefined;
let selectedElement = undefined;
let pointers = new Array();
let pointerDiff = 0;
let updateSend = new Date();

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
const id = getId();
console.log(id);

const deSelectNotes = () => {
    const matches = document.getElementsByClassName("selected");
    while (matches.length > 0) {
        matches[0].classList.remove("selected");
    }
}

const pointerDown = e => {

    pointers.push(e);
    currentX = e.clientX;
    currentY = e.clientY;

    const width = e.srcElement.offsetWidth;
    const height = e.srcElement.offsetHeight;

    deSelectNotes();
    selectedElement = sourceElement = e.srcElement;
    sourceElement.className = "stickynote selected";
    isResize = e.offsetX >= width * 0.7 && e.offsetY >= height * 0.7;
    e.stopPropagation();
}

const updateNoteMove = (element) => {
    const noteX = Math.floor(element.style.top.replace("px", ""));
    const noteY = Math.floor(element.style.left.replace("px", ""));
    const noteWidth = Math.floor(element.style.width.replace("px", ""));
    const noteHeight = Math.floor(element.style.height.replace("px", ""));
    const noteRotation = Math.floor(element.style.transform.replace("rotateZ(", "").replace("deg)", ""));

    let note = {
        id: element.id,
        text: element.innerText,
        color: element.style.backgroundColor,
        position: {
            x: noteX,
            y: noteY,
            rotation: noteRotation
        },
        width: noteWidth,
        height: noteHeight
    }

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

    if (sourceElement === undefined) {
        if (isMove) {
            endX = currentX - e.clientX;
            endY = currentY - e.clientY;
            currentX = e.clientX;;
            currentY = e.clientY;

            const notes = document.getElementsByClassName("stickynote");
            for (let i = 0; i < notes.length; i++) {
                const element = notes[i];
                element.style.top = `${element.offsetTop - endY}px`;
                element.style.left = `${element.offsetLeft - endX}px`;
            }
        }
        return;
    }

    endX = currentX - e.clientX;
    endY = currentY - e.clientY;
    currentX = e.clientX;;
    currentY = e.clientY;

    if (isResize) {
        const width = Math.floor(sourceElement.style.width.replace("px", ""));
        const height = Math.floor(sourceElement.style.height.replace("px", ""));

        sourceElement.style.width = `${width - endX}px`;
        sourceElement.style.height = `${height - endY}px`;
    }
    else {
        sourceElement.style.top = `${sourceElement.offsetTop - endY}px`;
        sourceElement.style.left = `${sourceElement.offsetLeft - endX}px`;
    }

    if (new Date() - updateSend > 20) {
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

const createOrUpdateNoteElement = (element, note) => {
    element.id = note.id;
    element.innerText = note.text;
    element.className = "stickynote";
    element.style.backgroundColor = note.color;
    element.style.top = `${note.position.x}px`;
    element.style.left = `${note.position.y}px`;
    element.style.transform = `rotateZ(${note.position.rotation}deg)`;
    element.style.width = `${note.width}px`;
    element.style.height = `${note.height}px`;
    element.addEventListener("pointerdown", pointerDown, { passive: true });
    element.addEventListener("dblclick", e => {
        let noteText = prompt("Add note", element.innerText);
        if (noteText === undefined || noteText == null || noteText.length === 0) {
            return;
        }
        element.innerText = noteText;
        note.text = noteText;
        connection.invoke("UpdateNote", id, note);
    });
    element.addEventListener("contextmenu", e => {
        e.preventDefault();
        e.stopPropagation();
        console.log("element contextmenu");

        let noteColor = prompt("Change color", element.style.backgroundColor);
        if (noteColor === undefined || noteColor == null || noteColor.length === 0) {
            return;
        }
        element.style.backgroundColor = noteColor;
        note.color = noteColor;
        connection.invoke("UpdateNote", id, note);
    });
}
const addNote = (noteText, color) => {
    let note = {
        id: generateId(),
        text: noteText,
        color: color,
        position: {
            x: 100,
            y: 100,
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

const showNoteDialog = () => {
    isMove = false;
    pointers = [];
    while (true) {
        let note = prompt("Add note");
        if (note === undefined || note == null || note.length === 0) {
            break;
        }
        addNote(note, "lightyellow");
    }
}

window.addEventListener('focus', () => {
});

window.addEventListener('blur', () => {
});

window.addEventListener('pointerdown', e => {
    deSelectNotes();

    pointerDiff = 0;
    pointers.push(e);
    currentX = e.clientX;
    currentY = e.clientY;
    isMove = true;
});

window.addEventListener('contextmenu', e => {
    e.preventDefault();

    if (sourceElement === undefined) {
        showNoteDialog();
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

connection.on("AllNotes", notes => {
    console.log("Notes:");
    console.log(notes);
    for (let i = 0; i < notes.length; i++) {
        const note = notes[i];
        const element = document.createElement('div');
        createOrUpdateNoteElement(element, note);
        notesElement.insertBefore(element, notesElement.firstChild);
    }
});

connection.on("UpdateNote", note => {
    console.log("UpdateNote:");
    console.log(note);

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

function showHelp() {
    document.getElementById('helpOpen').style.display = 'none';
    document.getElementById('helpClose').style.display = '';
    document.getElementById('help').style.display = '';
}

function hideHelp() {
    document.getElementById('helpOpen').style.display = '';
    document.getElementById('helpClose').style.display = 'none';
    document.getElementById('help').style.display = 'none';
}

document.addEventListener('keyup', (e) => {
    if (e.key === "Escape") {
        deSelectNotes();
        selectedElement = undefined;
    }
    else if (e.key === "Alt" || e.key === "Control" || e.key === "F12" || e.key === "Tab") {
    }
    else if (e.key === "Backspace" || e.key === "Delete") {
        const matches = document.getElementsByClassName("selected");
        while (matches.length > 0) {
            notesElement.removeChild(matches[0]);
        }
        selectedElement = undefined;
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
