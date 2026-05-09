## ADDED Requirements

### Requirement: Axios Fallback Opt-In Gating

The axios OAuth refresh fallback path MUST be gated by two account-level boolean fields stored in the Claude account hash:

- `axiosRefreshEnabled` — feature toggle. Default `'false'` for both new accounts and existing accounts at migration time.
- `axiosCloudflareConfirmed` — explicit administrator confirmation that the deployment egress is not blocked by Cloudflare WAF. Default `'false'`.

The system MUST treat axios fallback as enabled for an account ONLY when BOTH fields are `'true'`. Either field being `'false'`, missing, or any other value MUST disable the axios path for that account.

When axios is disabled, the system MUST NOT make any direct call to the Anthropic OAuth endpoint as part of the credentials refresh flow, regardless of CLI outcome.

#### Scenario: New account defaults disable axios
- **WHEN** an administrator creates a new Claude account via `createAccount`
- **THEN** the account hash SHALL be initialized with `axiosRefreshEnabled='false'` and `axiosCloudflareConfirmed='false'`
- **AND** the first `refreshTokenViaCredentials` call for that account SHALL NOT enter the axios fallback even if all 3 CLI attempts fail

#### Scenario: Migration sets defaults on existing accounts
- **WHEN** the service starts and observes Claude account records that lack `axiosRefreshEnabled` or `axiosCloudflareConfirmed`
- **THEN** it SHALL write `'false'` to the missing fields in a single `setClaudeAccount` call per affected account
- **AND** SHALL NOT modify any other field on those records
- **AND** SHALL log a one-line summary of how many accounts were migrated

#### Scenario: Both flags true enables axios fallback
- **WHEN** an account has `axiosRefreshEnabled='true'` AND `axiosCloudflareConfirmed='true'`
- **AND** all 3 CLI attempts fail (any combination of subprocess errors and no-ops)
- **THEN** the system SHALL invoke the internal axios OAuth helper
- **AND** dispose the result per the failure matrix

#### Scenario: One flag false blocks axios fallback
- **WHEN** an account has `axiosRefreshEnabled='true'` but `axiosCloudflareConfirmed='false'`
- **OR** has `axiosRefreshEnabled='false'` regardless of confirmation
- **AND** all 3 CLI attempts fail
- **THEN** the system SHALL NOT invoke the axios OAuth helper
- **AND** SHALL apply the CLI-exhausted disposition (per Failure Disposition Matrix)

### Requirement: Cloudflare Block Detection and Auto-Disable

The internal axios refresh helper MUST detect Cloudflare WAF blocking and treat it as a distinct failure category `cloudflare_blocked`. Detection MUST trigger only on non-2xx axios responses (or thrown axios errors with a `response`), based on ANY of the following signals from the same response:

- HTTP status equals 403, AND
- Response headers include any of `cf-mitigated`, `cf-ray`, or `server: cloudflare`, OR
- Response body is a string and matches `/Cloudflare|Ray ID|Attention Required|cf-error/i`

When `cloudflare_blocked` is identified, the system SHALL:

- Apply a `temp_unavailable` cooldown via `upstreamErrorHelper.markTempUnavailable` (same as `oauth_network`)
- NOT set the account `status` to `'error'`
- NOT update token fields in the cache
- NOT send a credential failure webhook
- Atomically write to the account hash: `axiosRefreshEnabled='false'`, `axiosCloudflareConfirmed='false'`, `axiosLastBlockedAt=<ISO 8601 now>`, `axiosBlockedReason=<short summary including cf-ray if available>`
- Log the event with `category: 'cloudflare_blocked'` and the captured cf-ray (if any)
- Send a webhook of type `CLAUDE_REFRESH_CLOUDFLARE_BLOCKED` (distinct from invalid_grant or credential errors)

#### Scenario: Cloudflare 403 with cf-ray header
- **WHEN** axios OAuth call returns 403 with header `cf-ray: 8a1b2c3d4e5f6789-LAX`
- **THEN** the system SHALL classify the failure as `cloudflare_blocked`
- **AND** SHALL set `axiosLastBlockedAt` and `axiosBlockedReason` on the account
- **AND** SHALL set `axiosRefreshEnabled='false'` and `axiosCloudflareConfirmed='false'`
- **AND** SHALL apply a temp_unavailable cooldown
- **AND** SHALL NOT set the account `status` to `'error'`
- **AND** SHALL NOT send a credential webhook

#### Scenario: Cloudflare body without explicit headers
- **WHEN** axios OAuth call returns 403 with body containing the string `"Attention Required! | Cloudflare"`
- **AND** no `cf-ray` or `cf-mitigated` header is present
- **THEN** the system SHALL still classify the failure as `cloudflare_blocked`
- **AND** apply the same disposition as the previous scenario

#### Scenario: Genuine invalid_grant 4xx is not misclassified
- **WHEN** axios OAuth call returns 401 with body `{"error": "invalid_grant"}` and no Cloudflare headers
- **THEN** the system SHALL classify the failure as `invalid_grant`
- **AND** SHALL NOT touch the axios opt-in fields

#### Scenario: 200 response is never classified as Cloudflare-blocked
- **WHEN** axios OAuth call returns 200 with valid token data
- **AND** the response transits through Cloudflare and includes a `cf-ray` header
- **THEN** the system SHALL treat the result as success
- **AND** SHALL NOT classify it as `cloudflare_blocked`
- **AND** SHALL NOT mutate the axios opt-in fields

### Requirement: CLI-Exhausted Disposition without Axios

When axios is disabled (per Axios Fallback Opt-In Gating) and all 3 CLI attempts fail, the failure category and disposition MUST be derived from the CLI attempt outcomes themselves (not from axios). The system MUST distinguish two CLI-exhausted sub-categories:

- `cli_no_op` — All 3 attempts produced `execFileAsync` success but file `accessToken` unchanged. This indicates the local CLI is permanently incapable of refreshing (typically because the file's `refresh_token` is no longer accepted by the OAuth server). Disposition: `status='error'`, `errorMessage='CLI cannot refresh token (file refresh_token rejected)'`, send webhook `CLAUDE_REFRESH_CLI_NO_OP`.
- `cli_subprocess` — At least one of the 3 attempts produced a subprocess error (binary not found, timeout, permission denied, non-zero exit). This indicates a possibly transient machine-side problem. Disposition: `temp_unavailable` cooldown via `upstreamErrorHelper.markTempUnavailable`, no `status='error'`, no credential webhook.

A mixed run where attempts include BOTH no-ops AND subprocess errors MUST be classified as `cli_subprocess` (the more conservative disposition), because at least one subprocess error means the machine state is uncertain.

The `disableAutoProtection=true` rule from the existing matrix continues to apply: if true, no `status='error'` write; only `recordErrorHistory`.

#### Scenario: Three no-ops with axios disabled
- **WHEN** all 3 CLI attempts succeed at subprocess level but file `accessToken` is unchanged
- **AND** the account has `axiosRefreshEnabled='false'` or `axiosCloudflareConfirmed='false'`
- **THEN** the system SHALL classify as `cli_no_op`
- **AND** SHALL set the account `status` to `'error'`
- **AND** SHALL set `errorMessage` indicating CLI is permanently failing
- **AND** SHALL send webhook `CLAUDE_REFRESH_CLI_NO_OP`
- **AND** SHALL NOT update token fields in the cache

#### Scenario: Subprocess errors with axios disabled
- **WHEN** at least one CLI attempt rejects (binary missing, timeout, etc.)
- **AND** all 3 attempts are exhausted without success
- **AND** the account has axios disabled
- **THEN** the system SHALL classify as `cli_subprocess`
- **AND** SHALL apply a temp_unavailable cooldown
- **AND** SHALL NOT set the account `status` to `'error'`
- **AND** SHALL NOT send a credential webhook

#### Scenario: Mixed no-ops and subprocess errors classify as subprocess
- **WHEN** 2 CLI attempts produce no-op and 1 produces a subprocess timeout
- **AND** axios is disabled
- **THEN** the system SHALL classify as `cli_subprocess` (not `cli_no_op`)
- **AND** apply temp_unavailable cooldown disposition

#### Scenario: disableAutoProtection skips error status write
- **WHEN** any CLI-exhausted disposition above would set `status='error'`
- **AND** the account has `disableAutoProtection='true'`
- **THEN** the system SHALL NOT write `status='error'`
- **AND** SHALL still record an entry via `upstreamErrorHelper.recordErrorHistory`

### Requirement: Admin UI Confirmation Workflow

The Claude account edit page MUST include a "Token 刷新策略" (or equivalent) section with the following constraints:

- Local CLI refresh path is shown as always-enabled and not user-toggleable
- Direct OAuth (axios) fallback is shown as a collapsible advanced section
- Inside the advanced section, a Cloudflare risk warning is rendered before any control
- A confirmation checkbox `axiosCloudflareConfirmed` MUST be checked before the `axiosRefreshEnabled` toggle becomes interactive
- If the administrator unchecks the confirmation checkbox, the system MUST force `axiosRefreshEnabled` back to `'false'` (both in the UI state and on save)
- The UI MUST display `axiosLastBlockedAt` and `axiosBlockedReason` if either is non-empty, with a visible warning banner indicating that the axios path was auto-disabled due to Cloudflare blocking

The backend admin API MUST validate the same invariant on save: rejecting any payload that sets `axiosRefreshEnabled='true'` while `axiosCloudflareConfirmed='false'`.

#### Scenario: Toggle disabled until confirmation checked
- **WHEN** an administrator opens the Claude account edit page
- **AND** the account has `axiosCloudflareConfirmed='false'`
- **THEN** the `axiosRefreshEnabled` toggle SHALL be visually disabled (greyed out, non-interactive)
- **AND** the Cloudflare risk warning SHALL be visible

#### Scenario: Backend rejects invalid combination
- **WHEN** the admin API receives a payload with `axiosRefreshEnabled='true'` and `axiosCloudflareConfirmed='false'`
- **THEN** the API SHALL reject the request with a 400-class error
- **AND** SHALL NOT mutate the account hash

#### Scenario: Unchecking confirmation forces toggle off
- **WHEN** the administrator unchecks the confirmation checkbox in the UI
- **AND** previously had `axiosRefreshEnabled='true'`
- **THEN** the UI SHALL immediately reset the toggle to off
- **AND** the saved state SHALL have both fields `'false'`

#### Scenario: Auto-disabled state surfaces blocked reason
- **WHEN** an administrator opens the edit page for an account whose `axiosLastBlockedAt` is set
- **THEN** the UI SHALL render a warning banner showing the blocked timestamp and reason
- **AND** the confirmation checkbox SHALL be unchecked
- **AND** the toggle SHALL be off

## MODIFIED Requirements

### Requirement: CLI-Priority Refresh Strategy

The refresh function MUST attempt CLI-based refresh up to 3 times. After 3 failures the function MUST consult the account's axios opt-in flags (`axiosRefreshEnabled` AND `axiosCloudflareConfirmed`):

- If BOTH are `'true'`, the function SHALL fall back to direct axios OAuth.
- Otherwise, the function SHALL skip axios entirely and apply the CLI-exhausted disposition.

The attempt budget MUST count both CLI subprocess errors and CLI no-op outcomes (file unchanged) as one failed attempt each.

The function MUST NOT modify `.credentials.json` under any circumstance. It MAY only read the file and `stat` it.

#### Scenario: First CLI attempt succeeds
- **WHEN** `execFileAsync('claude', ['-p', 'hello world'])` completes without error
- **AND** the credentials file's `accessToken` differs from the cached `accessToken` captured before the attempt
- **THEN** the system SHALL update the cache atomically with the new token state and return success
- **AND** SHALL NOT make any further CLI or axios attempts

#### Scenario: CLI exits zero but file unchanged
- **WHEN** `execFileAsync` returns successfully
- **AND** the credentials file's `accessToken` equals the cached `accessToken` captured before the attempt
- **THEN** the system SHALL log this as a no-op attempt
- **AND** SHALL NOT update the cache
- **AND** SHALL count this toward the 3-attempt budget

#### Scenario: CLI subprocess raises an error
- **WHEN** `execFileAsync` rejects (timeout, ENOENT for `claude` binary, permission denied, non-zero exit)
- **THEN** the error MUST be logged with full context (not silently swallowed)
- **AND** SHALL be counted as a failed attempt toward the 3-attempt budget
- **AND** SHALL NOT update the cache

#### Scenario: All 3 CLI attempts fail with axios opt-in enabled
- **WHEN** the CLI attempt loop has produced 3 failures (any combination of subprocess errors and no-ops)
- **AND** the account has `axiosRefreshEnabled='true'` AND `axiosCloudflareConfirmed='true'`
- **THEN** the system SHALL invoke the internal axios OAuth helper using the cached `refreshToken`
- **AND** if axios returns 200, the cache SHALL be updated atomically with the OAuth response data
- **AND** the function SHALL return success

#### Scenario: All 3 CLI attempts fail with axios opt-in disabled
- **WHEN** the CLI attempt loop has produced 3 failures
- **AND** the account has axios opt-in disabled (per gating requirement)
- **THEN** the system SHALL NOT invoke the axios OAuth helper
- **AND** SHALL apply the CLI-exhausted disposition (per `CLI-Exhausted Disposition without Axios`)
- **AND** SHALL throw an error
- **AND** SHALL NOT update token fields in the cache

#### Scenario: All 3 CLI attempts and axios both fail
- **WHEN** the CLI attempt loop has produced 3 failures
- **AND** axios is enabled and the subsequent axios OAuth call also fails
- **THEN** the function SHALL throw an error
- **AND** SHALL apply the relevant disposition based on the axios failure category (invalid_grant / oauth_network / cloudflare_blocked)
- **AND** SHALL NOT update the token fields in the cache

### Requirement: Failure Disposition Matrix

The system SHALL distinguish failure categories and apply differentiated dispositions instead of treating every refresh failure as `status='error'`.

The failure category set SHALL be: `invalid_grant`, `oauth_network`, `cloudflare_blocked`, `cli_subprocess`, `cli_no_op`, `file_path_error`.

#### Scenario: axios OAuth returns 4xx invalid_grant
- **WHEN** the axios OAuth call returns HTTP 4xx with `error: 'invalid_grant'` (or any 4xx indicating refresh_token rejection) AND the response is NOT classified as Cloudflare-blocked per the detection requirement
- **THEN** the system SHALL set the account `status` to `'error'`
- **AND** record `errorMessage` describing the grant rejection
- **AND** send a credential webhook notification
- **AND** NOT update token fields in the cache

#### Scenario: axios OAuth network or timeout failure
- **WHEN** the axios OAuth call rejects with a network error (ECONNRESET, ETIMEDOUT, ECONNABORTED) or a 5xx response
- **THEN** the system SHALL apply a short `temp_unavailable` cooldown via `upstreamErrorHelper`
- **AND** NOT set the account `status` to `'error'`
- **AND** NOT update token fields in the cache

#### Scenario: axios OAuth blocked by Cloudflare
- **WHEN** the axios OAuth call response is classified as `cloudflare_blocked` per the Cloudflare Block Detection requirement
- **THEN** the system SHALL apply a short `temp_unavailable` cooldown
- **AND** SHALL NOT set the account `status` to `'error'`
- **AND** SHALL NOT send a credential failure webhook
- **AND** SHALL atomically write `axiosRefreshEnabled='false'`, `axiosCloudflareConfirmed='false'`, `axiosLastBlockedAt`, `axiosBlockedReason` to the account
- **AND** SHALL send a `CLAUDE_REFRESH_CLOUDFLARE_BLOCKED` webhook

#### Scenario: CLI exhausted with no subprocess errors (axios disabled)
- **WHEN** all 3 CLI attempts produced no-op and the account has axios disabled
- **THEN** the failure category SHALL be `cli_no_op`
- **AND** the disposition SHALL be `status='error'` with a CLI-failure errorMessage
- **AND** a `CLAUDE_REFRESH_CLI_NO_OP` webhook SHALL be sent

#### Scenario: CLI exhausted with at least one subprocess error (axios disabled)
- **WHEN** at least one CLI attempt produced a subprocess error and the account has axios disabled
- **THEN** the failure category SHALL be `cli_subprocess`
- **AND** the disposition SHALL be a `temp_unavailable` cooldown
- **AND** SHALL NOT set the account `status` to `'error'`
- **AND** SHALL NOT send a credential webhook

#### Scenario: Credentials file path missing or unreadable
- **WHEN** `getCredentialsPath()` returns a path that does not exist OR `JSON.parse` of the file fails
- **THEN** the system SHALL set the account `status` to `'error'` with a clear `errorMessage` indicating a configuration or file integrity problem
- **AND** SHALL NOT enter the CLI retry loop or the axios fallback
- **AND** SHALL NOT update token fields in the cache

#### Scenario: Account marked disableAutoProtection
- **WHEN** any of the failure categories above would write `status='error'`
- **AND** the account's `disableAutoProtection` flag is `true`
- **THEN** the system SHALL skip writing `status='error'` to the account
- **AND** SHALL still record an entry via `upstreamErrorHelper.recordErrorHistory`
- **AND** the auto-disable of axios opt-in fields on `cloudflare_blocked` SHALL still apply (it is not a status change)
