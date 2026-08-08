using Momentum.Library.Application.Approvals;
using Momentum.Library.Application.Comments;
using Momentum.Library.Application.Engagement;
using Momentum.Library.Application.Ports;
using Momentum.Library.Application.Requests;
using Momentum.Library.Application.Triage;
using Momentum.Library.Infrastructure.AzureStorage;
using Momentum.Library.Infrastructure.GitHub;
using Momentum.Library.Runtime;
using Microsoft.Azure.Functions.Worker.Builder;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

var builder = FunctionsApplication.CreateBuilder(args);

var fallbackConnectionString = Environment.GetEnvironmentVariable("MOMENTUM_STORAGE_CONNECTION_STRING")
    ?? "UseDevelopmentStorage=true";
var tableConnectionString = builder.Configuration.GetConnectionString("tables")
    ?? fallbackConnectionString;
var queueConnectionString = builder.Configuration.GetConnectionString("queues")
    ?? Environment.GetEnvironmentVariable("MOMENTUM_STORAGE_CONNECTION_STRING")
    ?? "UseDevelopmentStorage=true";

builder.Services.AddCatalystStorage(tableConnectionString, queueConnectionString);
builder.Services.AddScoped<IAgentTriageRuntime>(_ => new AgentTriageRuntime());
builder.Services.AddScoped<IRepositoryReader, GitHubMcpClient>();
builder.Services.AddScoped<CreateRequestHandler>();
builder.Services.AddScoped<CreateSolutionHandler>();
builder.Services.AddScoped<UpdateRequestHandler>();
builder.Services.AddScoped<AcceptRequestHandler>();
builder.Services.AddScoped<RejectRequestHandler>();
builder.Services.AddScoped<LinkSolutionToRequestHandler>();
builder.Services.AddScoped<UnlinkSolutionFromRequestHandler>();
builder.Services.AddScoped<SelectCanonicalSolutionHandler>();
builder.Services.AddScoped<StartSolutionUseHandler>();
builder.Services.AddScoped<UpdateSolutionUseHandler>();
builder.Services.AddScoped<CompleteSolutionUseHandler>();
builder.Services.AddScoped<AddVoteHandler>();
builder.Services.AddScoped<RemoveVoteHandler>();
builder.Services.AddScoped<AddCommentHandler>();
builder.Services.AddScoped<GetCommentsHandler>();
builder.Services.AddScoped<PublishRequestHandler>();
builder.Services.AddScoped<PublishSolutionHandler>();
builder.Services.AddScoped<RunCreationTriageHandler>();
builder.Services.AddScoped<RunAcceptanceTriageHandler>();

await builder.Build().RunAsync();
