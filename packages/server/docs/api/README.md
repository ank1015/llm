# HTTP API Reference

Base behavior:

- health endpoint: `/health`
- application endpoints: `/api/**`
- JSON is used for normal request/response bodies
- SSE is used for live session streaming
- Public request/query/response contracts are defined in `@ank1015/llm-app-contracts`

DTO naming used in these docs:

- `ProjectDto`
- `ArtifactDirDto`
- `ArtifactDirOverviewDto`
- `SessionMetadataDto`
- `SessionSummaryDto`
- `BundledSkillDto`
- `InstalledSkillDto`
- `LiveRunSummaryDto`
- `TerminalSummaryDto`
- `TerminalMetadataDto`

## Sections

- [projects.md](./projects.md)
- [artifact-dirs.md](./artifact-dirs.md)
- [sessions.md](./sessions.md)
- [skills.md](./skills.md)
- [streaming.md](./streaming.md)
- [terminals.md](./terminals.md)
