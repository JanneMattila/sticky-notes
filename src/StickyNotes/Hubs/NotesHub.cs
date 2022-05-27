using Microsoft.AspNetCore.SignalR;
using StickyNotes.Interfaces;
using System.Collections.Concurrent;
using System.Linq;
using System.Threading.Tasks;

namespace StickyNotes.Hubs;

public class NotesHub : Hub
{
    private static ConcurrentDictionary<string, ConcurrentDictionary<string, StickyNote>> NotesRepository = new();

    public async Task Join(string id)
    {
        await Groups.AddToGroupAsync(Context.ConnectionId, id);
        if (NotesRepository.ContainsKey(id))
        {
            var list = NotesRepository[id].Select(o => o.Value).ToList();
            await Clients.Caller.SendAsync("AllNotes", list);
        }
    }

    public async Task UpdateNote(string id, StickyNote note)
    {
        if (!NotesRepository.ContainsKey(id))
        {
            NotesRepository.TryAdd(id, new ConcurrentDictionary<string, StickyNote>());
        }

        NotesRepository[id].AddOrUpdate(note.ID, note, (updateID, updateNote) =>
        {
            updateNote.Text = note.Text;
            updateNote.Width = note.Width;
            updateNote.Height = note.Height;
            updateNote.Color = note.Color;
            updateNote.Position.X = note.Position.X;
            updateNote.Position.Y = note.Position.Y;
            updateNote.Position.Rotation = note.Position.Rotation;
            return updateNote;
        });
        await Clients.OthersInGroup(id).SendAsync("UpdateNote", note);
    }
}
