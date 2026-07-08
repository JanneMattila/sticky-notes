using Microsoft.Extensions.Logging;
using StickyNotes.Data;
using System.Collections.Concurrent;

namespace StickyNotes.Services;

/// <summary>
/// Holds the authoritative state of markdown documents that currently have
/// at least one editor or viewer connected. Edits are applied as exact,
/// revision-gated single-range splices so concurrent clients cannot diverge:
/// a splice is only accepted when its base revision matches the server
/// revision, otherwise the caller is told to resynchronize.
/// </summary>
public class MarkdownDocumentService
{
    private static readonly TimeSpan FlushDelay = TimeSpan.FromSeconds(2);

    private readonly IBlobContext _blob;
    private readonly ILogger<MarkdownDocumentService> _log;
    private readonly ConcurrentDictionary<string, DocState> _docs = new();

    public MarkdownDocumentService(IBlobContext blob, ILogger<MarkdownDocumentService> log)
    {
        _blob = blob;
        _log = log;
    }

    public record Snapshot(string Text, long Revision);

    public record UpdateResult(bool Accepted, long Revision, string? Text);

    private sealed class DocState
    {
        public string Text = string.Empty;
        public long Revision;
        public int Viewers;
        public bool Loaded;
        public bool Dirty;
        public readonly SemaphoreSlim Lock = new(1, 1);
        public CancellationTokenSource? FlushCts;
    }

    private static string BlobPath(string boardId, string markdownId)
    {
        return string.IsNullOrEmpty(boardId)
            ? $"{markdownId}.md"
            : $"{boardId}/{markdownId}.md";
    }

    private async Task EnsureLoadedAsync(string boardId, string markdownId, DocState doc)
    {
        if (!doc.Loaded)
        {
            var stored = await _blob.DownloadTextAsync(BlobPath(boardId, markdownId));
            doc.Text = stored ?? string.Empty;
            doc.Loaded = true;
        }
    }

    public async Task<Snapshot> JoinAsync(string boardId, string markdownId)
    {
        var doc = _docs.GetOrAdd(markdownId, _ => new DocState());
        await doc.Lock.WaitAsync();
        try
        {
            await EnsureLoadedAsync(boardId, markdownId, doc);
            doc.Viewers++;
            return new Snapshot(doc.Text, doc.Revision);
        }
        finally
        {
            doc.Lock.Release();
        }
    }

    public async Task LeaveAsync(string boardId, string markdownId)
    {
        if (!_docs.TryGetValue(markdownId, out var doc))
        {
            return;
        }

        await doc.Lock.WaitAsync();
        try
        {
            doc.Viewers--;
            if (doc.Viewers <= 0)
            {
                doc.Viewers = 0;
                doc.FlushCts?.Cancel();
                if (doc.Dirty)
                {
                    await _blob.UploadTextAsync(BlobPath(boardId, markdownId), doc.Text);
                    doc.Dirty = false;
                }
                _docs.TryRemove(markdownId, out _);
            }
        }
        finally
        {
            doc.Lock.Release();
        }
    }

    public async Task<Snapshot> GetAsync(string boardId, string markdownId)
    {
        var doc = _docs.GetOrAdd(markdownId, _ => new DocState());
        await doc.Lock.WaitAsync();
        try
        {
            await EnsureLoadedAsync(boardId, markdownId, doc);
            return new Snapshot(doc.Text, doc.Revision);
        }
        finally
        {
            doc.Lock.Release();
        }
    }

    public async Task<UpdateResult> ApplyAsync(string boardId, string markdownId, long baseRevision, int start, int deleteCount, string insert)
    {
        var doc = _docs.GetOrAdd(markdownId, _ => new DocState());
        await doc.Lock.WaitAsync();
        try
        {
            await EnsureLoadedAsync(boardId, markdownId, doc);

            if (baseRevision != doc.Revision)
            {
                // Someone else changed the document first; the caller must resync.
                return new UpdateResult(false, doc.Revision, doc.Text);
            }

            if (start < 0 || deleteCount < 0 || start > doc.Text.Length || start + deleteCount > doc.Text.Length)
            {
                // Out-of-bounds splice; force a resync rather than corrupt the document.
                return new UpdateResult(false, doc.Revision, doc.Text);
            }

            insert ??= string.Empty;
            doc.Text = string.Concat(
                doc.Text.AsSpan(0, start),
                insert,
                doc.Text.AsSpan(start + deleteCount));
            doc.Revision++;
            doc.Dirty = true;
            ScheduleFlush(boardId, markdownId, doc);

            return new UpdateResult(true, doc.Revision, null);
        }
        finally
        {
            doc.Lock.Release();
        }
    }

    public void Remove(string markdownId)
    {
        if (_docs.TryRemove(markdownId, out var doc))
        {
            doc.FlushCts?.Cancel();
        }
    }

    private void ScheduleFlush(string boardId, string markdownId, DocState doc)
    {
        doc.FlushCts?.Cancel();
        var cts = new CancellationTokenSource();
        doc.FlushCts = cts;

        _ = Task.Run(async () =>
        {
            try
            {
                await Task.Delay(FlushDelay, cts.Token);
                await doc.Lock.WaitAsync(cts.Token);
                try
                {
                    if (doc.Dirty)
                    {
                        await _blob.UploadTextAsync(BlobPath(boardId, markdownId), doc.Text);
                        doc.Dirty = false;
                    }
                }
                finally
                {
                    doc.Lock.Release();
                }
            }
            catch (OperationCanceledException)
            {
                // A newer edit rescheduled the flush; nothing to do.
            }
            catch (Exception ex)
            {
                _log.LogError(ex, "Failed to flush markdown document {MarkdownId} to blob storage.", markdownId);
            }
        });
    }
}
