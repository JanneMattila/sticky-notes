using Microsoft.AspNetCore.Mvc;
using SkiaSharp;
using StickyNotes.Data;
using StickyNotes.Interfaces;
using System.Text.Json;

namespace StickyNotes.Controllers;

[Route("api/[controller]")]
public class PreviewsController : Controller
{
    private const int ImageWidth = 1200;
    private const int ImageHeight = 630;

    private static readonly Dictionary<string, SKColor> NamedColors = new(StringComparer.OrdinalIgnoreCase)
    {
        ["lightyellow"] = new SKColor(255, 255, 224),
        ["lightgreen"] = new SKColor(144, 238, 144),
        ["lightblue"] = new SKColor(173, 216, 230),
        ["lightpink"] = new SKColor(255, 182, 193),
        ["lightgray"] = new SKColor(211, 211, 211),
        ["cyan"] = new SKColor(0, 255, 255),
        ["beige"] = new SKColor(245, 245, 220),
        ["violet"] = new SKColor(238, 130, 238),
        ["magenta"] = new SKColor(255, 0, 255),
        ["orange"] = new SKColor(255, 165, 0),
        ["red"] = new SKColor(255, 0, 0),
    };

    private static readonly SKTypeface RubikTypeface = LoadRubikTypeface();

    private static SKTypeface LoadRubikTypeface()
    {
        // Try variable font from app directory
        var fontPath = Path.Combine(AppContext.BaseDirectory, "wwwroot", "fonts", "Rubik", "Rubik-VariableFont_wght.ttf");
        var typeface = TryLoadTypeface(fontPath);
        if (typeface != null) return typeface;

        // Try static font from app directory
        fontPath = Path.Combine(AppContext.BaseDirectory, "wwwroot", "fonts", "Rubik", "static", "Rubik-Regular.ttf");
        typeface = TryLoadTypeface(fontPath);
        if (typeface != null) return typeface;

        return SKTypeface.Default;
    }

    private static SKTypeface? TryLoadTypeface(string path)
    {
        if (!System.IO.File.Exists(path)) return null;
        return SKTypeface.FromFile(path);
    }

    private readonly INotesContext _context;

    public PreviewsController(INotesContext context)
    {
        _context = context;
    }

    [HttpGet("{*id}")]
    [ResponseCache(Duration = 60)]
    public async Task<IActionResult> Get(string id)
    {
        var notes = new List<StickyNote>();
        await foreach (var entity in _context.GetAllAsync<NotesEntity>(TableNames.Notes, id))
        {
            var note = JsonSerializer.Deserialize<StickyNote>(entity.Data);
            if (note != null)
            {
                notes.Add(note);
            }
        }

        if (notes.Count == 0)
        {
            return Redirect(Url.Content("~/stickynotes.png"));
        }

        var imageBytes = RenderNotesAsImage(notes);
        return File(imageBytes, "image/png");
    }

    private static byte[] RenderNotesAsImage(List<StickyNote> notes)
    {
        // Find bounding box of all notes
        double minX = double.MaxValue, minY = double.MaxValue;
        double maxX = double.MinValue, maxY = double.MinValue;

        foreach (var note in notes)
        {
            if (note.Position.X < minX) minX = note.Position.X;
            if (note.Position.Y < minY) minY = note.Position.Y;
            if (note.Position.X + note.Width > maxX) maxX = note.Position.X + note.Width;
            if (note.Position.Y + note.Height > maxY) maxY = note.Position.Y + note.Height;
        }

        double contentWidth = maxX - minX + 40;
        double contentHeight = maxY - minY + 40;

        // Scale to fit image
        double scaleX = ImageWidth / contentWidth;
        double scaleY = ImageHeight / contentHeight;
        double scale = Math.Min(scaleX, scaleY);
        if (scale > 1) scale = 1;

        double offsetX = (ImageWidth - contentWidth * scale) / 2 - minX * scale + 20 * scale;
        double offsetY = (ImageHeight - contentHeight * scale) / 2 - minY * scale + 20 * scale;

        using var surface = SKSurface.Create(new SKImageInfo(ImageWidth, ImageHeight));
        var canvas = surface.Canvas;
        canvas.Clear(SKColors.White);

        // Sort by z-index
        var sorted = notes.OrderBy(n => n.Position.Z).ToList();

        foreach (var note in sorted)
        {
            float x = (float)(note.Position.X * scale + offsetX);
            float y = (float)(note.Position.Y * scale + offsetY);
            float w = (float)(note.Width * scale);
            float h = (float)(note.Height * scale);

            var rect = new SKRect(x, y, x + w, y + h);

            canvas.Save();
            if (note.Position.Rotation != 0)
            {
                canvas.RotateDegrees((float)note.Position.Rotation, x + w / 2, y + h / 2);
            }

            // Shadow
            using (var shadowPaint = new SKPaint())
            {
                shadowPaint.Color = new SKColor(0, 0, 0, 50);
                shadowPaint.Style = SKPaintStyle.Fill;
                canvas.DrawRoundRect(rect.Left + 3, rect.Top + 3, rect.Width, rect.Height, 5, 5, shadowPaint);
            }

            // Background
            var bgColor = ParseColor(note.Color);
            using (var bgPaint = new SKPaint())
            {
                bgPaint.Color = bgColor;
                bgPaint.Style = SKPaintStyle.Fill;
                canvas.DrawRoundRect(rect, 5, 5, bgPaint);
            }

            // Border
            using (var borderPaint = new SKPaint())
            {
                borderPaint.Color = new SKColor(0, 0, 0, 100);
                borderPaint.Style = SKPaintStyle.Stroke;
                borderPaint.StrokeWidth = 1;
                canvas.DrawRoundRect(rect, 5, 5, borderPaint);
            }

            // Text
            if (!string.IsNullOrEmpty(note.Text))
            {
                float fontSize = (float)(24 * scale);
                if (fontSize < 8) fontSize = 8;
                using var font = new SKFont(RubikTypeface, fontSize);
                using var textPaint = new SKPaint();
                textPaint.Color = SKColors.Black;
                textPaint.IsAntialias = true;

                float textX = x + (float)(10 * scale);
                float textY = y + (float)(10 * scale) + fontSize;
                float maxTextWidth = w - (float)(20 * scale);

                var lines = note.Text.Split('\n');
                foreach (var line in lines)
                {
                    if (textY > y + h) break;

                    // Simple word wrap
                    var remaining = line;
                    while (remaining.Length > 0 && textY <= y + h)
                    {
                        int charsFit = (int)font.BreakText(remaining, maxTextWidth);
                        if (charsFit <= 0) break;
                        if (charsFit < remaining.Length)
                        {
                            // Break at last space
                            int lastSpace = remaining.LastIndexOf(' ', charsFit - 1);
                            if (lastSpace > 0) charsFit = lastSpace + 1;
                        }
                        var segment = remaining[..charsFit].TrimEnd();
                        canvas.DrawText(segment, textX, textY, SKTextAlign.Left, font, textPaint);
                        remaining = remaining[charsFit..].TrimStart();
                        textY += fontSize * 1.2f;
                    }
                }
            }

            canvas.Restore();
        }

        using var image = surface.Snapshot();
        using var data = image.Encode(SKEncodedImageFormat.Png, 80);
        return data.ToArray();
    }

    private static SKColor ParseColor(string color)
    {
        if (string.IsNullOrEmpty(color))
            return new SKColor(255, 255, 224); // lightyellow default

        if (NamedColors.TryGetValue(color, out var namedColor))
            return namedColor;

        if (SKColor.TryParse(color, out var parsed))
            return parsed;

        return new SKColor(255, 255, 224);
    }
}
