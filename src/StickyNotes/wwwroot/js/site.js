let notesElement = document.getElementById("notes");

let isMove = false;
let isResize = false;
let currentX, currentY, endX, endY;
let sourceElement = undefined;
let selectedElement = undefined;

const deselectNotes = () => {
    const selectedElements = document.getElementsByClassName("selected");
    for (let i = 0; i < selectedElements.length; i++) {
        const element = selectedElements[i];
        element.className = element.className.replace("selected");
    }
}

const pointerDown = e => {
    currentX = e.clientX;
    currentY = e.clientY;

    const width = e.srcElement.offsetWidth;
    const height = e.srcElement.offsetHeight;

    deselectNotes();
    selectedElement = sourceElement = e.srcElement;
    sourceElement.className += " selected";
    isResize = e.offsetX >= width * 0.7 && e.offsetY >= height * 0.7;
    e.stopPropagation();
}

const pointerMove = e => {
    e.stopPropagation();

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
}

const pointerUp = e => {
    isMove = false;
    sourceElement = undefined;
    e.stopPropagation();
}

window.addEventListener("pointermove", pointerMove, { passive: true });
window.addEventListener("pointerup", pointerUp);

let protocol = new signalR.JsonHubProtocol();
let hubRoute = "Notes";
let connection = new signalR.HubConnectionBuilder()
    .withUrl(hubRoute)
    .withAutomaticReconnect()
    .withHubProtocol(protocol)
    .build();

const addNote = (note) => {
    let element = document.createElement('div');
    element.innerText = note;
    element.className = "stickynote";
    element.style.width = "100px";
    element.style.height = "100px";
    element.style.transform = `rotateZ(${Math.floor(Math.random() * 8) - 4}deg)`;
    element.addEventListener("pointerdown", pointerDown, { passive: true });
    element.addEventListener("dblclick", e => {
        let note = prompt("Add note", element.innerText);
        if (note === undefined || note == null || note.length === 0) {
            return;
        }
        element.innerText = note;
    });
    element.addEventListener("contextmenu", e => {
        e.preventDefault();
        e.stopPropagation();
        console.log("element contextmenu");
    });
    notesElement.insertBefore(element, notesElement.firstChild);
}

const showNoteDialog = () => {
    isMove = false;

    while (true) {
        let note = prompt("Add note");
        if (note === undefined || note == null || note.length === 0) {
            break;
        }
        addNote(note);
    }
}

window.addEventListener('focus', () => {
});

window.addEventListener('blur', () => {
});

window.addEventListener('pointerdown', e => {
    deselectNotes();

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
    })
    .catch(function (err) {
        addMessage(err);
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
    if (e.key === "Escape" || e.key === "Alt" || e.key === "F12" || e.key === "Tab") {
    }
    else if (e.key === "Backspace" || e.key === "Delete") {
        if (selectedElement !== undefined) {
            notesElement.removeChild(selectedElement);
            selectedElement = undefined;
        }
    }
    else if (!e.altKey) {
        console.log(e);
        showNoteDialog();
    }
});
