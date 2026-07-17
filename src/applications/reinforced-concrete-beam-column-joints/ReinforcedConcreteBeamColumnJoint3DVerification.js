import { VerificationResult } from "../../core/results/VerificationResult.js";
import { governingCheck } from "../../core/results/checkUtils.js";
import { RESULT_STATUS } from "../../core/results/resultStatus.js";
import { ReinforcedConcreteBeamColumnJointVerification } from "./ReinforcedConcreteBeamColumnJointVerification.js";

export class ReinforcedConcreteBeamColumnJoint3DVerification {
  constructor({ code = "NTC2018", metadata = {} } = {}) {
    this.code = code;
    this.metadata = { ...metadata };
  }

  verify(model) {
    const directionalResults = model.directions.map((direction) => ({
      directionId: direction.directionId,
      result: new ReinforcedConcreteBeamColumnJointVerification({
        code: this.code,
      }).verify(direction),
    }));
    const checks = directionalResults.flatMap(({ directionId, result }) =>
      result.checks.map((check) => ({
        ...check,
        id: `${check.id}-${directionId}`,
        metadata: { ...check.metadata, directionId },
      })));
    const governing = governingCheck(checks);
    const unsupported = directionalResults.some(({ result }) =>
      result.status === RESULT_STATUS.NOT_SUPPORTED);
    const ok = directionalResults.every(({ result }) =>
      result.status === RESULT_STATUS.OK);

    return new VerificationResult({
      applicationId: "reinforced-concrete-beam-column-joints",
      status: unsupported
        ? RESULT_STATUS.NOT_SUPPORTED
        : ok
          ? RESULT_STATUS.OK
          : RESULT_STATUS.NOT_VERIFIED,
      summary: "Concurrent multidirectional NTC 2018 beam-column joint verification.",
      utilizationRatio: governing?.utilizationRatio ?? null,
      demand: governing?.demand ?? null,
      capacity: governing?.capacity ?? null,
      checks,
      outputs: {
        jointId: model.id,
        concurrentActionState: true,
        directionCount: directionalResults.length,
        directions: Object.fromEntries(
          directionalResults.map(({ directionId, result }) => [
            directionId,
            result.toJSON(),
          ]),
        ),
      },
      warnings: directionalResults.flatMap(({ directionId, result }) =>
        result.warnings.map((warning) => `[${directionId}] ${warning}`)),
      assumptions: [
        "NTC 2018 joint resistance is checked separately in every horizontal direction using actions from one declared concurrent design state.",
        "No undocumented scalar interaction equation is introduced between orthogonal NTC directional checks.",
        ...directionalResults.flatMap(({ directionId, result }) =>
          result.assumptions.map((assumption) => `[${directionId}] ${assumption}`)),
      ],
      metadata: {
        code: this.code,
        method: "ntc2018-concurrent-directional-joint-checks",
        governingCheckId: governing?.id ?? null,
        ...this.metadata,
      },
    });
  }
}
