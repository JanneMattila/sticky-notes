// ---------------------------------------------------------------------------
// Markdown documents
//
// A note can own a GitHub-flavored markdown document. It is stored in Blob
// Storage and edited collaboratively. Real-time sync uses a separate SignalR
// group ("md|{boardId}|{markdownId}") so that people only looking at the notes
// canvas never receive markdown traffic. Edits are exchanged as exact,
// revision-gated single-range splices; any mismatch triggers a full resync so
// clients can never silently drift out of sync.
// ---------------------------------------------------------------------------

const markdownGroup = markdownId => `md|${_id}|${markdownId}`;

const markdownUrl = (markdownId, mode) =>
    `${document.location.pathname}?md=${encodeURIComponent(markdownId)}&mode=${mode}`;

// Convert bare "[ ] item" / "[x] item" lines (without a leading list marker)
// into proper GFM task-list items so they render as checkboxes.
const normalizeMarkdown = text => (text || "").replace(/^([ \t]*)\[([ xX])\]([ \t]+)/gm, "$1- [$2]$3");

const markdownToHtml = text => {
    const prepared = normalizeMarkdown(text);
    if (window.marked && typeof marked.parse === "function") {
        return marked.parse(prepared, { gfm: true, breaks: false });
    }
    if (typeof marked === "function") {
        return marked(prepared, { gfm: true, breaks: false });
    }
    return prepared;
};

const computeSplice = (base, target) => {
    if (base === target) return null;

    let start = 0;
    const minLength = Math.min(base.length, target.length);
    while (start < minLength && base.charCodeAt(start) === target.charCodeAt(start)) {
        start++;
    }

    let endBase = base.length;
    let endTarget = target.length;
    while (endBase > start && endTarget > start &&
        base.charCodeAt(endBase - 1) === target.charCodeAt(endTarget - 1)) {
        endBase--;
        endTarget--;
    }

    return {
        start,
        deleteCount: endBase - start,
        insert: target.substring(start, endTarget)
    };
};

const applySplice = (text, start, deleteCount, insert) =>
    text.substring(0, start) + (insert || "") + text.substring(start + deleteCount);

const isDarkTheme = () =>
    document.body.classList.contains("dark") ||
    document.getElementsByTagName("html")[0].className === "dark";

const applyMarkdownTheme = () => {
    const dark = isDarkTheme();

    const lightCss = document.getElementById("ghMarkdownLight");
    const darkCss = document.getElementById("ghMarkdownDark");
    if (lightCss && darkCss) {
        lightCss.disabled = dark;
        darkCss.disabled = !dark;
    }

    const hljsLight = document.getElementById("hljsLight");
    const hljsDark = document.getElementById("hljsDark");
    if (hljsLight && hljsDark) {
        hljsLight.disabled = dark;
        hljsDark.disabled = !dark;
    }

    const desiredTheme = dark ? "dark" : "default";
    if (window.mermaid) {
        if (!_mermaidInitialized || _mermaidTheme !== desiredTheme) {
            mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: desiredTheme });
            _mermaidInitialized = true;
            _mermaidTheme = desiredTheme;
        }
    }
};

const MD_COPY_ICON = '<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z"></path><path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z"></path></svg>';
const MD_CHECK_ICON = '<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z"></path></svg>';
const MD_LINK_ICON = '<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="m7.775 3.275 1.25-1.25a3.5 3.5 0 1 1 4.95 4.95l-2.5 2.5a3.5 3.5 0 0 1-4.95 0 .751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018 2 2 0 0 0 2.83 0l2.5-2.5a2.002 2.002 0 0 0-2.83-2.83l-1.25 1.25a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042Zm-4.69 9.64a2 2 0 0 0 2.83 0l1.25-1.25a.751.751 0 0 1 1.042.018.751.751 0 0 1 .018 1.042l-1.25 1.25a3.5 3.5 0 1 1-4.95-4.95l2.5-2.5a3.5 3.5 0 0 1 4.95 0 .751.751 0 0 1-.018 1.042.751.751 0 0 1-1.042.018 2 2 0 0 0-2.83 0l-2.5 2.5a2 2 0 0 0 0 2.83Z"></path></svg>';

const slugifyHeading = text => (text || "").toLowerCase().trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");

const addCodeCopyButtons = container => {
    const pres = container.querySelectorAll("pre");
    pres.forEach(pre => {
        if (pre.classList.contains("mermaid") || pre.querySelector(".md-copy-btn")) {
            return;
        }
        pre.classList.add("md-has-copy");
        const button = document.createElement("button");
        button.type = "button";
        button.className = "md-copy-btn";
        button.title = "Copy";
        button.setAttribute("aria-label", "Copy code");
        button.innerHTML = MD_COPY_ICON;
        button.addEventListener("click", async () => {
            const code = pre.querySelector("code");
            const value = code ? code.innerText : pre.innerText;
            try {
                await navigator.clipboard.writeText(value);
                button.classList.add("copied");
                button.innerHTML = MD_CHECK_ICON;
                button.title = "Copied!";
                setTimeout(() => {
                    button.classList.remove("copied");
                    button.innerHTML = MD_COPY_ICON;
                    button.title = "Copy";
                }, 1500);
            } catch (err) {
                console.log("Copy failed", err);
            }
        });
        pre.appendChild(button);
    });
};

const addHeadingAnchors = container => {
    const used = {};
    const headings = container.querySelectorAll("h1, h2, h3, h4, h5, h6");
    headings.forEach(heading => {
        let slug = slugifyHeading(heading.textContent) || "section";
        if (used[slug] !== undefined) {
            used[slug] += 1;
            slug = `${slug}-${used[slug]}`;
        } else {
            used[slug] = 0;
        }
        heading.id = slug;
        heading.classList.add("md-heading");

        const anchor = document.createElement("a");
        anchor.className = "md-anchor";
        anchor.href = `#${slug}`;
        anchor.title = "Copy link to this section";
        anchor.setAttribute("aria-label", "Link to this section");
        anchor.innerHTML = MD_LINK_ICON;
        anchor.addEventListener("click", e => {
            e.preventDefault();
            const path = `${document.location.pathname}${document.location.search}#${slug}`;
            safeReplaceState(history.state, path);
            heading.scrollIntoView({ behavior: "smooth", block: "start" });
            if (navigator.clipboard) {
                navigator.clipboard.writeText(`${document.location.origin}${path}`).catch(() => { /* ignore */ });
            }
        });
        heading.insertBefore(anchor, heading.firstChild);
    });
};

const renderMermaidBlocks = container => {
    const blocks = container.querySelectorAll("code.language-mermaid");
    const nodes = [];
    blocks.forEach(code => {
        const pre = code.closest("pre");
        const target = pre || code;
        const div = document.createElement("div");
        div.className = "mermaid";
        div.textContent = code.textContent;
        target.replaceWith(div);
        nodes.push(div);
    });

    if (nodes.length > 0 && window.mermaid) {
        try {
            mermaid.run({ nodes });
        } catch (err) {
            console.log("mermaid render error", err);
        }
    }
};

const highlightCodeBlocks = container => {
    if (!window.hljs) return;
    container.querySelectorAll("pre code").forEach(code => {
        if (code.classList.contains("language-mermaid")) return;
        try {
            hljs.highlightElement(code);
        } catch (err) {
            console.log("Highlight error", err);
        }
    });
};

const placeEditButton = body => {
    const button = document.getElementById("markdownViewEditButton");
    if (!button) return;
    // Read-only boards cannot edit markdown, so hide the edit pen entirely.
    button.classList.toggle("d-none", isReadonly());
    button.classList.remove("md-edit-floating");
    const firstHeading = body.querySelector("h1, h2, h3, h4, h5, h6");
    if (firstHeading) {
        firstHeading.classList.add("md-has-edit");
        firstHeading.appendChild(button);
    } else {
        button.classList.add("md-edit-floating");
        body.insertBefore(button, body.firstChild);
    }
};

const renderMarkdownView = text => {
    const body = document.getElementById("markdownViewBody");
    if (!body) return;

    // Park the edit button outside the body before wiping it, so the element and
    // its click handler survive the re-render, then re-place it on the heading line.
    const editButton = document.getElementById("markdownViewEditButton");
    const overlay = document.getElementById("markdownViewOverlay");
    if (editButton && overlay && editButton.parentElement !== overlay) {
        overlay.appendChild(editButton);
    }

    const rawHtml = markdownToHtml(text || "");
    const cleanHtml = window.DOMPurify ? DOMPurify.sanitize(rawHtml) : rawHtml;
    body.innerHTML = cleanHtml;
    renderMermaidBlocks(body);
    highlightCodeBlocks(body);
    addCodeCopyButtons(body);
    addHeadingAnchors(body);
    placeEditButton(body);
};

const setMarkdownStatus = status => {
    const el = document.getElementById("markdownEditStatus");
    if (el) el.innerText = status;
};

const switchMarkdownMode = mode => {
    if (!_mdDoc) return;

    // Read-only boards can only view markdown; never enter edit mode.
    if (mode === "edit" && isReadonly()) mode = "view";

    _mdDoc.mode = mode;
    _isModalOpen = true;

    // Drop focus before toggling aria-hidden to avoid the browser warning about
    // aria-hidden on an ancestor of the focused element.
    if (document.activeElement && typeof document.activeElement.blur === "function") {
        document.activeElement.blur();
    }

    const viewOverlay = document.getElementById("markdownViewOverlay");
    const editOverlay = document.getElementById("markdownEditOverlay");

    applyMarkdownTheme();

    if (mode === "view") {
        editOverlay.classList.remove("visible");
        viewOverlay.classList.add("visible");
        viewOverlay.setAttribute("aria-hidden", "false");
        editOverlay.setAttribute("aria-hidden", "true");
        renderMarkdownView(_mdDoc.text);
    }
    else {
        viewOverlay.classList.remove("visible");
        editOverlay.classList.add("visible");
        editOverlay.setAttribute("aria-hidden", "false");
        viewOverlay.setAttribute("aria-hidden", "true");
        const textarea = document.getElementById("markdownEditText");
        textarea.value = _mdDoc.text;
        setMarkdownStatus("");
        setTimeout(() => textarea.focus(), 50);
    }

    safeReplaceState({ md: _mdDoc.markdownId }, markdownUrl(_mdDoc.markdownId, mode));
};

const openMarkdownDoc = (element, note, mode) => {
    let markdownId = note.markdown || element.dataset.markdown || "";

    if (mode === "edit" && !markdownId) {
        // First time editing: create the document identifier and persist the note.
        markdownId = generateId();
        note.markdown = markdownId;
        element.dataset.markdown = markdownId;
        updateNoteElementsToServer([element]);
    }

    if (!markdownId) return;

    note.markdown = markdownId;
    element.dataset.markdown = markdownId;

    if (_mdDoc && _mdDoc.markdownId === markdownId) {
        switchMarkdownMode(mode);
        return;
    }

    if (_mdDoc) {
        leaveMarkdownGroup();
    }

    _mdDoc = {
        markdownId,
        group: markdownGroup(markdownId),
        note,
        element,
        mode,
        text: "",
        revision: 0,
        loaded: false,
        inflight: false,
        pendingTarget: undefined,
        pendingTimer: null
    };

    connection.invoke("Join", _mdDoc.group).catch(err => console.log("Join markdown error", err));

    if (!_mdHistoryPushed) {
        try {
            history.pushState({ md: markdownId }, "", markdownUrl(markdownId, mode));
            _mdHistoryPushed = true;
        } catch (e) { /* ignore */ }
    }

    switchMarkdownMode(mode);
};

// Opens the markdown document referenced by the ?md=...&mode=... query string
// (e.g. a shared link), once the board's notes have loaded.
const openMarkdownFromUrl = () => {
    const queryString = parseQueryString();
    let markdownId = queryString.get("md");
    if (!markdownId) return;
    markdownId = decodeURIComponent(markdownId);

    const mode = queryString.get("mode") === "edit" ? "edit" : "view";

    let target = null;
    const elements = _notesElement.getElementsByClassName("stickynote");
    for (let i = 0; i < elements.length; i++) {
        if (elements[i].dataset.markdown === markdownId) {
            target = elements[i];
            break;
        }
    }
    if (!target) return;

    // Establish a clean history base so closing returns to the plain board view.
    safeReplaceState({}, document.location.pathname);
    _mdHistoryPushed = false;

    openMarkdownDoc(target, convertElementToNote(target), mode);
};

const scheduleMarkdownSend = () => {
    if (!_mdDoc) return;
    if (isReadonly()) return;
    if (_mdDoc.pendingTimer) clearTimeout(_mdDoc.pendingTimer);
    _mdDoc.pendingTimer = setTimeout(() => {
        _mdDoc.pendingTimer = null;
        sendMarkdownEdit();
    }, 250);
};

const sendMarkdownEdit = () => {
    if (!_mdDoc || _mdDoc.mode !== "edit") return;
    if (_mdDoc.inflight) return; // Wait for the current splice to be acknowledged.

    const textarea = document.getElementById("markdownEditText");
    const target = textarea.value;
    const splice = computeSplice(_mdDoc.text, target);
    if (!splice) return;

    _mdDoc.inflight = true;
    _mdDoc.pendingTarget = target;
    setMarkdownStatus("Saving…");

    connection.invoke("UpdateMarkdown", _mdDoc.group, _mdDoc.revision, splice.start, splice.deleteCount, splice.insert)
        .catch(err => {
            console.log("UpdateMarkdown error", err);
            _mdDoc.inflight = false;
            setMarkdownStatus("Save failed");
        });
};

const insertAtCursor = (textarea, text) => {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    textarea.value = textarea.value.substring(0, start) + text + textarea.value.substring(end);
    const position = start + text.length;
    textarea.selectionStart = textarea.selectionEnd = position;
};

const uploadAndInsertImage = async file => {
    if (!_mdDoc) return;

    const textarea = document.getElementById("markdownEditText");
    const token = `![uploading ${(file.name || "image")}…]()`;
    insertAtCursor(textarea, token);
    setMarkdownStatus("Uploading image…");

    try {
        const form = new FormData();
        form.append("file", file, file.name || "image.png");
        const url = `${StickyNotes.WwwRoot}api/attachments/upload?boardId=${encodeURIComponent(_id)}&markdownId=${encodeURIComponent(_mdDoc.markdownId)}`;
        const response = await fetch(url, { method: "POST", body: form });
        if (!response.ok) throw new Error(`Upload failed: ${response.status}`);

        const data = await response.json();
        textarea.value = textarea.value.replace(token, `![image](${data.url})`);
        setMarkdownStatus("");
        scheduleMarkdownSend();
    }
    catch (err) {
        console.log("Image upload error", err);
        textarea.value = textarea.value.replace(token, "");
        setMarkdownStatus("Image upload failed");
    }
};

const leaveMarkdownGroup = () => {
    if (!_mdDoc) return;
    if (_mdDoc.pendingTimer) {
        clearTimeout(_mdDoc.pendingTimer);
        _mdDoc.pendingTimer = null;
    }
    if (_mdDoc.mode === "edit") {
        // Flush any pending local changes before leaving.
        sendMarkdownEdit();
    }
    const group = _mdDoc.group;
    connection.invoke("Leave", group).catch(err => console.log("Leave markdown error", err));
};

const closeMarkdownOverlay = () => {
    if (!_mdDoc) return;

    if (document.activeElement && typeof document.activeElement.blur === "function") {
        document.activeElement.blur();
    }

    leaveMarkdownGroup();

    const viewOverlay = document.getElementById("markdownViewOverlay");
    const editOverlay = document.getElementById("markdownEditOverlay");
    viewOverlay.classList.remove("visible");
    editOverlay.classList.remove("visible");
    viewOverlay.setAttribute("aria-hidden", "true");
    editOverlay.setAttribute("aria-hidden", "true");

    // A markdown document that ends up empty should not keep its id on the note,
    // otherwise the note keeps offering an empty view.
    if (_mdDoc.loaded && _mdDoc.note && (_mdDoc.element instanceof HTMLElement) && (_mdDoc.text || "").trim() === "") {
        _mdDoc.note.markdown = "";
        _mdDoc.element.dataset.markdown = "";
        updateNoteElementsToServer([_mdDoc.element]);
    }

    _mdDoc = null;
    _mdHistoryPushed = false;
    _isModalOpen = false;
};

const requestCloseMarkdown = () => {
    if (!_mdDoc) return;
    if (_mdHistoryPushed) {
        // Let the browser Back button semantics drive the close (mobile-friendly).
        history.back();
    }
    else {
        closeMarkdownOverlay();
    }
};

connection.on("MarkdownContent", (markdownId, text, revision) => {
    if (!_mdDoc || _mdDoc.markdownId !== markdownId) return;

    const previousBase = _mdDoc.text;
    _mdDoc.text = text;
    _mdDoc.revision = revision;
    _mdDoc.inflight = false;
    _mdDoc.loaded = true;

    if (_mdDoc.mode === "view") {
        if ((text || "").trim() === "") {
            // Nothing to view: fall back to editing the note (closeMarkdownOverlay
            // also drops the empty markdown id from the note).
            const note = _mdDoc.note;
            const element = _mdDoc.element;
            if (_mdHistoryPushed) {
                safeReplaceState({}, document.location.pathname);
            }
            closeMarkdownOverlay();
            if ((element instanceof HTMLElement) && note) {
                editNoteMenu(element, note);
            }
            return;
        }
        renderMarkdownView(text);
    }
    else {
        const textarea = document.getElementById("markdownEditText");
        if (textarea.value === previousBase || textarea.value === "") {
            // No unsent local edits: adopt the authoritative text.
            const cursor = textarea.selectionStart;
            textarea.value = text;
            try {
                textarea.selectionStart = textarea.selectionEnd = Math.min(cursor, text.length);
            } catch (e) { /* ignore */ }
        }
        else {
            // Local edits exist: re-send them on top of the new base (last-write-wins).
            scheduleMarkdownSend();
        }
    }
    setMarkdownStatus("");
});

connection.on("MarkdownAck", (markdownId, baseRevision, revision) => {
    if (!_mdDoc || _mdDoc.markdownId !== markdownId) return;

    if (_mdDoc.pendingTarget !== undefined) {
        _mdDoc.text = _mdDoc.pendingTarget;
        _mdDoc.pendingTarget = undefined;
    }
    _mdDoc.revision = revision;
    _mdDoc.inflight = false;
    setMarkdownStatus("Saved");

    const textarea = document.getElementById("markdownEditText");
    if (textarea && textarea.value !== _mdDoc.text) {
        scheduleMarkdownSend();
    }
});

connection.on("MarkdownPatch", (markdownId, baseRevision, start, deleteCount, insert, revision) => {
    if (!_mdDoc || _mdDoc.markdownId !== markdownId) return;

    if (_mdDoc.revision !== baseRevision || _mdDoc.inflight) {
        // We are not exactly on the patch's base revision, or we have an
        // in-flight edit: resynchronize fully rather than risk divergence.
        connection.invoke("GetMarkdown", _mdDoc.group).catch(err => console.log(err));
        return;
    }

    const oldText = _mdDoc.text;
    const newText = applySplice(oldText, start, deleteCount, insert);
    _mdDoc.text = newText;
    _mdDoc.revision = revision;

    if (_mdDoc.mode === "view") {
        renderMarkdownView(newText);
    }
    else {
        const textarea = document.getElementById("markdownEditText");
        if (textarea.value === oldText) {
            // No local edits: mirror the remote change and keep the caret sensible.
            const cursor = textarea.selectionStart;
            textarea.value = newText;
            let newCursor = cursor;
            if (cursor > start) {
                newCursor = cursor >= start + deleteCount
                    ? cursor - deleteCount + (insert ? insert.length : 0)
                    : start + (insert ? insert.length : 0);
            }
            try {
                textarea.selectionStart = textarea.selectionEnd = Math.min(newCursor, newText.length);
            } catch (e) { /* ignore */ }
        }
        else {
            // Concurrent local edits: resync to reconcile safely.
            connection.invoke("GetMarkdown", _mdDoc.group).catch(err => console.log(err));
        }
    }
});

window.addEventListener("popstate", () => {
    if (_mdDoc) {
        _mdHistoryPushed = false;
        closeMarkdownOverlay();
    }
});

document.addEventListener("keydown", e => {
    if (_mdDoc && e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        requestCloseMarkdown();
    }
}, true);

document.getElementById("markdownViewCloseButton")?.addEventListener("click", requestCloseMarkdown);
document.getElementById("markdownEditCloseButton")?.addEventListener("click", requestCloseMarkdown);
document.getElementById("markdownViewEditButton")?.addEventListener("click", () => switchMarkdownMode("edit"));
document.getElementById("markdownEditViewButton")?.addEventListener("click", () => {
    if (_mdDoc) {
        const textarea = document.getElementById("markdownEditText");
        _mdDoc.text = textarea.value;
    }
    switchMarkdownMode("view");
});

const markdownEditTextElement = document.getElementById("markdownEditText");
if (markdownEditTextElement) {
    markdownEditTextElement.addEventListener("input", () => {
        if (_mdDoc && _mdDoc.mode === "edit") {
            scheduleMarkdownSend();
        }
    });
    markdownEditTextElement.addEventListener("paste", async e => {
        const items = e.clipboardData && e.clipboardData.items;
        if (!items) return;
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (item.type && item.type.startsWith("image/")) {
                e.preventDefault();
                const file = item.getAsFile();
                if (file) {
                    await uploadAndInsertImage(file);
                }
                return;
            }
        }
    });
}
