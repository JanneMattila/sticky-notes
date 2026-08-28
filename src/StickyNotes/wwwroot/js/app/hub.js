// ---------------------------------------------------------------------------
// SignalR hub connection
//
// The single shared `connection` used for both notes and markdown traffic.
// This file must load before any module that registers `connection.on(...)`
// handlers (notes, markdown). Connection lifecycle logging and the startup /
// reconnect logic live here too.
// ---------------------------------------------------------------------------

let protocol = new signalR.JsonHubProtocol();
let hubRoute = `${StickyNotes.WwwRoot}Notes`;
let connection = new signalR.HubConnectionBuilder()
    .withUrl(hubRoute)
    .withAutomaticReconnect()
    .withHubProtocol(protocol)
    .build();

// Deletes notes on the server. `onError` is invoked (if provided) when the call
// fails, letting callers decide whether to surface the error dialog.
const deleteNotesOnServer = (noteIds, onError) => {
    return connection.invoke("DeleteNotes", _id, noteIds)
        .then(function () {
            console.log("DeleteNotes called");
        })
        .catch(function (err) {
            console.log("DeleteNotes error");
            console.log(err);
            if (onError) onError(err);
        });
}

connection.onclose(err => {
    console.log(`onclose: ${err}`);
});

connection.onreconnecting(e => {
    console.log(`onreconnecting : ${e}`);
});

connection.onreconnected(connectionId => {
    console.log(`onreconnected : ${connectionId}`);
    connection.invoke("Join", _id);
    if (_mdDoc) {
        // Rejoin the markdown group and resync from the authoritative copy.
        connection.invoke("Join", _mdDoc.group).catch(err => console.log(err));
    }
});

const startConnection = () => {
    if (_imported) return;

    if (_isInitialNotesLoadPending) {
        setInitialNotesLoadingVisible(true);
    }

    connection.start()
        .then(async () => {
            // Connected
            connection.invoke("Join", _id);

            const queryString = parseQueryString();
            const parentUri = queryString.get("parent");
            if (parentUri !== undefined) {
                await addNote("Previous", `${parentUri}`, "lightblue", true);
                document.location.replace(`${StickyNotes.WwwRoot}${_id}`);
            }
        })
        .catch(function (err) {
            setInitialNotesLoadingVisible(false);
            console.log(err);
            showErrorDialog();
        });
}
