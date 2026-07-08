using Azure;
using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;
using Microsoft.Extensions.Options;

namespace StickyNotes.Data;

public class BlobContext : IBlobContext
{
    public const string ContainerName = "markdown";

    private readonly BlobContainerClient _container;
    private bool _initialized = false;

    public BlobContext(IOptions<NotesContextOptions> options)
    {
        ArgumentNullException.ThrowIfNull(options);

        var serviceClient = new BlobServiceClient(options.Value.StorageConnectionString);
        _container = serviceClient.GetBlobContainerClient(ContainerName);
    }

    private async Task InitializeAsync()
    {
        if (!_initialized)
        {
            await _container.CreateIfNotExistsAsync();
            _initialized = true;
        }
    }

    public async Task<string?> DownloadTextAsync(string path)
    {
        await InitializeAsync();
        var blob = _container.GetBlobClient(path);
        try
        {
            var result = await blob.DownloadContentAsync();
            return result.Value.Content.ToString();
        }
        catch (RequestFailedException ex) when (ex.Status == 404)
        {
            return null;
        }
    }

    public async Task UploadTextAsync(string path, string content)
    {
        await InitializeAsync();
        var blob = _container.GetBlobClient(path);
        await blob.UploadAsync(BinaryData.FromString(content), new BlobUploadOptions
        {
            HttpHeaders = new BlobHttpHeaders { ContentType = "text/markdown; charset=utf-8" }
        });
    }

    public async Task UploadStreamAsync(string path, Stream content, string contentType)
    {
        await InitializeAsync();
        var blob = _container.GetBlobClient(path);
        await blob.UploadAsync(content, new BlobUploadOptions
        {
            HttpHeaders = new BlobHttpHeaders { ContentType = contentType }
        });
    }

    public async Task<BlobDownload?> DownloadAsync(string path)
    {
        await InitializeAsync();
        var blob = _container.GetBlobClient(path);
        try
        {
            var result = await blob.DownloadStreamingAsync();
            var contentType = result.Value.Details.ContentType;
            if (string.IsNullOrEmpty(contentType))
            {
                contentType = "application/octet-stream";
            }
            return new BlobDownload(result.Value.Content, contentType);
        }
        catch (RequestFailedException ex) when (ex.Status == 404)
        {
            return null;
        }
    }

    public async Task DeleteAsync(string path)
    {
        await InitializeAsync();
        await _container.DeleteBlobIfExistsAsync(path);
    }

    public async Task DeleteByPrefixAsync(string prefix)
    {
        await InitializeAsync();
        await foreach (var item in _container.GetBlobsAsync(prefix: prefix))
        {
            await _container.DeleteBlobIfExistsAsync(item.Name);
        }
    }
}
