# Reinforced-concrete punching validation sources

The first-generation benchmark is the interior-column example 3.4.10 on
pages 82-83 of *Worked Examples to Eurocode 2* by the European Concrete
Platform. It independently reports the support perimeter check, the basic
control perimeter at `2d`, the concrete resistance and the conclusion that
punching reinforcement is required.

Source:

- https://www.concretecentre.com/TCC/media/TCCMediaLibrary/Events/Online%20course/CCIP_Worked_Examples_EC2.pdf

The second-generation benchmark is the numerical example in Muttoni, Simões,
Faria and Fernández Ruiz, *A Mechanical Approach for the Punching Shear
Provisions in the Second Generation of Eurocode 2*, Hormigón y Acero 74
(2023). It reports `b0`, `b0.5`, `d_dg`, `k_pb`, acting stress and resistance.
The paper explains the derivation of the closed-form provisions that became
EN 1992-1-1:2023 clause 8.4.

Source:

- https://doi.org/10.33586/hya.2022.3091

External-column geometry is covered by separate analytic regressions. For the
first generation they reproduce the open edge and corner perimeters in EN
1992-1-1:2004+A1:2014 Figures 6.15 and 6.16 and the support-face limit in
6.4.5(3). For the second generation they reproduce the control-perimeter
construction in EN 1992-1-1:2023 Figures 8.18 and 8.19, including the
straight-segment limits and the rounded offset at `dv/2`.

The following open research papers provide independent descriptions and
figures for the external-column geometry and eccentricity treatment used by
the second generation:

- Abu-Salma, Vollum and Macorini, *Design of biaxially loaded external
  slab-column connections*, Engineering Structures 249 (2021), DOI
  https://doi.org/10.1016/j.engstruct.2021.113326
- Abu-Salma, Vollum and Macorini, *Derivation of shear enhancement factor β
  used in FprEN1992 to calculate design shear force at corner columns of flat
  slabs*, Structures 51 (2023), DOI
  https://doi.org/10.1016/j.istruc.2023.03.049

The campaign therefore validates the resistance equations with two published
interior-column worked examples and the generated lengths with independent
edge and corner calculations.

Additional numerical regressions in `tests/punchingVerification.test.js`
independently evaluate the closed-form expressions for:

- `beta` for a biaxially eccentric rectangular interior column, EN
  1992-1-1:2004+A1:2014 equation (6.43);
- `betaE` for an interior column, EN 1992-1-1:2023 equation (8.93) and Table
  8.3;
- vertical punching reinforcement in the 2004 method, including equations
  (6.52) and (6.54) and the detailing limits of 9.4.3;
- studs in the 2023 method, including resistance within the reinforced zone,
  maximum resistance and failure outside the reinforced zone according to
  8.4.4 and detailing checks according to 12.5.1.

The 2023 reinforcement expressions are cross-checked against equations
(17)-(20) and the failure-mode discussion in Muttoni et al. (2023). Openings,
beams, capitals, inclined reinforcement and direct integration of mesh
stresses remain outside the implemented scope.
