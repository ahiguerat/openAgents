# MCP Integration (Skeleton)

## Goal
Integrate MCP as an adapter layer inside `platform/tool-gateway`.

## Included in this commit
- `ToolRegistry` to register and invoke tools through a common interface.
- `IMcpClient` contract for MCP transport implementations.
- `StubMcpClient` as a placeholder implementation.
- `McpToolAdapter` to expose MCP tools as internal `ToolSpec` tools.
- `registerMcpTools(...)` helper to bulk-register tools discovered from MCP.

## Intended usage
1. Instantiate `ToolRegistry`.
2. Provide an MCP client implementation (`StubMcpClient` now, real client later).
3. Run `registerMcpTools(...)` during bootstrap.
4. Invoke MCP-discovered tools using the same gateway API used by local tools.

## Next steps
1. Replace `StubMcpClient` with real transport (stdio/http/ws).
2. Add schema validation for MCP input/output payloads.
3. Add observability hooks (latency, errors, trace_id).
4. Add integration tests for MCP discovery and invocation.
