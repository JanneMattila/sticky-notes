using Microsoft.AspNetCore.Mvc;
using StickyNotes.Data;

namespace StickyNotes.Controllers;

[Route("api/attachments")]
public class AttachmentsController : Controller
{
    private const long MaxUploadBytes = 20L * 1024 * 1024;

    private readonly IBlobContext _blob;

    public AttachmentsController(IBlobContext blob)
    {
        _blob = blob;
    }

    [HttpGet("{*path}")]
    [ResponseCache(Duration = 3600)]
    public async Task<IActionResult> Get(string path)
    {
        if (string.IsNullOrWhiteSpace(path))
        {
            return NotFound();
        }

        var download = await _blob.DownloadAsync(path);
        if (download == null)
        {
            return NotFound();
        }

        return File(download.Content, download.ContentType);
    }

    [HttpPost("upload")]
    [RequestSizeLimit(MaxUploadBytes)]
    public async Task<IActionResult> Upload([FromQuery] string boardId, [FromQuery] string markdownId, IFormFile file)
    {
        if (file == null || file.Length == 0)
        {
            return BadRequest("Missing file.");
        }

        if (string.IsNullOrWhiteSpace(markdownId))
        {
            return BadRequest("Missing markdownId.");
        }

        if (!file.ContentType.StartsWith("image/", StringComparison.OrdinalIgnoreCase))
        {
            return BadRequest("Only image uploads are supported.");
        }

        var attachmentId = Guid.NewGuid().ToString("N");
        var prefix = string.IsNullOrEmpty(boardId) ? markdownId : $"{boardId}/{markdownId}";
        var blobPath = $"{prefix}/{attachmentId}";

        await using var stream = file.OpenReadStream();
        await _blob.UploadStreamAsync(blobPath, stream, file.ContentType);

        var url = $"{Url.Content("~/")}api/attachments/{blobPath}";
        return Json(new { url });
    }
}
