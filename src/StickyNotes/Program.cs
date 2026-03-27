using Microsoft.AspNetCore.HttpOverrides;
using StickyNotes.Data;
using StickyNotes.Hubs;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddOptions<NotesContextOptions>()
    .Configure<IConfiguration>((settings, configuration) =>
    {
        settings.StorageConnectionString = configuration["Storage"] ?? throw new InvalidOperationException("Storage connection string is not configured.");
    });
builder.Services.AddSingleton<INotesContext, NotesContext>();
builder.Services.AddSignalR();
builder.Services
    .AddControllersWithViews()
    .AddControllersAsServices();

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseDeveloperExceptionPage();
}
else
{
    app.UseExceptionHandler("/Home/Error");
}

app.UseForwardedHeaders(new ForwardedHeadersOptions
{
    ForwardedHeaders =
        ForwardedHeaders.XForwardedHost |
        ForwardedHeaders.XForwardedFor |
        ForwardedHeaders.XForwardedProto
});

app.UseStaticFiles();

app.UseRouting();

app.MapHub<NotesHub>("Notes");
app.MapControllerRoute(
    name: "default",
    pattern: "{*path}",
    defaults: new { controller = "Pages", action = "Index" });

app.Run();
