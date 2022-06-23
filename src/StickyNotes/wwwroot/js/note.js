var Note = Note || {};

let _notes = [];

Note.setNotes = notes => {
    _notes = notes;
}

Note.draw = text => {
    console.log(text);
}
