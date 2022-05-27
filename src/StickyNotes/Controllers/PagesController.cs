using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using StickyNotes.Hubs;
using StickyNotes.Models;
using System.Diagnostics;

namespace StickyNotes.Controllers;

public class PagesController : Controller
{
    private readonly IHubContext<NotesHub> _notesHub;

    public PagesController(IHubContext<NotesHub> notesHub)
    {
        _notesHub = notesHub;
    }

    public IActionResult Index()
    {
        return View();
    }

    public IActionResult Error()
    {
        return View(new ErrorViewModel { RequestId = Activity.Current?.Id ?? HttpContext.TraceIdentifier });
    }
}
