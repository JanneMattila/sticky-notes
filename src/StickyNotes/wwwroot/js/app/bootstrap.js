// ---------------------------------------------------------------------------
// Application bootstrap (entry point)
//
// Loaded last. Resolves the board id, wires window focus/blur reconnect, keeps
// the tab awake via the Web Locks API, starts the SignalR connection and
// restores the saved theme. All functions and shared state referenced here are
// defined by the modules loaded earlier.
// ---------------------------------------------------------------------------

window.addEventListener('focus', () => {
    if (connection.state === "Disconnected") {
        startConnection();
    }
});

window.addEventListener('blur', () => {
});

// Resolve the board id (and handle remote import boards) before connecting.
getId();

// Based on documentation example:
// https://docs.microsoft.com/en-us/aspnet/core/signalr/javascript-client?view=aspnetcore-6.0&tabs=visual-studio#bsleep
let lockResolver;
if (navigator && navigator.locks && navigator.locks.request) {
    // https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API
    console.log("Browser supports Web Locks API. Trying to prevent tab from sleeping.");
    const promise = new Promise((res) => {
        lockResolver = res;
    });

    navigator.locks.request('stickynotes', { mode: "shared" }, () => {
        return promise;
    });
}

startConnection();

const startTheme = localStorage.getItem("theme");
if (startTheme != null) {
    console.log(startTheme);
    document.getElementsByTagName("html")[0].className = startTheme;
    document.body.classList.add(startTheme);
}
