# Unit Normalization

This document tracks the public model constructors that accept user units and normalize values to internal units.

Audit date: 2026-04-25.

## Rules

- Constructors that accept numeric engineering input must require explicit `{ force, length }` units.
- Converted values stored on model instances are in the model internal unit system.
- `metadata.sourceUnitSystem` preserves the units declared by the caller.
- When a payload keeps custom keys, the implementation should spread the original payload first and then assign converted known fields.
- Unit-sensitive spread patterns should be reviewed whenever new fields are added to public DTOs.

## Public Models

| Model | Internal units | Converted fields |
| --- | --- | --- |
| `MasonryWallOpeningsModel` | `N`, `m` | wall/opening geometry, wall line loads, ring-frame profile width, lintel bearing length, residual pier warning threshold |
| `MasonryPierModel` | `N`, `mm` | geometry, actions, material stress/unit weight, design eccentricity, equivalent-frame rigidity overrides |
| `ReinforcedConcreteSectionModel` | `N`, `mm` | actions, axial-force arrays, reference point coordinates |
| `SteelRingFramePushoverModel` | `N`, `mm` | frame geometry, horizontal reference force, control displacement settings |
| `TimberConcreteCompositeBeamModel` | `N`, `mm` | span, gaps, reinforcement spacing, connector spacing, line loads |
| `TimberXlamCompositeBeamModel` | `N`, `mm` | span and line loads |
| `XlamOutOfPlanePanelModel` | `N`, `mm` | span and line loads |

## Audit Notes

- The known spread-after-normalization issue in `MasonryWallOpeningsModel.settings.residualPierWarningThreshold` is fixed and covered by regression tests.
- The known missing `length^6` conversion for `SteelProfileSection.warpingConstant` overrides is fixed and covered by regression tests.
- Current public model payloads that preserve custom `loads` fields use `convertUnitProperties()`, which keeps custom keys while converting known unit-bearing keys.

## Regression Coverage

The unit conversion regression suite covers:

- `mm` inputs for masonry wall opening thresholds.
- `cm` + `kN` inputs for RC section and masonry pier models.
- `N/cm` and `kN/m` line-load inputs for beam-like model DTOs.
- `N/m` and `kN/m` end-to-end workflows for RC and timber-concrete composite calculations.
