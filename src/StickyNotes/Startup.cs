using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using StickyNotes.Data;
using StickyNotes.Hubs;

namespace StickyNotes;

public class Startup
{
    public Startup(IConfiguration configuration)
    {
        Configuration = configuration;
    }

    public IConfiguration Configuration { get; }

    // This method gets called by the runtime. Use this method to add services to the container.
    public void ConfigureServices(IServiceCollection services)
    {
        services.AddOptions<NotesContextOptions>()
            .Configure<IConfiguration>((settings, configuration) =>
            {
                settings.StorageConnectionString = configuration["Storage"];
            });
        services.AddSingleton<INotesContext, NotesContext>();
        services.AddSignalR();
        services
            .AddControllersWithViews()
            .AddControllersAsServices();
    }

    // This method gets called by the runtime. Use this method to configure the HTTP request pipeline.
    public void Configure(IApplicationBuilder app, IWebHostEnvironment env)
    {
        if (env.IsDevelopment())
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

        app.UseEndpoints(endpoints =>
        {
            endpoints.MapHub<NotesHub>("Notes");
            endpoints.MapControllerRoute(
                name: "default",
                pattern: "{*path}",
                 defaults: new { controller = "Pages", action = "Index" });
        });
    }
}
