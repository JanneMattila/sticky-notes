using System.Text.Json.Serialization;

namespace StickyNotes.Interfaces;

public class Position
{
    [JsonPropertyName("x")]
    public double X { get; set; }

    [JsonPropertyName("y")]
    public double Y { get; set; }

    [JsonPropertyName("rotation")]
    public double Rotation { get; set; }
}
