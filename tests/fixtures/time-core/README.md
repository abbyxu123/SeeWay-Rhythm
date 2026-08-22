# Time Core Golden Fixtures

These fixtures test deterministic intermediate facts from `@seeway/time-core`.
They never test generated advice or presentation copy.

## Contract

Every case must contain:

- `input`: local civil time, IANA time zone, and declared precision.
- `expected`: only the intermediate facts directly covered by the cited source.
- `sourceId`, `sourceClassification`, and `sourceIndependence`: a registered
  structural source identity and its evidence policy.
- `sourceName` and `sourceLocator`: an independently inspectable source and its exact location.
- `sourceArtifactSha256`: required for locally held user-provided references and
  omitted for web-only evidence.
- `verifier` and `verificationDate`: who checked it and when.
- `status`: `verified`, `boundary_review`, `unverified_rule`, or `blocked`.
- `notes`: the scope and limits of the evidence.

The runtime schema is strict: unknown fields, empty fact groups, duplicate IDs,
invalid statuses, malformed inputs, and missing provenance are rejected.
Local `sourceLocator` values must use a portable repository-relative
`reference materials/...` path followed by the exact PDF page. Absolute paths,
path traversal, backslashes, and `file:` URLs are rejected; web locators must use
HTTPS.

The Zhang course-notes PDF is held separately by the user and is intentionally
excluded from this public repository. Before reviewing its four fixtures, first
verify that the local artifact SHA-256 is
`4ee9788e2fcc577a66c5aef83a50f353b01e2dec50915fa799c8b7473fecbc47`,
then inspect the exact PDF page recorded by each case. The repository does not
distribute the PDF itself.

## Production Gate

Only a complete, strictly valid case with `status: "verified"` is production
eligible. `boundary_review`, `unverified_rule`, and `blocked` cases may remain in
the regression suite, but they cannot enable production behavior.

Registered independent sources are `zhang-course-notes` as a manually checked
`user_provided_reference`, plus `hko-almanac` and `ccdi-shichen-article` as
`official_publication`. Each must declare `sourceIndependence: "independent"`.
The `tyme4ts` source ID is structurally locked to
`provider_candidate/provider_only`; changing its label cannot make it production
eligible. Reserved provider names are also rejected by the production gate.

`tyme4ts` is the pinned candidate provider, not an independent verified source.
Its 2026 Liqiu value (`19:42:43`) is therefore recorded only as
`boundary_review`. The Hong Kong Observatory value (`19:43`) supports the minute,
but does not independently verify the transition second.

Partial `expected` objects are deliberate. A source that proves only a pillar or
a shichen branch must not silently certify lunar, solar-term, or other fields.

## Sources

- Zhang Zhichun course notes, with PDF page locators stored on each case.
- Hong Kong Observatory 2026 almanac and solar-term tables.
- Central Commission for Discipline Inspection and National Commission of
  Supervision article defining the twelve shichen ranges.

## Verification

```bash
npm test -- --run tests/time-golden.test.ts
npm test -- --run packages/time-core/test tests/time-golden.test.ts
npm run typecheck
git diff --check
```
