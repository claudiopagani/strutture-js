import { CalculationResult } from "../../core/results/CalculationResult.js";
import { StructuralApplication } from "../../core/applications/StructuralApplication.js";
import { AlignmentEquivalentFramePushoverAnalysis } from "./analysis/AlignmentEquivalentFramePushoverAnalysis.js";
import { AlignmentSeismicAggregatedAnalysis } from "./analysis/AlignmentSeismicAggregatedAnalysis.js";
import { AlignmentStateComparisonAnalysis } from "./analysis/AlignmentStateComparisonAnalysis.js";
import { AlignmentStaticAnalysis } from "./analysis/AlignmentStaticAnalysis.js";
import { MasonryEquivalentFrameBuilder } from "./analysis/MasonryEquivalentFrameBuilder.js";
import { extractEquivalentFrameMembers } from "./geometry/extractEquivalentFrameMembers.js";
import { AlignmentStateComparisonReportBuilder } from "./reports/AlignmentStateComparisonReportBuilder.js";
import { sanitizeAlignmentOpenings } from "./geometry/sanitizeAlignmentOpenings.js";
import { MasonryWallOpeningsModel } from "./models/MasonryWallOpeningsModel.js";

function resolveMode(input = {}) {
  return String(input.mode ?? input.analysisType ?? "sanitize-only")
    .trim()
    .toLowerCase();
}

export class MasonryWallOpeningsApplication extends StructuralApplication {
  constructor({
    comparisonReportBuilder = new AlignmentStateComparisonReportBuilder(),
  } = {}) {
    super({
      id: "masonry-wall-openings",
      name: "Masonry Wall Openings",
      description:
        "First-principles engine scaffold for masonry wall alignments with openings, including geometry sanitization and future static/seismic orchestration.",
      domain: "masonry",
      supportedCodes: ["NTC2018", "Circolare 2019"],
      tags: [
        "masonry",
        "openings",
        "equivalent-frame",
        "geometry-preprocessing",
        "existing-buildings",
      ],
      metadata: {
        maturity: "partial",
        plannedCapabilities: [
          "pier and spandrel extraction",
          "static tributary-load analysis",
          "aggregated seismic capacity curves",
          "equivalent-frame non-linear global pushover",
          "ante/post comparison reporting",
          "equivalent-frame FEM assembly",
        ],
      },
    });

    this.comparisonReportBuilder = comparisonReportBuilder;
  }

  run(input = {}) {
    const model =
      input.model instanceof MasonryWallOpeningsModel
        ? input.model
        : new MasonryWallOpeningsModel(input.model ?? input);
    const mode = resolveMode(input);
    const sanitization = sanitizeAlignmentOpenings({ alignment: model });
    const extraction =
      mode === "extract-equivalent-frame-members" || mode === "extract-members"
        ? extractEquivalentFrameMembers({
            alignment: model,
            sanitizedOpenings: sanitization.openings,
          })
        : null;

    if (mode === "sanitize-only") {
      return new CalculationResult({
        applicationId: this.id,
        status: "ok",
        summary:
          "Alignment openings were sanitized, clipped to the wall envelope and merged into deterministic equivalent openings.",
        outputs: {
          modelId: model.id,
          sanitizedOpenings: sanitization.openings,
          discardedOpeningIds: sanitization.discardedOpeningIds,
        },
        warnings: sanitization.warnings,
        assumptions: [
          "The first release treats geometry sanitization as the mandatory preprocessing stage for all downstream analyses.",
          "When the alignment top boundary steps between adjacent walls, clipping is performed wall-by-wall to avoid creating openings outside the actual wall envelope.",
        ],
        metadata: {
          domain: this.domain,
          mode,
          ...sanitization.metadata,
        },
      });
    }

    if (mode === "extract-equivalent-frame-members" || mode === "extract-members") {
      return new CalculationResult({
        applicationId: this.id,
        status: "ok",
        summary:
          "Sanitized openings were transformed into first-release equivalent-frame macroelements, returning wall-bounded piers and opening-driven spandrels.",
        outputs: {
          modelId: model.id,
          sanitizedOpenings: sanitization.openings,
          piers: extraction.piers.map((pier) => pier.toJSON()),
          spandrels: extraction.spandrels.map((spandrel) => spandrel.toJSON()),
          discardedOpeningIds: sanitization.discardedOpeningIds,
        },
        warnings: [...sanitization.warnings, ...extraction.warnings],
        assumptions: extraction.assumptions,
        metadata: {
          domain: this.domain,
          mode,
          ...sanitization.metadata,
          ...extraction.metadata,
        },
      });
    }

    if (
      mode === "static-design" ||
      mode === "static-state-of-fact" ||
      mode === "static"
    ) {
      const staticResult = new AlignmentStaticAnalysis().analyze({
        alignment: model,
        stage:
          mode === "static-state-of-fact" ? "state-of-fact" : "design",
        options: input.options ?? input.staticOptions ?? {},
        sanitizedOpenings: sanitization.openings,
        extractedMembers:
          extraction ??
          extractEquivalentFrameMembers({
            alignment: model,
            sanitizedOpenings: sanitization.openings,
          }),
      });

      return staticResult;
    }

    if (
      mode === "seismic-aggregated-design" ||
      mode === "seismic-aggregated-state-of-fact" ||
      mode === "seismic-aggregated"
    ) {
      return new AlignmentSeismicAggregatedAnalysis().analyze({
        alignment: model,
        stage:
          mode === "seismic-aggregated-state-of-fact"
            ? "state-of-fact"
            : "design",
        options: input.options ?? input.seismicOptions ?? {},
        sanitizedOpenings: sanitization.openings,
        extractedMembers:
          extraction ??
          extractEquivalentFrameMembers({
            alignment: model,
            sanitizedOpenings: sanitization.openings,
          }),
      });
    }

    if (mode === "equivalent-frame-pushover") {
      const pushoverResult = new AlignmentEquivalentFramePushoverAnalysis().analyze({
        alignment: model,
        stage: input.stage ?? "design",
        options: input.options ?? input.frameOptions ?? input.seismicOptions ?? {},
        sanitizedOpenings: sanitization.openings,
        extractedMembers:
          extraction ??
          extractEquivalentFrameMembers({
            alignment: model,
            sanitizedOpenings: sanitization.openings,
          }),
      });

      return new CalculationResult({
        applicationId: pushoverResult.applicationId,
        status: pushoverResult.status,
        summary: pushoverResult.summary,
        outputs: {
          ...pushoverResult.outputs,
        },
        warnings: [...pushoverResult.warnings],
        assumptions: [...pushoverResult.assumptions],
        metadata: {
          ...pushoverResult.metadata,
          domain: this.domain,
          mode,
        },
      });
    }

    if (mode === "compare-state-of-fact-vs-design" || mode === "compare") {
      const comparisonResult = new AlignmentStateComparisonAnalysis().analyze({
        alignment: model,
        options:
          input.options ?? input.compareOptions ?? input.seismicOptions ?? {},
        sanitizedOpenings: sanitization.openings,
      });
      const report = this.comparisonReportBuilder.build({
        model,
        comparisonResult,
        metadata: input.metadata ?? {},
      });

      return new CalculationResult({
        applicationId: comparisonResult.applicationId,
        status: comparisonResult.status,
        summary: comparisonResult.summary,
        outputs: {
          ...comparisonResult.outputs,
          report,
        },
        warnings: [...comparisonResult.warnings],
        assumptions: [...comparisonResult.assumptions],
        metadata: {
          ...comparisonResult.metadata,
          reportFormats: ["json", "markdown"],
        },
      });
    }

    if (mode === "equivalent-frame-linear" || mode === "equivalent-frame") {
      const frame = new MasonryEquivalentFrameBuilder().build({
        alignment: model,
        stage: input.stage ?? "design",
        options: input.options ?? input.frameOptions ?? {},
        sanitizedOpenings: sanitization.openings,
      });

      return new CalculationResult({
        applicationId: this.id,
        status: "ok",
        summary:
          "Pier-only equivalent-frame FEM model assembled for the masonry wall alignment, ready for the first linear validation steps with topRotation free or fixed.",
        outputs: {
          stage: frame.stage,
          topRotation: frame.topRotation,
          equivalentFrame: frame.snapshot,
          piers: frame.pierFrames,
        },
        warnings: frame.warnings,
        assumptions: frame.assumptions,
        metadata: {
          domain: this.domain,
          mode,
          stage: frame.stage,
          topRotation: frame.topRotation,
          pierCount: frame.pierFrames.length,
        },
      });
    }

    return this.createPlaceholderResult({
      summary:
        "Masonry wall openings engine scaffold created. Geometry sanitization is implemented; extraction, static and seismic analyses will build on the sanitized model.",
      warnings: sanitization.warnings,
      outputs: {
        modelId: model.id,
        mode,
        sanitizedOpenings: sanitization.openings,
        discardedOpeningIds: sanitization.discardedOpeningIds,
      },
      assumptions: [
        "Unsupported execution modes already receive the sanitized geometry so downstream work can start from a stable preprocessing baseline.",
      ],
      metadata: {
        mode,
      },
    });
  }
}
