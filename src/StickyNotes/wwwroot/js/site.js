let notesElement = document.getElementById("notes");

let currentX, currentY, endX, endY;
let sourceElement = undefined;

const mouseDown = e => {
    e.preventDefault();
    sourceElement = e.srcElement;

    currentX = e.clientX || e.changedTouches[0].pageX;
    currentY = e.clientY || e.changedTouches[0].pageY;
}

const mouseMove = e => {
    if (sourceElement === undefined) {
        return;
    }
    e.preventDefault();

    const currentClientX = e.clientX || e.changedTouches[0].pageX;
    const currentClientY = e.clientY || e.changedTouches[0].pageY;

    endX = currentX - currentClientX;
    endY = currentY - currentClientY;
    currentX = currentClientX;
    currentY = currentClientY;

    sourceElement.style.top = `${sourceElement.offsetTop - endY}px`;
    sourceElement.style.left = `${sourceElement.offsetLeft - endX}px`;
}

function mouseUp() {
    sourceElement = undefined;
}

document.addEventListener("touchmove", mouseMove);
document.addEventListener("touchend", mouseUp);
document.addEventListener("mousemove", mouseMove);
document.addEventListener("mouseup", mouseUp);

let protocol = new signalR.JsonHubProtocol();
let hubRoute = "Notes";
let connection = new signalR.HubConnectionBuilder()
    .withUrl(hubRoute)
    .withAutomaticReconnect()
    .withHubProtocol(protocol)
    .build();

const addNote = (note) => {
    console.log(note);
    let element = document.createElement('div');
    element.innerText = note;
    element.className = "stickynote";
    //element.addEventListener("mouseup", mouseUp);
    element.addEventListener("mousedown", mouseDown);
    //element.addEventListener("touchend", mouseUp);
    element.addEventListener("touchstart", mouseDown);
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

window.addEventListener('contextmenu', e => {
    e.preventDefault();
    showNoteDialog();
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

document.addEventListener('keyup', (event) => {
    if (event.keyCode === 27 /* Esc */) {
    }
    else {
        showNoteDialog();
    }
});
