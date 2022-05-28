using Azure;
using Azure.Data.Tables;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using System;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace StickyNotes.Data;

public class NotesContext : INotesContext
{
    private readonly ILogger<NotesContext> _log;

    private readonly TableClient _notesTable;
    private bool _initialized = false;

    public NotesContext(ILogger<NotesContext> log, IOptions<NotesContextOptions> options)
    {
        if (options == null)
        {
            throw new ArgumentNullException(nameof(options));
        }

        _log = log;
        _notesTable = new TableClient(options.Value.StorageConnectionString, TableNames.Notes);
    }

    public void Initialize()
    {
        if (!_initialized)
        {
            _notesTable.CreateIfNotExists();
            _initialized = true;
        }
    }

    private TableClient GetTable(string tableName)
    {
        return tableName switch
        {
            TableNames.Notes => _notesTable,
            _ => throw new ArgumentOutOfRangeException(nameof(tableName))
        };
    }

    public async Task<T?> GetAsync<T>(string tableName, string partitionKey, string rowKey)
            where T : class, ITableEntity, new()
    {
        Initialize();
        var table = GetTable(tableName);
        try
        {
            var entity = await table.GetEntityAsync<T>(partitionKey, rowKey);
            return entity.Value as T;
        }
        catch (RequestFailedException ex)
        {
            if (ex.Status != 404)
            {
                throw;
            }
        }
        return null;
    }

    public async Task UpsertAsync<T>(string tableName, T entity)
        where T : ITableEntity
    {
        Initialize();
        var table = GetTable(tableName);
        await table.UpsertEntityAsync<T>(entity);
    }

    public async Task DeleteAsync<T>(string tableName, T entity)
        where T : ITableEntity
    {
        Initialize();
        var table = GetTable(tableName);
        await table.DeleteEntityAsync(entity.PartitionKey, entity.RowKey, ETag.All);
    }

    public async IAsyncEnumerable<T> GetAllAsync<T>(string tableName, string partitionKey)
        where T : class, ITableEntity, new()
    {
        Initialize();
        var table = GetTable(tableName);
        var query = table.QueryAsync<T>($"PartitionKey eq '{partitionKey}'");
        var result = query.AsPages(string.Empty);
        await foreach (var items in result)
        {
            foreach (var item in items.Values)
            {
                yield return item;
            }
        }
    }
}
