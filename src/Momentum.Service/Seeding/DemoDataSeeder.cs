using Azure.Data.Tables;
using Azure.Storage.Blobs;
using Momentum.Library.Application.Ports;
using Momentum.Library.Domain.Auditing;
using Momentum.Library.Domain.Comments;
using Momentum.Library.Domain.Engagement;
using Momentum.Library.Domain.Identity;
using Momentum.Library.Domain.Requests;
using Momentum.Library.Domain.Reviews;
using Momentum.Library.Domain.Solutions;
using Momentum.Library.Domain.Visibility;
using Momentum.Library.Infrastructure.AzureStorage;

namespace Momentum.Service.Seeding;

/// <summary>
/// Wipes this application's storage and writes a demonstration dataset — the
/// Innovation Hub as it looks once people are using it.
///
/// Destructive by design, so it only ever touches the tables and container this
/// application owns, and refuses to run against anything but local emulator
/// storage unless explicitly forced.
/// </summary>
public static class DemoDataSeeder
{
    private static readonly DateTimeOffset Now = DateTimeOffset.UtcNow;

    private static readonly UserId Dev = new("dev@localhost");
    private static readonly UserId Priya = new("priya.raman@contoso.com");
    private static readonly UserId Marcus = new("marcus.webb@contoso.com");
    private static readonly UserId Ana = new("ana.silva@contoso.com");
    private static readonly UserId Tom = new("tom.okafor@contoso.com");
    private static readonly UserId Lena = new("lena.fischer@contoso.com");
    private static readonly UserId Sam = new("sam.patel@contoso.com");
    private static readonly UserId Rose = new("rose.nakamura@contoso.com");

    public static bool IsEmulatorStorage(string connectionString) =>
        connectionString.Contains("UseDevelopmentStorage=true", StringComparison.OrdinalIgnoreCase)
        || connectionString.Contains("127.0.0.1", StringComparison.OrdinalIgnoreCase)
        || connectionString.Contains("localhost", StringComparison.OrdinalIgnoreCase)
        || connectionString.Contains("azurite", StringComparison.OrdinalIgnoreCase);

    public static async Task Reset(
        TableStorageOptions tableOptions,
        BlobStorageOptions blobOptions,
        CancellationToken cancellationToken = default)
    {
        var tables = new TableServiceClient(tableOptions.ConnectionString);
        foreach (var name in AppTableNames)
        {
            await tables.DeleteTableAsync(name, cancellationToken);
        }

        var blobs = new BlobServiceClient(blobOptions.ConnectionString);
        await blobs.GetBlobContainerClient(blobOptions.AttachmentsContainer)
            .DeleteIfExistsAsync(cancellationToken: cancellationToken);

        // Azurite needs a moment before a name can be reused.
        await Task.Delay(TimeSpan.FromSeconds(1), cancellationToken);
    }

    private static IEnumerable<string> AppTableNames => new[]
    {
        StorageTableNames.Requests,
        StorageTableNames.Solutions,
        StorageTableNames.RequestSolutions,
        StorageTableNames.SolutionUses,
        StorageTableNames.Comments,
        StorageTableNames.Decisions,
        StorageTableNames.AuditRecords,
        StorageTableNames.AgentRuns,
        StorageTableNames.ProcessedEvents,
        StorageTableNames.Outbox,
        StorageTableNames.ProjectionState,
        StorageTableNames.Votes,
        StorageTableNames.Contributions
    };

    public static async Task Seed(IServiceProvider services)
    {
        var requests = services.GetRequiredService<IRequestRepository>();
        var solutions = services.GetRequiredService<ISolutionRepository>();
        var relationships = services.GetRequiredService<IRequestSolutionRepository>();
        var uses = services.GetRequiredService<ISolutionUseRepository>();
        var comments = services.GetRequiredService<ICommentRepository>();
        var votes = services.GetRequiredService<IVoteRepository>();
        var contributions = services.GetRequiredService<IContributionRepository>();
        var decisions = services.GetRequiredService<IAcceptanceDecisionRepository>();
        var attachments = services.GetRequiredService<IAttachmentStore>();
        var audit = services.GetRequiredService<IAuditRepository>();

        // ---------- Solutions ----------

        var reviewCopilot = new Solution
        {
            Title = "PR Review Copilot",
            Description =
                "A GitHub Action that leaves a first-pass review on every pull request: flags missing tests, "
                + "inconsistent error handling, and public API changes that skipped the changelog. Tuned on two "
                + "years of our own review comments, so it argues the way our reviewers actually argue.",
            Type = SolutionType.Service,
            RepositoryReference = new RepositoryReference("contoso", "pr-review-copilot", "https://github.com/contoso/pr-review-copilot"),
            Tags = new[] { "GitHub Actions", "Code Review", "Developer Experience", "AI" },
            DemoUrl = "https://demo.contoso.com/pr-review-copilot",
            SubmittedBy = Marcus,
            Owner = Marcus,
            Status = SolutionStatus.Published,
            UseCount = 4,
            AdoptedByProjects = new[] { "Payments", "Identity", "Mobile", "Data Platform" },
            CreatedAt = Now.AddDays(-96),
            UpdatedAt = Now.AddDays(-3),
            PublishedAt = Now.AddDays(-90)
        };

        var onboardingKit = new Solution
        {
            Title = "Two-Day Onboarding Kit",
            Description =
                "Everything a new engineer needs in their first 48 hours: a dev container that builds on first try, "
                + "seeded local data, a guided tour of the service map, and a checklist their buddy can see. "
                + "Cut time-to-first-merged-PR from eleven days to two.",
            Type = SolutionType.Template,
            RepositoryReference = new RepositoryReference("contoso", "onboarding-kit", "https://github.com/contoso/onboarding-kit"),
            Tags = new[] { "Onboarding", "Dev Containers", "Developer Experience", "Documentation" },
            DemoUrl = "https://demo.contoso.com/onboarding-kit",
            SubmittedBy = Ana,
            Owner = Ana,
            Status = SolutionStatus.Published,
            UseCount = 6,
            AdoptedByProjects = new[] { "Payments", "Identity", "Mobile", "Data Platform", "Growth", "Support Tools" },
            CreatedAt = Now.AddDays(-140),
            UpdatedAt = Now.AddDays(-8),
            PublishedAt = Now.AddDays(-136)
        };

        var costLens = new Solution
        {
            Title = "Cloud Cost Lens",
            Description =
                "Puts a running cost figure on every service dashboard and posts a weekly digest naming the three "
                + "biggest movers. No new tooling to learn — it reads the tags teams already apply.",
            Type = SolutionType.Application,
            RepositoryReference = new RepositoryReference("contoso", "cost-lens", "https://github.com/contoso/cost-lens"),
            Tags = new[] { "FinOps", "Azure", "Observability", "Dashboards" },
            DemoUrl = "https://demo.contoso.com/cost-lens",
            SubmittedBy = Tom,
            Owner = Tom,
            Status = SolutionStatus.Published,
            UseCount = 2,
            AdoptedByProjects = new[] { "Data Platform", "Payments" },
            CreatedAt = Now.AddDays(-54),
            UpdatedAt = Now.AddDays(-2),
            PublishedAt = Now.AddDays(-48)
        };

        var designTokens = new Solution
        {
            Title = "Shared Design Tokens",
            Description =
                "One source of truth for colour, spacing, and type, published as CSS variables, a Figma library, "
                + "and an npm package. Change a token once and it lands everywhere on the next release.",
            Type = SolutionType.Library,
            RepositoryReference = new RepositoryReference("contoso", "design-tokens", "https://github.com/contoso/design-tokens"),
            Tags = new[] { "Design System", "Figma", "Accessibility", "Frontend" },
            DemoUrl = "https://demo.contoso.com/design-tokens",
            SubmittedBy = Lena,
            Owner = Lena,
            Status = SolutionStatus.Published,
            UseCount = 3,
            AdoptedByProjects = new[] { "Mobile", "Growth", "Support Tools" },
            CreatedAt = Now.AddDays(-71),
            UpdatedAt = Now.AddDays(-11),
            PublishedAt = Now.AddDays(-66)
        };

        var incidentTimeline = new Solution
        {
            Title = "Incident Timeline Builder",
            Description =
                "Assembles the first draft of a postmortem timeline from alerts, deploys, and chat, so the write-up "
                + "starts from evidence instead of memory. Still rough around merge conflicts in the narrative.",
            Type = SolutionType.Pattern,
            RepositoryReference = new RepositoryReference("contoso", "incident-timeline", "https://github.com/contoso/incident-timeline"),
            Tags = new[] { "Incident Response", "Postmortems", "Reliability" },
            SubmittedBy = Sam,
            Owner = Sam,
            // Waiting on a reviewer, so it is visible only to reviewers and Sam.
            Status = SolutionStatus.AwaitingApproval,
            UseCount = 1,
            AdoptedByProjects = new[] { "Identity" },
            CreatedAt = Now.AddDays(-19),
            UpdatedAt = Now.AddDays(-6),
            PublishedAt = Now.AddDays(-16)
        };

        // Restricted: commercially sensitive, approvers and admins only.
        var vendorScorecard = new Solution
        {
            Title = "Vendor Spend Scorecard",
            Description =
                "Per-vendor spend, contract dates, and renewal risk in one view, with the negotiation notes attached. "
                + "Kept to approvers while the current renewals are in flight.",
            Type = SolutionType.Application,
            RepositoryReference = new RepositoryReference("contoso", "vendor-scorecard", "https://github.com/contoso/vendor-scorecard"),
            Tags = new[] { "Procurement", "FinOps", "Contracts" },
            DemoUrl = "https://demo.contoso.com/vendor-scorecard",
            SubmittedBy = Rose,
            Owner = Rose,
            Visibility = ItemVisibility.Approvers,
            Status = SolutionStatus.Published,
            UseCount = 1,
            AdoptedByProjects = new[] { "Finance Ops" },
            CreatedAt = Now.AddDays(-27),
            UpdatedAt = Now.AddDays(-4),
            PublishedAt = Now.AddDays(-25)
        };

        // Hidden: superseded, kept for the record. Administrators only.
        var legacyExporter = new Solution
        {
            Title = "Legacy Report Exporter",
            Description =
                "The old nightly CSV export. Superseded by Cloud Cost Lens and hidden from the hub so nobody adopts "
                + "it by accident, but kept so the history and its links survive.",
            Type = SolutionType.Other,
            RepositoryReference = new RepositoryReference("contoso", "legacy-exporter", "https://github.com/contoso/legacy-exporter"),
            Tags = new[] { "Reporting", "Deprecated" },
            SubmittedBy = Tom,
            Owner = Tom,
            Visibility = ItemVisibility.Hidden,
            Status = SolutionStatus.Retired,
            CreatedAt = Now.AddDays(-210),
            UpdatedAt = Now.AddDays(-30),
            PublishedAt = Now.AddDays(-205)
        };

        var allSolutions = new[]
        {
            reviewCopilot, onboardingKit, costLens, designTokens,
            incidentTimeline, vendorScorecard, legacyExporter
        };
        foreach (var solution in allSolutions) await solutions.Save(solution);

        // ---------- Ideas ----------

        var flakyTests = new Request
        {
            Type = RequestType.Backlog,
            Status = RequestStatus.Accepted,
            SubmittedBy = Priya,
            Title = "Stop flaky tests from blocking releases",
            Tags = new[] { "CI/CD", "Testing", "Developer Experience" },
            Description =
                "Our pipeline fails about one run in six for reasons unrelated to the change. People have learned to "
                + "hit retry without reading the failure, which is exactly how a real break gets waved through. "
                + "I would like a way to quarantine known-flaky tests automatically and hold the owning team to a "
                + "fix-by date.",
            CreatedAt = Now.AddDays(-34),
            UpdatedAt = Now.AddDays(-2)
        };

        var onboardingIdea = new Request
        {
            Type = RequestType.Backlog,
            Status = RequestStatus.Accepted,
            SubmittedBy = Ana,
            Title = "New engineers should ship something real in week one",
            Tags = new[] { "Onboarding", "Developer Experience" },
            Description =
                "Two weeks of environment setup before a first commit is normal here and it should not be. "
                + "The goal: a new joiner opens their laptop on day one and has a merged, deployed change by Friday.",
            CanonicalSolutionId = onboardingKit.Id,
            CreatedAt = Now.AddDays(-150),
            UpdatedAt = Now.AddDays(-8)
        };

        var costIdea = new Request
        {
            Type = RequestType.Backlog,
            Status = RequestStatus.Accepted,
            SubmittedBy = Tom,
            Title = "Make cloud spend visible to the teams who cause it",
            Tags = new[] { "FinOps", "Azure", "Observability" },
            Description =
                "Today cost lands as a monthly surprise on one finance dashboard nobody engineering-side reads. "
                + "If the team that doubled a query's cost saw it the same week, most of this would fix itself.",
            CreatedAt = Now.AddDays(-60),
            UpdatedAt = Now.AddDays(-2)
        };

        var reviewIdea = new Request
        {
            Type = RequestType.Backlog,
            Status = RequestStatus.Accepted,
            SubmittedBy = Marcus,
            Title = "Cut the wait for a first code review",
            Tags = new[] { "Code Review", "Developer Experience", "AI" },
            Description =
                "Median time to first review is 19 hours, which means a day lost per change. Most of what the first "
                + "reviewer says is mechanical and could be said instantly by a machine.",
            CanonicalSolutionId = reviewCopilot.Id,
            CreatedAt = Now.AddDays(-100),
            UpdatedAt = Now.AddDays(-3)
        };

        var designDrift = new Request
        {
            Type = RequestType.Backlog,
            Status = RequestStatus.Accepted,
            SubmittedBy = Lena,
            Title = "Our products no longer look like the same company",
            Tags = new[] { "Design System", "Frontend", "Brand" },
            Description =
                "Four teams, four blues, three spacing scales. Customers notice, and every new surface re-litigates "
                + "decisions we already made.",
            CreatedAt = Now.AddDays(-80),
            UpdatedAt = Now.AddDays(-11)
        };

        var searchIdea = new Request
        {
            Type = RequestType.Backlog,
            Status = RequestStatus.AwaitingApproval,
            SubmittedBy = Sam,
            Title = "Search across our internal docs actually works",
            Tags = new[] { "Search", "Documentation", "Knowledge Management" },
            Description =
                "Runbooks, ADRs, and the wiki are three separate searches and none of them find the thing. "
                + "People ask in chat instead, which is why the same question gets answered four times a month.",
            CreatedAt = Now.AddDays(-5),
            UpdatedAt = Now.AddDays(-5)
        };

        var accessibilityIdea = new Request
        {
            Type = RequestType.Backlog,
            Status = RequestStatus.AwaitingApproval,
            SubmittedBy = Rose,
            Title = "Catch accessibility problems before customers do",
            Tags = new[] { "Accessibility", "CI/CD", "Frontend" },
            Description =
                "We fixed 30 contrast and focus-order issues last quarter, every one of them reported from outside. "
                + "These are the cheapest bugs in the world to catch in CI and the most embarrassing to ship.",
            CreatedAt = Now.AddDays(-2),
            UpdatedAt = Now.AddDays(-2)
        };

        var mobileOffline = new Request
        {
            Type = RequestType.Backlog,
            Status = RequestStatus.Created,
            SubmittedBy = Priya,
            Title = "The mobile app should survive a tunnel",
            Tags = new[] { "Mobile", "Offline", "Reliability" },
            Description =
                "Field staff lose connectivity constantly and the app currently loses their work with it. "
                + "Queue the writes, reconcile on reconnect, and stop making people retype forms.",
            CreatedAt = Now.AddDays(-9),
            UpdatedAt = Now.AddDays(-9)
        };

        var releaseNotes = new Request
        {
            Type = RequestType.Backlog,
            Status = RequestStatus.Created,
            SubmittedBy = Marcus,
            Title = "Release notes that a customer could actually read",
            Tags = new[] { "Release Management", "Documentation", "Support" },
            Description =
                "Ours are a dump of commit subjects. Support rewrites them by hand every release, which is both "
                + "waste and a game of telephone.",
            CreatedAt = Now.AddDays(-13),
            UpdatedAt = Now.AddDays(-13)
        };

        var rejectedIdea = new Request
        {
            Type = RequestType.Backlog,
            Status = RequestStatus.Rejected,
            SubmittedBy = Sam,
            Title = "Move every service to a single shared database",
            Tags = new[] { "Architecture", "Data" },
            Description =
                "One database would make joins easy and remove the sync code we keep writing.",
            CreatedAt = Now.AddDays(-45),
            UpdatedAt = Now.AddDays(-40)
        };

        // Restricted: names a partner, so approvers and admins only.
        var partnerIdea = new Request
        {
            Type = RequestType.Backlog,
            Status = RequestStatus.AwaitingApproval,
            SubmittedBy = Rose,
            Visibility = ItemVisibility.Approvers,
            Title = "Rebuild the Northwind partner integration before renewal",
            Tags = new[] { "Integrations", "Partners", "Contracts" },
            Description =
                "The integration is held together by a nightly job nobody owns, and the contract is up in March. "
                + "Restricted while commercial terms are being discussed.",
            CreatedAt = Now.AddDays(-7),
            UpdatedAt = Now.AddDays(-7)
        };

        var allRequests = new[]
        {
            flakyTests, onboardingIdea, costIdea, reviewIdea, designDrift, searchIdea,
            accessibilityIdea, mobileOffline, releaseNotes, rejectedIdea, partnerIdea
        };
        foreach (var request in allRequests) await requests.Save(request);

        // ---------- Links between ideas and solutions ----------

        await Link(relationships, reviewIdea, reviewCopilot, RequestSolutionRelationship.Existing, Marcus, Now.AddDays(-88));
        await Link(relationships, flakyTests, reviewCopilot, RequestSolutionRelationship.Relevant, Priya, Now.AddDays(-30), ApprovalState.Pending);
        await Link(relationships, onboardingIdea, onboardingKit, RequestSolutionRelationship.Existing, Ana, Now.AddDays(-134));
        await Link(relationships, costIdea, costLens, RequestSolutionRelationship.Existing, Tom, Now.AddDays(-46));
        await Link(relationships, costIdea, legacyExporter, RequestSolutionRelationship.Proposed, Tom, Now.AddDays(-52));
        await Link(relationships, designDrift, designTokens, RequestSolutionRelationship.Existing, Lena, Now.AddDays(-64));
        await Link(relationships, searchIdea, incidentTimeline, RequestSolutionRelationship.Proposed, Sam, Now.AddDays(-4), ApprovalState.Pending);
        await Link(relationships, partnerIdea, vendorScorecard, RequestSolutionRelationship.Relevant, Rose, Now.AddDays(-6));

        // ---------- Adoption ----------

        await Use(uses, reviewCopilot, Marcus, "Payments", "Payments", SolutionUseStatus.Using, Now.AddDays(-70), completed: Now.AddDays(-40));
        await Use(uses, reviewCopilot, Priya, "Identity", "Identity", SolutionUseStatus.Using, Now.AddDays(-52), completed: Now.AddDays(-20));
        await Use(uses, reviewCopilot, Lena, "Mobile", "Mobile", SolutionUseStatus.Implementing, Now.AddDays(-14));
        await Use(uses, reviewCopilot, Tom, "Data Platform", "Data Platform", SolutionUseStatus.Exploring, Now.AddDays(-3));

        await Use(uses, onboardingKit, Ana, "Payments", "Payments", SolutionUseStatus.Using, Now.AddDays(-120), completed: Now.AddDays(-100));
        await Use(uses, onboardingKit, Priya, "Identity", "Identity", SolutionUseStatus.Using, Now.AddDays(-110), completed: Now.AddDays(-95));
        await Use(uses, onboardingKit, Marcus, "Mobile", "Mobile", SolutionUseStatus.Using, Now.AddDays(-88), completed: Now.AddDays(-70));
        await Use(uses, onboardingKit, Tom, "Data Platform", "Data Platform", SolutionUseStatus.Using, Now.AddDays(-60), completed: Now.AddDays(-44));
        await Use(uses, onboardingKit, Sam, "Growth", "Growth", SolutionUseStatus.Implementing, Now.AddDays(-12));
        await Use(uses, onboardingKit, Rose, "Support Tools", "Support Tools", SolutionUseStatus.Exploring, Now.AddDays(-5));

        await Use(uses, costLens, Tom, "Data Platform", "Data Platform", SolutionUseStatus.Using, Now.AddDays(-40), completed: Now.AddDays(-18));
        await Use(uses, costLens, Marcus, "Payments", "Payments", SolutionUseStatus.Implementing, Now.AddDays(-9));

        await Use(uses, designTokens, Lena, "Mobile", "Mobile", SolutionUseStatus.Using, Now.AddDays(-58), completed: Now.AddDays(-30));
        await Use(uses, designTokens, Sam, "Growth", "Growth", SolutionUseStatus.Implementing, Now.AddDays(-16));
        await Use(uses, designTokens, Rose, "Support Tools", "Support Tools", SolutionUseStatus.Exploring, Now.AddDays(-6));

        await Use(uses, incidentTimeline, Priya, "Identity", "Identity", SolutionUseStatus.Exploring, Now.AddDays(-6));
        await Use(uses, vendorScorecard, Rose, "Finance Ops", "Finance Ops", SolutionUseStatus.Implementing, Now.AddDays(-11));

        // ---------- Upvotes ----------

        await Upvote(votes, HubItemReference.ForRequest(flakyTests.Id), new[] { Priya, Marcus, Ana, Tom, Lena, Sam, Rose, Dev }, Now.AddDays(-20));
        await Upvote(votes, HubItemReference.ForRequest(costIdea.Id), new[] { Tom, Marcus, Ana, Lena, Sam }, Now.AddDays(-15));
        await Upvote(votes, HubItemReference.ForRequest(designDrift.Id), new[] { Lena, Rose, Ana, Sam }, Now.AddDays(-40));
        await Upvote(votes, HubItemReference.ForRequest(searchIdea.Id), new[] { Sam, Priya, Marcus, Tom, Rose }, Now.AddDays(-4));
        await Upvote(votes, HubItemReference.ForRequest(accessibilityIdea.Id), new[] { Rose, Lena, Ana }, Now.AddDays(-2));
        await Upvote(votes, HubItemReference.ForRequest(mobileOffline.Id), new[] { Priya, Marcus }, Now.AddDays(-8));
        await Upvote(votes, HubItemReference.ForRequest(releaseNotes.Id), new[] { Marcus }, Now.AddDays(-12));
        await Upvote(votes, HubItemReference.ForRequest(onboardingIdea.Id), new[] { Ana, Priya, Marcus, Tom, Sam, Lena }, Now.AddDays(-100));
        await Upvote(votes, HubItemReference.ForRequest(reviewIdea.Id), new[] { Marcus, Priya, Tom }, Now.AddDays(-80));
        await Upvote(votes, HubItemReference.ForSolution(onboardingKit.Id), new[] { Ana, Priya, Tom, Sam }, Now.AddDays(-50));
        await Upvote(votes, HubItemReference.ForSolution(reviewCopilot.Id), new[] { Marcus, Lena, Tom }, Now.AddDays(-35));

        // ---------- Conversation ----------

        var report = await attachments.Save(
            "flaky-test-report.csv",
            "text/csv",
            System.Text.Encoding.UTF8.GetBytes(
                "suite,test,failures_30d,owner\n"
                + "checkout,applies_promo_code,14,Payments\n"
                + "checkout,handles_expired_card,11,Payments\n"
                + "identity,refreshes_token_near_expiry,9,Identity\n"
                + "search,ranks_recent_documents,7,Data Platform\n"));

        var tokenSpec = await attachments.Save(
            "token-migration-plan.md",
            "text/markdown",
            System.Text.Encoding.UTF8.GetBytes(
                "# Token migration\n\n"
                + "1. Publish tokens as CSS variables (done)\n"
                + "2. Codemod the four apps, one per week\n"
                + "3. Fail the build on a raw hex value\n"));

        await Comment(comments, flakyTests, Priya, CommentAudience.Authenticated,
            "Pulled the numbers before filing this — four suites account for most of it. Report attached.",
            Now.AddDays(-33), new[] { report });
        await Comment(comments, flakyTests, Marcus, CommentAudience.Authenticated,
            "Payments will take the top two. If quarantine is automatic, please make the fix-by date visible on the "
            + "team dashboard or it will quietly become permanent.", Now.AddDays(-31));
        await Comment(comments, flakyTests, Tom, CommentAudience.Authenticated,
            "Review Copilot already parses CI output; extending it to flag quarantine candidates is a small change.",
            Now.AddDays(-29));
        await Comment(comments, flakyTests, Dev, CommentAudience.ApproversOnly,
            "Approved on the condition that quarantine expires after 30 days. Open-ended quarantine is how you end up "
            + "with a suite nobody trusts.", Now.AddDays(-2));

        await Comment(comments, designDrift, Lena, CommentAudience.Authenticated,
            "Migration plan attached. One app per week, then the build fails on raw hex.", Now.AddDays(-62), new[] { tokenSpec });
        await Comment(comments, designDrift, Rose, CommentAudience.Authenticated,
            "Support Tools is the messiest and I would rather go first than last — happy to be the pilot.",
            Now.AddDays(-59));

        await Comment(comments, costIdea, Tom, CommentAudience.Authenticated,
            "Cost Lens covers the dashboard half of this. The weekly digest is the part that changed behaviour.",
            Now.AddDays(-44));
        await Comment(comments, costIdea, Ana, CommentAudience.Authenticated,
            "Can the digest go to the team channel rather than individual email? Ours gets read, inboxes do not.",
            Now.AddDays(-12));

        await Comment(comments, searchIdea, Priya, CommentAudience.Authenticated,
            "Strong yes. I answered the same runbook question three times last month.", Now.AddDays(-4));
        await Comment(comments, accessibilityIdea, Rose, CommentAudience.Authenticated,
            "Axe in CI on the four main flows would have caught 27 of the 30.", Now.AddDays(-2));
        await Comment(comments, rejectedIdea, Dev, CommentAudience.Authenticated,
            "Not going ahead with this — a shared database would couple every team's release schedule together. "
            + "The sync code is the smaller cost.", Now.AddDays(-40));

        await CommentOnSolution(comments, reviewCopilot, Priya, CommentAudience.Authenticated,
            "Two weeks in on Identity: first-review wait is down to about three hours. It is wrong often enough to "
            + "keep a human in the loop, and right often enough that the human's job is easier.", Now.AddDays(-18));
        await CommentOnSolution(comments, reviewCopilot, Lena, CommentAudience.Authenticated,
            "Mobile is mid-rollout. The changelog check is noisy on release branches — opened an issue.",
            Now.AddDays(-3));
        await CommentOnSolution(comments, onboardingKit, Sam, CommentAudience.Authenticated,
            "Growth starts Monday. The dev container built first try on a fresh laptop, which I did not expect.",
            Now.AddDays(-12));
        await CommentOnSolution(comments, costLens, Marcus, CommentAudience.Authenticated,
            "The weekly digest is what did it. A dashboard nobody opens changes nothing.", Now.AddDays(-9));
        await CommentOnSolution(comments, vendorScorecard, Rose, CommentAudience.ApproversOnly,
            "Renewal dates for the two largest vendors are inside 90 days. Keeping this restricted until terms settle.",
            Now.AddDays(-4));

        // ---------- Participation requests awaiting a decision ----------

        await contributions.Save(new Contribution
        {
            Target = HubItemReference.ForRequest(searchIdea.Id),
            RequestedBy = Priya,
            Message = "I built the ADR indexer last year and would like to take the connector work on this.",
            Status = ContributionStatus.Accepted,
            CreatedAt = Now.AddDays(-3),
            UpdatedAt = Now.AddDays(-3)
        });
        await contributions.Save(new Contribution
        {
            Target = HubItemReference.ForSolution(designTokens.Id),
            RequestedBy = Rose,
            Message = "Happy to run the Support Tools migration and write up what breaks so the next team has it easier.",
            Status = ContributionStatus.Accepted,
            CreatedAt = Now.AddDays(-2),
            UpdatedAt = Now.AddDays(-2)
        });
        await contributions.Save(new Contribution
        {
            Target = HubItemReference.ForRequest(accessibilityIdea.Id),
            RequestedBy = Lena,
            Message = "I can wire axe into the pipeline — it is a day of work and I have done it before.",
            Status = ContributionStatus.Accepted,
            CreatedAt = Now.AddDays(-1),
            UpdatedAt = Now.AddDays(-1)
        });
        await contributions.Save(new Contribution
        {
            Target = HubItemReference.ForSolution(reviewCopilot.Id),
            RequestedBy = Tom,
            Message = "Data Platform is exploring it; I would like to help tune the rules for our stack.",
            Status = ContributionStatus.Accepted,
            DecidedBy = Dev,
            Rationale = "Welcome — coordinate with Marcus on rule changes.",
            CreatedAt = Now.AddDays(-9),
            UpdatedAt = Now.AddDays(-7),
            DecidedAt = Now.AddDays(-7)
        });

        // ---------- Approval decisions ----------

        await decisions.Save(new AcceptanceDecision
        {
            RequestId = flakyTests.Id,
            ApproverId = Dev,
            Decision = AcceptanceDecisionType.Accept,
            Rationale = "Clear problem, measured, and an owner willing to take the top offenders. Approved with a "
                + "30-day quarantine expiry.",
            DecidedAt = Now.AddDays(-2)
        });
        await decisions.Save(new AcceptanceDecision
        {
            RequestId = rejectedIdea.Id,
            ApproverId = Dev,
            Decision = AcceptanceDecisionType.Reject,
            Rationale = "Couples every team's release schedule together to avoid writing sync code. Wrong trade.",
            DecidedAt = Now.AddDays(-40)
        });
        await decisions.Save(new AcceptanceDecision
        {
            RequestId = costIdea.Id,
            ApproverId = Dev,
            Decision = AcceptanceDecisionType.Accept,
            Rationale = "Cheap to try, and the weekly digest is the part with evidence behind it.",
            DecidedAt = Now.AddDays(-50)
        });

        // ---------- Activity feed ----------

        await SeedAudit(audit, allRequests, allSolutions);
    }

    private static async Task Link(
        IRequestSolutionRepository relationships,
        Request request,
        Solution solution,
        RequestSolutionRelationship relationship,
        UserId actor,
        DateTimeOffset at,
        ApprovalState approval = ApprovalState.Approved) =>
        await relationships.Save(new RequestSolution
        {
            RequestId = request.Id,
            SolutionId = solution.Id,
            Relationship = relationship,
            Approval = approval,
            AddedBy = actor,
            AddedAt = at,
            DecidedBy = approval == ApprovalState.Approved ? Dev : null,
            DecidedAt = approval == ApprovalState.Approved ? at : null
        });

    private static async Task Use(
        ISolutionUseRepository uses,
        Solution solution,
        UserId actor,
        string project,
        string? team,
        SolutionUseStatus status,
        DateTimeOffset started,
        DateTimeOffset? completed = null) =>
        await uses.Save(new SolutionUse
        {
            SolutionId = solution.Id,
            StartedBy = actor,
            ProjectName = project,
            Team = team,
            Status = status,
            StartedAt = started,
            UpdatedAt = completed ?? started,
            CompletedAt = completed
        });

    private static async Task Upvote(
        IVoteRepository votes,
        HubItemReference target,
        IEnumerable<UserId> voters,
        DateTimeOffset from)
    {
        var offset = 0;
        foreach (var voter in voters)
        {
            await votes.Save(new Vote
            {
                Target = target,
                UserId = voter,
                CreatedAt = from.AddHours(offset * 7)
            });
            offset++;
        }
    }

    private static Task Comment(
        ICommentRepository comments,
        Request request,
        UserId author,
        CommentAudience audience,
        string body,
        DateTimeOffset at,
        IReadOnlyList<CommentAttachment>? attachments = null) =>
        comments.Add(new Comment
        {
            SubjectId = request.Id,
            SubjectType = HubItemType.Request,
            AuthorId = author,
            Audience = audience,
            Body = body,
            Attachments = attachments ?? Array.Empty<CommentAttachment>(),
            CreatedAt = at
        });

    private static Task CommentOnSolution(
        ICommentRepository comments,
        Solution solution,
        UserId author,
        CommentAudience audience,
        string body,
        DateTimeOffset at) =>
        comments.Add(new Comment
        {
            SubjectId = solution.Id,
            SubjectType = HubItemType.Solution,
            AuthorId = author,
            Audience = audience,
            Body = body,
            CreatedAt = at
        });

    /// <summary>
    /// Audit records are what the activity rail and "what's happening" pane read,
    /// so the demo needs a believable history rather than a burst of writes dated now.
    /// </summary>
    private static async Task SeedAudit(
        IAuditRepository audit,
        IReadOnlyList<Request> requests,
        IReadOnlyList<Solution> solutions)
    {
        foreach (var request in requests)
        {
            await audit.Append(Record(
                "request.created", "request", request.Id, request.SubmittedBy.Value,
                "Shared an idea.", request.CreatedAt));
        }

        foreach (var solution in solutions)
        {
            await audit.Append(Record(
                "solution.created", "solution", solution.Id, (solution.Owner ?? solution.SubmittedBy).Value,
                "Shared a solution.", solution.CreatedAt));
        }

        var flaky = requests[0];
        var onboarding = requests[1];
        var cost = requests[2];
        var review = requests[3];
        var design = requests[4];
        var search = requests[5];
        var accessibility = requests[6];

        var copilot = solutions[0];
        var kit = solutions[1];
        var lens = solutions[2];
        var tokens = solutions[3];

        await audit.Append(Record("request.accepted", "decision", flaky.Id, Dev.Value, "Accepted the idea.", Now.AddDays(-2)));
        await audit.Append(Record("request.accepted", "decision", cost.Id, Dev.Value, "Accepted the idea.", Now.AddDays(-50)));
        await audit.Append(Record("request.accepted", "decision", review.Id, Dev.Value, "Accepted the idea.", Now.AddDays(-92)));
        await audit.Append(Record("request.rejected", "decision", requests[9].Id, Dev.Value, "Rejected the idea.", Now.AddDays(-40)));

        await audit.Append(Record("request.solutionLinked", "requestSolution", review.Id, Marcus.Value, "Linked a solution.", Now.AddDays(-88)));
        await audit.Append(Record("request.solutionLinked", "requestSolution", cost.Id, Tom.Value, "Linked a solution.", Now.AddDays(-46)));
        await audit.Append(Record("request.solutionLinked", "requestSolution", design.Id, Lena.Value, "Linked a solution.", Now.AddDays(-64)));
        await audit.Append(Record("request.solutionLinked", "requestSolution", search.Id, Sam.Value, "Linked a solution.", Now.AddDays(-4)));

        await audit.Append(Record("request.canonicalSelected", "request", onboarding.Id, Dev.Value, "Chose the answer.", Now.AddDays(-130)));
        await audit.Append(Record("request.canonicalSelected", "request", review.Id, Dev.Value, "Chose the answer.", Now.AddDays(-86)));

        await audit.Append(Record("solutionUse.started", "solutionUse", copilot.Id, Lena.Value, "Started using a solution.", Now.AddDays(-14)));
        await audit.Append(Record("solutionUse.started", "solutionUse", copilot.Id, Tom.Value, "Started using a solution.", Now.AddDays(-3)));
        await audit.Append(Record("solutionUse.started", "solutionUse", kit.Id, Sam.Value, "Started using a solution.", Now.AddDays(-12)));
        await audit.Append(Record("solutionUse.started", "solutionUse", kit.Id, Rose.Value, "Started using a solution.", Now.AddDays(-5)));
        await audit.Append(Record("solutionUse.started", "solutionUse", tokens.Id, Rose.Value, "Started using a solution.", Now.AddDays(-6)));
        await audit.Append(Record("solutionUse.completed", "solutionUse", lens.Id, Tom.Value, "Finished a rollout.", Now.AddDays(-18)));
        await audit.Append(Record("solutionUse.completed", "solutionUse", copilot.Id, Priya.Value, "Finished a rollout.", Now.AddDays(-20)));

        // Resource types match what the real handlers write, so the demo feed is
        // shaped exactly like a feed produced by ordinary use.
        await audit.Append(Record("vote.added", "vote", flaky.Id, Rose.Value, "Upvoted an idea.", Now.AddDays(-1)));
        await audit.Append(Record("vote.added", "vote", search.Id, Priya.Value, "Upvoted an idea.", Now.AddDays(-4)));
        await audit.Append(Record("vote.added", "vote", accessibility.Id, Lena.Value, "Upvoted an idea.", Now.AddDays(-2)));

        // comment.added rows exist for the hub feed; the item timeline hides them
        // because the comments themselves are already shown there.
        await audit.Append(Record("comment.added", "comment", flaky.Id, Marcus.Value, "Added a comment.", Now.AddDays(-31)));
        await audit.Append(Record("comment.added", "comment", copilot.Id, Priya.Value, "Added a comment.", Now.AddDays(-18)));
        await audit.Append(Record("comment.added", "comment", search.Id, Priya.Value, "Added a comment.", Now.AddDays(-4)));

        await audit.Append(Record("contribution.created", "contribution", search.Id, Priya.Value, "Asked to help.", Now.AddDays(-3)));
        await audit.Append(Record("contribution.created", "contribution", tokens.Id, Rose.Value, "Asked to help.", Now.AddDays(-2)));
        await audit.Append(Record("contribution.created", "contribution", accessibility.Id, Lena.Value, "Asked to help.", Now.AddDays(-1)));
        await audit.Append(Record("contribution.accepted", "contribution", copilot.Id, Dev.Value, "Accepted a participation request.", Now.AddDays(-7)));

        await audit.Append(Record("solution.published", "solution", kit.Id, Ana.Value, "Published a solution.", Now.AddDays(-136)));
        await audit.Append(Record("solution.published", "solution", copilot.Id, Marcus.Value, "Published a solution.", Now.AddDays(-90)));
        await audit.Append(Record("solution.published", "solution", lens.Id, Tom.Value, "Published a solution.", Now.AddDays(-48)));
    }

    private static AuditRecord Record(
        string action,
        string resourceType,
        string subjectId,
        string actorId,
        string summary,
        DateTimeOffset at) => new()
    {
        Action = action,
        ResourceType = resourceType,
        ResourceId = subjectId,
        SubjectId = subjectId,
        ActorType = AuditActorType.User,
        ActorId = actorId,
        Summary = summary,
        OccurredAt = at
    };
}
