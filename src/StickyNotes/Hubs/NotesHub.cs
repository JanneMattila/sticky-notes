using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Logging;
using StickyNotes.Data;
using StickyNotes.Interfaces;
using StickyNotes.Services;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;

namespace StickyNotes.Hubs;

public class NotesHub : Hub
{
    private const string MarkdownGroupPrefix = "md|";

    protected readonly ILogger _log;
    protected readonly INotesContext _context;
    protected readonly IBlobContext _blob;
    protected readonly MarkdownDocumentService _markdown;

    public NotesHub(ILogger<NotesHub> log, INotesContext context, IBlobContext blob, MarkdownDocumentService markdown)
    {
        _log = log;
        _context = context;
        _blob = blob;
        _markdown = markdown;
    }

    public async Task Join(string id)
    {
        if (IsMarkdownGroup(id))
        {
            var (boardId, markdownId) = ParseMarkdownGroup(id);
            await Groups.AddToGroupAsync(Context.ConnectionId, id);
            var snapshot = await _markdown.JoinAsync(boardId, markdownId);
            await Clients.Caller.SendAsync("MarkdownContent", markdownId, snapshot.Text, snapshot.Revision);
            return;
        }

        await Groups.AddToGroupAsync(Context.ConnectionId, id);
        var notes = new List<StickyNote>();
        await foreach (var entity in _context.GetAllAsync<NotesEntity>(TableNames.Notes, id))
        {
            var note = JsonSerializer.Deserialize<StickyNote>(entity.Data);
            if (note != null)
            {
                notes.Add(note);
            }
        }

        await Clients.Caller.SendAsync("AllNotes", notes);
    }

    public async Task Leave(string id)
    {
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, id);

        if (IsMarkdownGroup(id))
        {
            var (boardId, markdownId) = ParseMarkdownGroup(id);
            await _markdown.LeaveAsync(boardId, markdownId);
        }
    }

    public async Task UpdateNotes(string id, List<StickyNote> notes)
    {
        var tasks = new List<Task>();
        foreach (var note in notes)
        {
            var data = JsonSerializer.Serialize(note);
            tasks.Add(_context.UpsertAsync(TableNames.Notes, new NotesEntity()
            {
                PartitionKey = id,
                RowKey = note.ID,
                Data = data
            }));
        }

        Task.WaitAll(tasks.ToArray());
        await Clients.OthersInGroup(id).SendAsync("UpdateNotes", notes);
    }


    public async Task DeleteNotes(string id, List<string> noteIDs)
    {
        var tasks = new List<Task>();
        foreach (var noteID in noteIDs)
        {
            await RemoveMarkdownForNoteAsync(id, noteID);
            tasks.Add(_context.DeleteAsync(TableNames.Notes, new NotesEntity()
            {
                PartitionKey = id,
                RowKey = noteID
            }));
        }

        Task.WaitAll(tasks.ToArray());
        await Clients.OthersInGroup(id).SendAsync("DeleteNotes", noteIDs);
    }

    public async Task UpdateMarkdown(string group, long baseRevision, int start, int deleteCount, string insert)
    {
        if (!IsMarkdownGroup(group))
        {
            return;
        }

        var (boardId, markdownId) = ParseMarkdownGroup(group);
        var result = await _markdown.ApplyAsync(boardId, markdownId, baseRevision, start, deleteCount, insert);
        if (result.Accepted)
        {
            await Clients.OthersInGroup(group).SendAsync("MarkdownPatch", markdownId, baseRevision, start, deleteCount, insert, result.Revision);
            await Clients.Caller.SendAsync("MarkdownAck", markdownId, baseRevision, result.Revision);
        }
        else
        {
            // Rejected because of a stale base revision or invalid range: resync the caller.
            await Clients.Caller.SendAsync("MarkdownContent", markdownId, result.Text ?? string.Empty, result.Revision);
        }
    }

    public async Task GetMarkdown(string group)
    {
        if (!IsMarkdownGroup(group))
        {
            return;
        }

        var (boardId, markdownId) = ParseMarkdownGroup(group);
        var snapshot = await _markdown.GetAsync(boardId, markdownId);
        await Clients.Caller.SendAsync("MarkdownContent", markdownId, snapshot.Text, snapshot.Revision);
    }

    private async Task RemoveMarkdownForNoteAsync(string boardId, string noteID)
    {
        var entity = await _context.GetAsync<NotesEntity>(TableNames.Notes, boardId, noteID);
        if (entity == null)
        {
            return;
        }

        var note = JsonSerializer.Deserialize<StickyNote>(entity.Data);
        if (note == null || string.IsNullOrEmpty(note.MarkdownId))
        {
            return;
        }

        var prefix = string.IsNullOrEmpty(boardId) ? note.MarkdownId : $"{boardId}/{note.MarkdownId}";

        // Delete only this note's markdown file and its attachment sub-folder.
        // Sibling notes share the board folder, so never delete the whole board path.
        await _blob.DeleteAsync($"{prefix}.md");
        await _blob.DeleteByPrefixAsync($"{prefix}/");
        _markdown.Remove(note.MarkdownId);
    }

    private static bool IsMarkdownGroup(string id)
    {
        return id != null && id.StartsWith(MarkdownGroupPrefix, StringComparison.Ordinal);
    }

    private static (string boardId, string markdownId) ParseMarkdownGroup(string id)
    {
        // Format: "md|{boardId}|{markdownId}" where markdownId never contains '|'.
        var rest = id.Substring(MarkdownGroupPrefix.Length);
        var separator = rest.LastIndexOf('|');
        if (separator < 0)
        {
            return (string.Empty, rest);
        }

        var boardId = rest.Substring(0, separator);
        var markdownId = rest.Substring(separator + 1);
        return (boardId, markdownId);
    }
}
