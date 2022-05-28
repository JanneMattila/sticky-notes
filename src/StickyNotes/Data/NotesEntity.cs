using Azure;
using Azure.Data.Tables;
using System;

namespace StickyNotes.Data;

public class NotesEntity : ITableEntity
{
    public NotesEntity()
    {
    }

    public string PartitionKey { get; set; } = string.Empty;

    public string RowKey { get; set; } = string.Empty;

    public DateTimeOffset? Timestamp { get; set; }

    public ETag ETag { get; set; }

    public string Data { get; set; } = string.Empty;
}
