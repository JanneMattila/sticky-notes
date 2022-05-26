using System.Text.Json.Serialization;

namespace StickyNotes.Models;

public class NotesModel
{
    [JsonPropertyName("id")]
    public string ID { get; internal set; } = string.Empty;
}
