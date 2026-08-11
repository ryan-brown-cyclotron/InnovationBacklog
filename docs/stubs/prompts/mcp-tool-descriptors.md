# MCP Tool Descriptors (Reference)

This catalog was exposed by the old in-process MCP server. It serves as a reference for the tool surface that future `Momentum.Mcp` implementations will need to support.

## Tools

### search_solutions
Search for solutions in the catalog.
- **query** (string, required): Search query
- **skip** (integer): Number of results to skip
- **take** (integer): Number of results to return
- **Required role:** Submitter

### search_requests
Search for requests in the backlog.
- **query** (string, required): Search query
- **skip** (integer): Number of results to skip
- **take** (integer): Number of results to return
- **Required role:** Submitter

### get_request
Retrieve a single request by ID.
- **id** (string, required): Request ID
- **Required role:** Submitter

### create_request
Create a new request.
- **title** (string, required): Request title
- **description** (string, required): Request description
- **type** (string, required): Request type: "Backlog" or "Solution"
- **Required role:** Submitter

### add_comment
Add a comment to a request or solution.
- **subjectId** (string, required): Subject (request or solution) ID
- **body** (string, required): Comment body
- **audience** (string, required): "Authenticated", "SubmitterAndApprovers", or "ApproversOnly"
- **subjectType** (string, required): "Request" or "Solution"
- **Required role:** Submitter

### accept_request
Approve a request awaiting approval.
- **requestId** (string, required): Request ID
- **rationale** (string, required): Approval rationale
- **Required role:** Approver

### reject_request
Reject a request awaiting approval.
- **requestId** (string, required): Request ID
- **rationale** (string, required): Rejection rationale
- **Required role:** Approver

### add_vote
Vote for a request or solution.
- **subjectType** (string, required): "Request" or "Solution"
- **subjectId** (string, required): Subject ID
- **Required role:** Submitter
