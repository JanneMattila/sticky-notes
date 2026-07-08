namespace StickyNotes.Data;

public record BlobDownload(Stream Content, string ContentType);

public interface IBlobContext
{
    Task<string?> DownloadTextAsync(string path);

    Task UploadTextAsync(string path, string content);

    Task UploadStreamAsync(string path, Stream content, string contentType);

    Task<BlobDownload?> DownloadAsync(string path);

    Task DeleteAsync(string path);

    Task DeleteByPrefixAsync(string prefix);
}
