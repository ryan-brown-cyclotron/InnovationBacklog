# Triage Agents (Reference)

These agents were part of the old GitHub + Foundry direction. They are hardcoded stubs with no real LLM integration.

## CreationTriageAgent

**Intent:** Validate and summarize new requests submitted by users.

- Input: request title + description
- Logic (hardcoded stub): Accept everything as valid
- Output: 
  - Approval comment for reviewers: "Triaged the new request."
  - Context visible to submitter: "Your request is being reviewed."
  - `IsValid` flag

**Future:** When triage is reintroduced (if ever), this would be replaced with logic to detect spam, auto-categorize, extract structured fields, etc.

## AcceptanceTriageAgent

**Intent:** Normalize + assess solution submissions against repository metadata.

- Input: solution title + description + optional repository README
- Logic (hardcoded stub): Scan repo README if provided, fill hardcoded fields (Domain: "Software", Type: "Solution", IntendedUsers: "Developers")
- Output:
  - Normalized title + description
  - Categorical metadata (domain, type, intended users)
  - Lists of capabilities + limitations (hardcoded empty)
  - Related solution IDs (hardcoded empty)
  - Repository assessment summary
  - `IsValid` flag

**Future:** When assessment is reintroduced, this would call out to a real LLM with prompts like "extract the main capabilities of this solution from its README and source code" and "list limitations the README doesn't mention."
