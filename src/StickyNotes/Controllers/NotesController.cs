﻿using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using StickyNotes.Hubs;

namespace StickyNotes.Controllers
{
    [Produces("application/json")]
    [Route("api/Notes")]
    public class NotesController : Controller
    {
        private readonly IHubContext<NotesHub, INotesHub> _notesHub;

        public NotesController(IHubContext<NotesHub, INotesHub> notesHub)
        {
            _notesHub = notesHub;
        }
    }
}
