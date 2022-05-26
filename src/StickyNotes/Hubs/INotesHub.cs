using StickyNotes.Models;
using System.Threading.Tasks;

namespace StickyNotes.Hubs;

public interface INotesHub
{
    Task Echo(NotesModel notesModel);
}