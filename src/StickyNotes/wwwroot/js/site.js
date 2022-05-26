let notesElement = document.getElementById("notes");

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
    currentX = e.clientX || e.changedTouches[0].pageX;
    currentY = e.clientY || e.changedTouches[0].pageY;

    const width = e.srcElement.offsetWidth;
    const height = e.srcElement.offsetHeight;
    const offsetX = e.offsetX || e.changedTouches[0].screenX - e.changedTouches[0].clientX;
    const offsetY = e.offsetY || e.changedTouches[0].screenY - e.changedTouches[0].clientY;

    deselectNotes();
    selectedElement = sourceElement = e.srcElement;
    sourceElement.className += " selected";
    isResize = offsetX >= width * 0.7 && offsetY >= height * 0.7;
    e.preventDefault();
}

const pointerMove = e => {
    if (sourceElement === undefined) {
        return;
    }

    const currentClientX = e.clientX || e.changedTouches[0].pageX;
    const currentClientY = e.clientY || e.changedTouches[0].pageY;

    endX = currentX - currentClientX;
    endY = currentY - currentClientY;
    currentX = currentClientX;
    currentY = currentClientY;

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
    sourceElement = undefined;
    e.preventDefault();
    e.stopPropagation();
}

document.addEventListener("pointermove", pointerMove);
document.addEventListener("pointerup", pointerUp);

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
    element.addEventListener("pointerdown", pointerDown);
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

window.addEventListener('mouseup', e => {
    console.log("window mouseup");
    deselectNotes();
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
    if (e.key === "Escape") {
    }
    else if (e.key === "Backspace" || e.key === "Delete") {
        if (selectedElement !== undefined) {
            notesElement.removeChild(selectedElement);
            selectedElement = undefined;
        }
    }
    else if (e.key === "Alt") {
    }
    else if (!e.altKey) {
        showNoteDialog();
    }
});
