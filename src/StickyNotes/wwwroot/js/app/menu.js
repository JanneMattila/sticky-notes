// ---------------------------------------------------------------------------
// Main canvas context menu (toolbar)
//
// Right-clicking empty canvas opens the board-level menu: add notes, settings,
// zoom-to-fit (reload), start new session, copy board as image, remove all,
// and theme toggle.
// ---------------------------------------------------------------------------

window.addEventListener('contextmenu', e => {
    e.preventDefault();
    if (_isModalOpen) return;

    if (_sourceElement === undefined) {
        _isModalOpen = true;

        const modalElement = document.getElementById("menuModal");
        const menuAddNotesElement = document.getElementById("menuAddNotes");
        const menuSettingsElement = document.getElementById("menuSettings");
        const menuZoomOutElement = document.getElementById("menuZoomOut");
        const menuStartNewSessionElement = document.getElementById("menuStartNewSession");
        const menuStartNewSessionWithLinkElement = document.getElementById("menuStartNewSessionWithLink");
        const menuCopyAsImageElement = document.getElementById("menuCopyAsImage");
        const menuRemoveAllNotesElement = document.getElementById("menuRemoveAllNotes");
        const menuThemeElement = document.getElementById("menuThemeButton");

        let newDialogOpened = false;
        const menuAddNotesButtonClick = e => {
            modal.hide();

            newDialogOpened = true;
            _isModalOpen = false;
            showNoteDialog();
        }
        const menuSettingsButtonClick = e => {
            modal.hide();

            newDialogOpened = true;
            _isModalOpen = false;
            showSettingsDialog();
        }
        const menuZoomOutClick = e => {
            modal.hide();
            document.location.reload();
        }
        const menuStartNewSessionButtonClick = e => {
            modal.hide();

            _id = generateId();
            document.location.href = `${StickyNotes.WwwRoot}${_id}`;
        }
        const menuStartNewSessionWithLinkButtonClick = async e => {
            modal.hide();

            const currentId = _id;

            let linkId = prompt("Provide link for new session. Leave blank to auto-generate.", "");
            if (linkId == null) {
                return;
            }
            else if (linkId.length === 0) {
                linkId = generateId();
            }

            await addNote("Next", `${linkId}`, "lightblue", true);
            document.location.href = `${StickyNotes.WwwRoot}${linkId}?parent=${currentId}`;
        }
        const menuCopyAsImageButtonClick = async e => {
            modal.hide();
            _isModalOpen = false;

            // Wait for modal to fully close before capturing
            await new Promise(resolve => setTimeout(resolve, 400));

            try {
                const bgColor = getComputedStyle(document.body).backgroundColor || '#ffffff';
                const canvas = await html2canvas(document.body, {
                    backgroundColor: bgColor,
                    scale: 1,
                    useCORS: true,
                    width: window.innerWidth,
                    height: window.innerHeight,
                    windowWidth: window.innerWidth,
                    windowHeight: window.innerHeight
                });
                canvas.toBlob(async blob => {
                    try {
                        await navigator.clipboard.write([
                            new ClipboardItem({ 'image/png': blob })
                        ]);
                    } catch (err) {
                        console.log("Copy to clipboard failed", err);
                    }
                }, 'image/png');
            } catch (err) {
                console.log("html2canvas error", err);
            }
        }
        const menuRemoveAllNotesButtonClick = e => {
            modal.hide();

            if (confirm("Do you really want to delete all notes?")) {
                deleteAllNotesByClassFilter("stickynote", true);
            }
        }
        const menuThemeButtonClick = e => {
            let theme = localStorage.getItem("theme");
            if (theme == null || theme === "light") {
                theme = "dark";
            }
            else {
                theme = "light";
            }

            localStorage.setItem("theme", theme);

            document.getElementsByTagName("html")[0].className = theme;
            document.body.classList.remove("dark");
            document.body.classList.remove("light");
            document.body.classList.add(theme);

            // Keep an open markdown overlay in sync with the new theme.
            applyMarkdownTheme();
            if (_mdDoc && _mdDoc.mode === "view") {
                renderMarkdownView(_mdDoc.text);
            }
        }

        const dialogClosed = e => {
            if (!newDialogOpened) {
                _isModalOpen = false;
            }
            menuAddNotesElement.removeEventListener("click", menuAddNotesButtonClick);
            menuSettingsElement.removeEventListener("click", menuSettingsButtonClick);
            menuZoomOutElement.removeEventListener("click", menuZoomOutClick);
            menuStartNewSessionElement.removeEventListener("click", menuStartNewSessionButtonClick);
            menuStartNewSessionWithLinkElement.removeEventListener("click", menuStartNewSessionWithLinkButtonClick);
            menuCopyAsImageElement.removeEventListener("click", menuCopyAsImageButtonClick);
            menuRemoveAllNotesElement.removeEventListener("click", menuRemoveAllNotesButtonClick);
            menuThemeElement.removeEventListener("click", menuThemeButtonClick);
            modalElement.removeEventListener("hidden.bs.modal", dialogClosed);
        }

        menuAddNotesElement.addEventListener("click", menuAddNotesButtonClick);
        menuSettingsElement.addEventListener("click", menuSettingsButtonClick);
        menuZoomOutElement.addEventListener("click", menuZoomOutClick);
        menuStartNewSessionElement.addEventListener("click", menuStartNewSessionButtonClick);
        menuStartNewSessionWithLinkElement.addEventListener("click", menuStartNewSessionWithLinkButtonClick);
        menuCopyAsImageElement.addEventListener("click", menuCopyAsImageButtonClick);
        menuRemoveAllNotesElement.addEventListener("click", menuRemoveAllNotesButtonClick);
        menuThemeElement.addEventListener("click", menuThemeButtonClick);
        modalElement.addEventListener("hidden.bs.modal", dialogClosed);

        const modal = new bootstrap.Modal(modalElement);
        modal.show();
    }
});
