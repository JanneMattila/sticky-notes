// ---------------------------------------------------------------------------
// Board settings (readonly) + reserved notes
//
// Board-level settings are stored in a hidden "reserved" note that is synced
// like any other note but never rendered on the canvas. Readonly mode hides all
// mutating UI affordances.
// ---------------------------------------------------------------------------

const isReadonly = () => _settings.readonly === true;
const isReservedNote = note => note && note.id && note.id.startsWith(RESERVED_NOTE_PREFIX);

const applyReadonlyState = () => {
    const readonly = isReadonly();
    document.body.classList.toggle("readonly", readonly);
    const addBtn = document.getElementById("menuAddNotes");
    const removeBtn = document.getElementById("menuRemoveAllNotes");
    if (addBtn) addBtn.classList.toggle("d-none", readonly);
    if (removeBtn) removeBtn.classList.toggle("d-none", readonly);
};

const applySettingsFromNote = note => {
    try {
        const parsed = JSON.parse(note.text);
        if (parsed && typeof parsed === "object") {
            _settings = Object.assign({ readonly: false }, parsed);
        }
    } catch (e) {
        console.log("Failed to parse settings note", e);
    }
    applyReadonlyState();
};

const resetSettingsDefault = () => {
    _settings = { readonly: false };
    applyReadonlyState();
};

const saveSettingsToServer = async () => {
    if (_imported) return;

    const note = {
        id: SETTINGS_NOTE_ID,
        text: JSON.stringify(_settings),
        link: "",
        color: "",
        markdown: "",
        position: { x: 0, y: 0, z: 0, rotation: 0 },
        width: 0,
        height: 0
    };

    try {
        await connection.invoke("UpdateNotes", _id, [note]);
        console.log("Settings saved", _settings);
    } catch (err) {
        console.log("Settings save error", err);
        showErrorDialog();
    }
}

const showSettingsDialog = () => {
    _isMove = false;
    _pointers = [];
    if (_isModalOpen) {
        return;
    }

    _isModalOpen = true;
    const modalElement = document.getElementById("settingsModal");
    const readonlyElement = document.getElementById("settingsReadonly");
    const saveButtonElement = document.getElementById("settingsSaveButton");

    readonlyElement.checked = isReadonly();

    const saveButtonClick = async e => {
        _settings.readonly = readonlyElement.checked;
        applyReadonlyState();
        await saveSettingsToServer();
        modal.hide();
    }

    const dialogClosed = e => {
        _isModalOpen = false;
        saveButtonElement.removeEventListener("click", saveButtonClick);
        modalElement.removeEventListener("hidden.bs.modal", dialogClosed);
    }

    saveButtonElement.addEventListener("click", saveButtonClick);
    modalElement.addEventListener("hidden.bs.modal", dialogClosed);

    const modal = new bootstrap.Modal(modalElement);
    modal.show();
}
