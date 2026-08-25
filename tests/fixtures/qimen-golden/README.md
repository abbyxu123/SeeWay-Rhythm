# Qimen golden fixtures

These fixtures gate development of `qimen-core`. They are not empirical proof of divination; they are reproducible reference charts for the selected Zhang Zhichun rotating, split-supplement time-Qimen convention.

## Acceptance rules

A verified fixture must:

- identify the local civil time, IANA timezone and input precision;
- independently match the source year, month, day and hour pillars;
- identify the solar term, dun type, yuan and ju number;
- contain all nine palaces, including earth plate, heaven plate, star, gate and deity facts;
- record void palaces, horse palace, chief star and chief gate;
- include a source path, page/example locator and SHA-256 fingerprint;
- be transcribed twice and pass the strict `QimenChartSchema` invariants.

The initial readiness set must contain at least three distinct source locations and three distinct palace arrangements, span both Yin and Yang Dun, and cover at least three Dun/Ju combinations. This prevents duplicated charts with edited labels from satisfying the development gate.

`verified` means the digital fixture agrees with the located source and selected convention. It does not mean the later interpretation rules have been verified.

## Files

- `verified-cases.json`: three palace-complete cases that open only the calculator-development gate.
- `rejected-cases.json`: source examples that must not become goldens until a recorded discrepancy is resolved.
- `cases.schema.json`: generated from the canonical `QimenGoldenFixtureSchema`; never edit it by hand. Custom cross-field invariants remain enforced by the same Zod schema at runtime even when JSON Schema cannot express them.

Run `npm run generate:qimen-golden-schema` after changing the canonical schema. Run `npm run audit:qimen-golden -- /absolute/path/to/SeeWay-Rhythm` on a machine that holds the private PDFs; this is the complete gate and requires rebuilt time facts, real source SHA-256 fingerprints and structural readiness together. Missing source files are an audit failure, not a skipped success. `audit:qimen-sources` remains available when only the file fingerprints need diagnosis.

Passing this gate does not make any Qimen Agent available. The deterministic calculator, independent verifier and analysis rules must pass their own gates first.
