// ---------------------------------------------------------------------------
// Canvas interaction: pointer drag/resize, pinch & wheel zoom, panning,
// rectangle selection and zoom-to-fit.
// ---------------------------------------------------------------------------

// Shared zoom correction: after `_scale` has been updated and applied to the
// canvas, shift every note so the given center point stays visually anchored.
// Used by both pinch-zoom (pointerMove) and wheel-zoom.
const applyZoomCorrection = (centerX, centerY, previousScale) => {
    const scaleChange = previousScale - _scale;
    const correctionX = Math.floor(centerX * scaleChange);
    const correctionY = Math.floor(centerY * scaleChange);
    console.table({ centerX, centerY, correctionX, correctionY, scaleChange, _scale });

    _coordinateAdjustX -= correctionX;
    _coordinateAdjustY -= correctionY;
    const elements = document.getElementsByClassName("stickynote");
    for (let i = 0; i < elements.length; i++) {
        const element = elements[i];
        element.style.left = `${element.offsetLeft + correctionX}px`;
        element.style.top = `${element.offsetTop + correctionY}px`;
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

                const centerX = document.documentElement.clientWidth / _scale / 2; // pointers[0].clientX + (pointers[1].clientX - pointers[0].clientX) / 2;
                const centerY = document.documentElement.clientHeight / _scale / 2; //  pointers[0].clientY + (pointers[1].clientY - pointers[0].clientY) / 2;
                applyZoomCorrection(centerX, centerY, previousScale);
            }
            _pointerDiff = diff;
        }
        return;
    }

    if (_isRectSelect) {
        const screenX = e.clientX;
        const screenY = e.clientY;
        const left = Math.min(_rectStartScreenX, screenX);
        const top = Math.min(_rectStartScreenY, screenY);
        const width = Math.abs(screenX - _rectStartScreenX);
        const height = Math.abs(screenY - _rectStartScreenY);

        _selectionRect.style.left = `${left}px`;
        _selectionRect.style.top = `${top}px`;
        _selectionRect.style.width = `${width}px`;
        _selectionRect.style.height = `${height}px`;

        const selRect = { left, top, right: left + width, bottom: top + height };
        const notes = document.getElementsByClassName("stickynote");
        for (let i = 0; i < notes.length; i++) {
            const noteRect = notes[i].getBoundingClientRect();
            const intersects = !(noteRect.left > selRect.right || noteRect.right < selRect.left ||
                                 noteRect.top > selRect.bottom || noteRect.bottom < selRect.top);
            if (intersects) {
                notes[i].classList.add("selected");
            } else if (!_preSelectedNotes.has(notes[i].id)) {
                notes[i].classList.remove("selected");
            }
        }
        return;
    }

    _endX = Math.floor(_currentX - clientX);
    _endY = Math.floor(_currentY - clientY);
    _currentX = clientX;
    _currentY = clientY;

    if (_sourceElement === undefined) {
        if (_isMove && !_isRectSelect) {
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

    // Read-only boards allow panning/zooming but not moving or resizing notes.
    if (isReadonly()) return;

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

    if (_isRectSelect) {
        _isRectSelect = false;
        _selectionRect.classList.remove('active');
        _preSelectedNotes.clear();
        for (let i = 0; i < _pointers.length; i++) {
            if (_pointers[i].pointerId == e.pointerId) {
                _pointers.splice(i, 1);
                break;
            }
        }
        e.stopPropagation();
        return;
    }

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

    const centerX = e.clientX / _scale;
    const centerY = e.clientY / _scale;
    applyZoomCorrection(centerX, centerY, previousScale);
});

window.addEventListener('pointerdown', e => {
    if (_isModalOpen) return;

    if (e.ctrlKey) {
        // Start rectangle selection
        _isRectSelect = true;
        _isMove = false;
        _rectStartScreenX = e.clientX;
        _rectStartScreenY = e.clientY;
        _preSelectedNotes.clear();
        const preSelected = document.getElementsByClassName("selected");
        for (let i = 0; i < preSelected.length; i++) {
            _preSelectedNotes.add(preSelected[i].id);
        }
        _selectionRect.style.left = `${e.clientX}px`;
        _selectionRect.style.top = `${e.clientY}px`;
        _selectionRect.style.width = '0px';
        _selectionRect.style.height = '0px';
        _selectionRect.classList.add('active');
        _pointers.push(e);
        return;
    }

    deSelectNotes();

    _pointerDiff = 0;
    _pointers.push(e);
    _currentX = e.clientX / _scale;
    _currentY = e.clientY / _scale;
    _lastCanvasClickX = _currentX;
    _lastCanvasClickY = _currentY;
    _isMove = true;
});

const zoomOut = notes => {
    deleteAllNotesByClassFilter("stickynote", false);

    notes = (notes || []).filter(n => !isReservedNote(n));

    if (!notes || notes.length === 0) {
        // Nothing to fit. Reset the view to a neutral state instead of deriving
        // a scale/offset from sentinel values, which previously produced an
        // enormous (~1e10) coordinate offset that got baked into saved notes.
        _scale = 1.0;
        _originalScale = 1.0;
        _coordinateAdjustX = 0;
        _coordinateAdjustY = 0;
        _notesElement.style.transform = `scale(${_scale})`;
        return;
    }

    const { minX, maxX, minY, maxY } = computeBounds(notes);

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

    _originalScale = _scale;
    for (let i = 0; i < notes.length; i++) {
        const note = notes[i];

        note.position.x -= _coordinateAdjustX;
        note.position.y -= _coordinateAdjustY;

        renderNoteIntoCanvas(note);
    }

    _notesElement.style.transform = `scale(${_scale})`;
}
