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

The campaign intentionally validates only an interior column without
openings, beams, capitals or punching reinforcement. It is not evidence for
the excluded configurations.
