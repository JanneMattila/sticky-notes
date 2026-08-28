using StickyNotes.Data;

namespace StickyNotes.Tests;

public class BoardPartitionKeyTests
{
    [Theory]
    [InlineData("abc")]
    [InlineData("board-123")]
    [InlineData("team's-board")]
    public void Valid_existing_board_id_is_unchanged(string boardId)
    {
        Assert.Equal(boardId, BoardPartitionKey.FromBoardId(boardId));
    }

    [Theory]
    [InlineData("abc/demo")]
    [InlineData(@"abc\demo")]
    [InlineData("abc#demo")]
    [InlineData("abc?demo")]
    [InlineData("abc\u001Fdemo")]
    [InlineData("abc\u007Fdemo")]
    public void Invalid_table_key_characters_are_mapped_to_safe_partition_key(string boardId)
    {
        var partitionKey = BoardPartitionKey.FromBoardId(boardId);

        Assert.StartsWith("path:", partitionKey);
        Assert.DoesNotContain(partitionKey, character =>
            character is '/' or '\\' or '#' or '?'
            || character <= '\u001F'
            || character is >= '\u007F' and <= '\u009F');
    }

    [Fact]
    public void Nested_path_mapping_is_deterministic_and_distinct_from_literal_encoded_path()
    {
        var first = BoardPartitionKey.FromBoardId("abc/demo");
        var second = BoardPartitionKey.FromBoardId("abc/demo");
        var literalEncodedPath = BoardPartitionKey.FromBoardId("abc%2Fdemo");

        Assert.Equal(first, second);
        Assert.NotEqual(first, literalEncodedPath);
    }
}
