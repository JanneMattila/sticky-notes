using System.Security.Cryptography;
using System.Text;

namespace StickyNotes.Data;

public static class BoardPartitionKey
{
    private const string EncodedPrefix = "path:";

    public static string FromBoardId(string boardId)
    {
        ArgumentNullException.ThrowIfNull(boardId);

        if (!boardId.Any(IsInvalidTableKeyCharacter))
        {
            return boardId;
        }

        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(boardId));
        return $"{EncodedPrefix}{Convert.ToHexString(hash)}";
    }

    private static bool IsInvalidTableKeyCharacter(char character)
    {
        return character is '/' or '\\' or '#' or '?'
            || character <= '\u001F'
            || character is >= '\u007F' and <= '\u009F';
    }
}
