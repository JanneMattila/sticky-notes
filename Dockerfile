# This Dockerfile contains Build and Release steps:
# 1. Build image(https://hub.docker.com/_/microsoft-dotnet-core-sdk/)
FROM mcr.microsoft.com/dotnet/sdk:7.0.101-alpine3.17-amd64 AS build
WORKDIR /source

# Cache nuget restore
COPY /src/StickyNotes/*.csproj .
RUN dotnet restore StickyNotes.csproj

# Copy sources and compile
COPY /src/StickyNotes .
RUN dotnet publish StickyNotes.csproj --output /app/ --configuration Release

# 2. Release image
FROM mcr.microsoft.com/dotnet/aspnet:7.0.1-alpine3.17-amd64
WORKDIR /app
EXPOSE 80

# Copy content from Build image
COPY --from=build /app .

ENTRYPOINT ["dotnet", "StickyNotes.dll"]
