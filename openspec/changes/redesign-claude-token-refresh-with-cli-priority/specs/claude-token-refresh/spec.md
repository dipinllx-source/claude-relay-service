## ADDED Requirements

### Requirement: Refresh Trigger Sources

`refreshTokenViaCredentials(accountId, trigger)` SHALL be the single entry point for refreshing a Claude account's access token. It MUST accept exactly one of three trigger sources:

- `cache_expired` — `getValidAccessToken` detected `now >= expiresAt - 60000`.
- `upstream_error` — `claudeRelayService` received a 401 from the upstream Claude API and decided to retry.
- `manual_refresh` — administrator-invoked refresh.

The trigger MUST be passed through to `tokenRefreshLogger.logRefreshStart` so that downstream log analysis can attribute refresh attempts to their source.

#### Scenario: Cache expiry triggers refresh
- **WHEN** `getValidAccessToken` observes that `expiresAt - 60000 <= now`
- **THEN** it SHALL invoke `refreshTokenViaCredentials(accountId, 'cache_expired')`
- **AND** the refresh log entry SHALL record `trigger: 'cache_expired'`

#### Scenario: Upstream 401 triggers refresh
- **WHEN** `claudeRelayService` receives HTTP 401 from upstream Claude API for an authorized request
- **THEN** it SHALL invoke `refreshTokenViaCredentials(accountId, 'upstream_error')`
- **AND** the refresh log entry SHALL record `trigger: 'upstream_error'`

#### Scenario: Manual admin refresh
- **WHEN** an administrator triggers a refresh via the admin API
- **THEN** the system SHALL invoke `refreshTokenViaCredentials(accountId, 'manual_refresh')`
- **AND** the refresh log entry SHALL record `trigger: 'manual_refresh'`

### Requirement: CLI-Priority Refresh Strategy

The refresh function MUST attempt CLI-based refresh up to 3 times before falling back to direct axios OAuth. The attempt budget MUST count both CLI subprocess errors and CLI no-op outcomes (file unchanged) as a single failed attempt each.

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

#### Scenario: All 3 CLI attempts fail then axios succeeds
- **WHEN** the CLI attempt loop has produced 3 failures (any combination of subprocess errors and no-ops)
- **THEN** the system SHALL invoke the internal axios OAuth helper using the cached `refreshToken`
- **AND** if axios returns 200, the cache SHALL be updated atomically with the OAuth response data
- **AND** the function SHALL return success

#### Scenario: All 3 CLI attempts and axios both fail
- **WHEN** the CLI attempt loop has produced 3 failures
- **AND** the subsequent axios OAuth call also fails
- **THEN** the function SHALL throw an error
- **AND** SHALL NOT update the token fields in the cache

### Requirement: CLI Attempt Backoff and File Read Synchronization

Between CLI attempts, the system SHALL apply exponential backoff: 500ms before the 2nd attempt, 1000ms before the 3rd. After each `execFileAsync` returns (success or error), the system SHALL determine whether the credentials file was actually rewritten by polling its `mtime` (compared against the `mtime` captured immediately before the `execFileAsync` invocation), with a poll timeout of 5000ms. The file MUST be read only after `mtime` advances or the poll timeout is reached. The system MUST NOT use a fixed `sleep` for synchronization.

#### Scenario: File mtime advances within poll window
- **WHEN** the credentials file's `mtime` advances within the 5-second poll window after `execFileAsync` returns
- **THEN** the system SHALL read the file once `mtime` advancement is observed
- **AND** SHALL NOT wait for the remainder of the poll window

#### Scenario: File mtime does not advance within poll window
- **WHEN** 5 seconds elapse after `execFileAsync` returns and the file's `mtime` has not advanced
- **THEN** the system SHALL still attempt to read the file
- **AND** the resulting `accessToken` will be compared against the pre-attempt cached value
- **AND** equality will count as a no-op for the attempt budget

#### Scenario: Backoff between attempts
- **WHEN** an attempt fails (subprocess error or no-op) and the attempt budget is not exhausted
- **THEN** the system SHALL wait `500ms * 2^(attempt - 1)` milliseconds before the next attempt
- **AND** the attempt counter SHALL be incremented

### Requirement: Failure Disposition Matrix

The system SHALL distinguish failure categories and apply differentiated dispositions instead of treating every refresh failure as `status='error'`.

#### Scenario: axios OAuth returns 4xx invalid_grant
- **WHEN** the axios OAuth call returns HTTP 4xx with `error: 'invalid_grant'` (or any 4xx indicating refresh_token rejection)
- **THEN** the system SHALL set the account `status` to `'error'`
- **AND** record `errorMessage` describing the grant rejection
- **AND** send a credential webhook notification
- **AND** NOT update token fields in the cache

#### Scenario: axios OAuth network or timeout failure
- **WHEN** the axios OAuth call rejects with a network error (ECONNRESET, ETIMEDOUT, ECONNABORTED) or a 5xx response
- **THEN** the system SHALL apply a short `temp_unavailable` cooldown via `upstreamErrorHelper`
- **AND** NOT set the account `status` to `'error'`
- **AND** NOT update token fields in the cache

#### Scenario: Credentials file path missing or unreadable
- **WHEN** `getCredentialsPath()` returns a path that does not exist OR `JSON.parse` of the file fails
- **THEN** the system SHALL set the account `status` to `'error'` with a clear `errorMessage` indicating a configuration or file integrity problem
- **AND** SHALL NOT enter the CLI retry loop or the axios fallback
- **AND** SHALL NOT update token fields in the cache

#### Scenario: Account marked disableAutoProtection
- **WHEN** any of the failure categories above apply
- **AND** the account's `disableAutoProtection` flag is `true`
- **THEN** the system SHALL skip writing `status='error'` to the account
- **AND** SHALL still record an entry via `upstreamErrorHelper.recordErrorHistory`

### Requirement: Cache Atomicity

A successful refresh SHALL update the cache (Redis account record) in a single `setClaudeAccount` call covering `accessToken`, `refreshToken` (if returned), `expiresAt`, `lastRefreshAt`, `status='active'`, `errorMessage=''`, and `scopes` (if changed).

A failed refresh MUST NOT mutate any of `accessToken`, `refreshToken`, `expiresAt`, `lastRefreshAt`, or `scopes` in the cache. Failure paths MAY only update `status` and `errorMessage` (per the failure disposition matrix), and only as a single explicit operation distinct from the success-path write.

#### Scenario: Successful CLI refresh updates cache atomically
- **WHEN** a CLI attempt succeeds
- **THEN** the cache SHALL be updated with the new `accessToken`, `refreshToken` (if file contains one), `expiresAt`, and `lastRefreshAt` in one Redis write
- **AND** `status` SHALL be set to `'active'` and `errorMessage` cleared in the same write

#### Scenario: Successful axios refresh updates cache atomically
- **WHEN** the axios OAuth call returns 200
- **THEN** the cache SHALL be updated with the new `access_token`, `refresh_token`, and computed `expiresAt = Date.now() + expires_in * 1000` in one Redis write
- **AND** `status` SHALL be set to `'active'` and `errorMessage` cleared in the same write

#### Scenario: Failed refresh leaves token fields untouched
- **WHEN** any failure category from the disposition matrix occurs
- **THEN** the cache `accessToken`, `refreshToken`, `expiresAt`, `lastRefreshAt`, and `scopes` SHALL remain at their pre-refresh values
- **AND** only `status` and `errorMessage` MAY be modified (and only as permitted by the disposition matrix)

### Requirement: Concurrent Refresh Serialization

Concurrent invocations of `refreshTokenViaCredentials` for the same `accountId` SHALL be serialized via `tokenRefreshService.acquireRefreshLock`. Waiters MUST NOT independently invoke the CLI or axios; they SHALL wait for the lock holder, then read the cache and return the current `accessToken` as a successful refresh result.

#### Scenario: Lock acquired - performs refresh
- **WHEN** the function acquires the refresh lock for `(accountId, 'claude')`
- **THEN** it SHALL execute the CLI retry loop and axios fallback as specified
- **AND** SHALL release the lock in a `finally` block regardless of outcome

#### Scenario: Lock contention - waiter receives cached result
- **WHEN** the function fails to acquire the refresh lock (held by another concurrent invocation)
- **THEN** it SHALL wait for a fixed period (3 seconds) before reading the cache
- **AND** SHALL return the cached `accessToken` and `expiresAt` as a successful refresh result
- **AND** SHALL NOT invoke `execFile claude -p` or axios on its own
- **AND** SHALL log the wait via `logRefreshSkipped` with `reason: 'already_locked'`

#### Scenario: Lock holder failure releases lock
- **WHEN** any failure occurs during a refresh attempt within the lock
- **THEN** the lock SHALL be released in the `finally` block
- **AND** the next caller SHALL be able to acquire the lock and attempt a fresh refresh cycle

### Requirement: No Modification of `.credentials.json`

The refresh implementation MUST NOT write to `.credentials.json` at any point. This includes (but is not limited to): forcing expiry by overwriting `expiresAt`, persisting newly issued tokens from axios fallback back to the file, or any defensive "synchronization" writes.

The implementation MAY perform the following read-only operations on the file: `fs.statSync` (for mtime), `fs.readFileSync` (for parsing), and `fs.existsSync` (for path validation).

#### Scenario: Successful axios refresh does not touch file
- **WHEN** the axios fallback succeeds and returns new `access_token` / `refresh_token` / `expires_in`
- **THEN** the system SHALL persist them to Redis only
- **AND** SHALL NOT write or modify `.credentials.json`

#### Scenario: CLI no-op does not provoke a file rewrite
- **WHEN** all 3 CLI attempts result in no-op (file unchanged)
- **THEN** the system SHALL NOT attempt to write to `.credentials.json` to "force" CLI behavior
- **AND** SHALL transition to the axios fallback as specified

### Requirement: Caller Trust of Refresh Result

Direct callers of `refreshTokenViaCredentials` (e.g., `claudeRelayService` 401 retry paths and `getValidAccessToken`) MUST treat `{ success: true, accessToken }` as authoritative. Callers MUST NOT add a secondary check that compares the returned `accessToken` against any prior value, nor downgrade `success: true` to a failure based on token equality.

#### Scenario: Relay 401 retry uses returned accessToken directly
- **WHEN** `claudeRelayService` invokes `refreshTokenViaCredentials` after receiving a 401
- **AND** the function returns `{ success: true, accessToken }`
- **THEN** relay SHALL retry the upstream request using the returned `accessToken` as-is
- **AND** SHALL NOT compare it against the prior `accessToken` to decide whether to retry

#### Scenario: getValidAccessToken uses returned accessToken directly
- **WHEN** `getValidAccessToken` detects expiry and invokes `refreshTokenViaCredentials`
- **AND** the function returns `{ success: true, accessToken }`
- **THEN** the caller SHALL return that `accessToken` to its own caller
- **AND** SHALL NOT branch on token equality with the prior cached value
