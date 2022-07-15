using System.Text.Json.Serialization;

namespace StickyNotes.Interfaces;

public class StickyNote
{
    [JsonPropertyName("id")]
    public string ID { get; set; } = string.Empty;

    [JsonPropertyName("width")]
    public double Width { get; set; }

    [JsonPropertyName("height")]
    public double Height { get; set; }

    [JsonPropertyName("color")]
    public string Color { get; set; } = string.Empty;

    [JsonPropertyName("position")]
    public Position Position { get; set; } = new();

    [JsonPropertyName("text")]
    public string Text { get; set; } = string.Empty;

    [JsonPropertyName("link")]
    public string Link { get; set; } = string.Empty;
}
