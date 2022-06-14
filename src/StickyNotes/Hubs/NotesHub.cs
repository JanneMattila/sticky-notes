using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Logging;
using StickyNotes.Data;
using StickyNotes.Interfaces;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;

namespace StickyNotes.Hubs;

public class NotesHub : Hub
{
    protected readonly ILogger _log;
    protected readonly INotesContext _context;

    public NotesHub(ILogger<NotesHub> log, INotesContext context)
    {
        _log = log;
        _context = context;
    }

    public async Task Join(string id)
    {
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

        if (notes.Any())
        {
            await Clients.Caller.SendAsync("AllNotes", notes);
        }
    }

    public async Task Leave(string id)
    {
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, id);
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
            tasks.Add(_context.DeleteAsync(TableNames.Notes, new NotesEntity()
            {
                PartitionKey = id,
                RowKey = noteID
            }));
        }

        Task.WaitAll(tasks.ToArray());
        await Clients.OthersInGroup(id).SendAsync("DeleteNotes", noteIDs);
    }
}
