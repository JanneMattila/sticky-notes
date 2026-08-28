// ---------------------------------------------------------------------------
// Global keyboard shortcuts
//
// Canvas-level shortcuts (copy/paste/zoom/select-all/delete/new-note) plus the
// Ctrl+Enter quick-submit on the note text field. Shortcuts are ignored while a
// modal or the markdown overlay is open.
// ---------------------------------------------------------------------------

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
