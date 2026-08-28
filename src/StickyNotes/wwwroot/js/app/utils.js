// ---------------------------------------------------------------------------
// Generic utilities
//
// Small, dependency-free helpers shared across modules: id generation, query
// string parsing, the error / loading indicators, note bounding-box math, and
// a safe wrapper around history.replaceState.
// ---------------------------------------------------------------------------

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

const showErrorDialog = () => {
    if (_isErrorDialogOpen) return;

    _isErrorDialogOpen = true;
    const modalElement = document.getElementById("errorModal");
    const modal = new bootstrap.Modal(modalElement);
    modal.show();
}

const setInitialNotesLoadingVisible = visible => {
    if (_initialNotesLoadingElement === undefined || _initialNotesLoadingElement == null) {
        return;
    }

    if (visible) {
        _initialNotesLoadingElement.classList.add("visible");
    }
    else {
        _initialNotesLoadingElement.classList.remove("visible");
    }
}

// Computes the min/max bounding box across a set of notes. `minX`/`minY` use the
// note origin; `maxX`/`maxY` include the note width/height.
const computeBounds = notes => {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < notes.length; i++) {
        const note = notes[i];

        if (note.position.x < minX) minX = note.position.x;
        if (note.position.x + note.width > maxX) maxX = note.position.x + note.width;

        if (note.position.y < minY) minY = note.position.y;
        if (note.position.y + note.height > maxY) maxY = note.position.y + note.height;
    }
    return { minX, maxX, minY, maxY };
}

// history.replaceState can throw in some embedded/sandboxed contexts; callers
// never care about the failure, so swallow it consistently in one place.
const safeReplaceState = (state, url) => {
    try {
        history.replaceState(state, "", url);
    } catch (e) { /* ignore */ }
}
