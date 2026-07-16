import { describe, expect, it } from "vitest";
import { validateReviewPackage } from "./validate.js";

describe("human review package", () => {
  it("grounds every packet in a committed artifact while reporting human work as pending", async () => {
    const result = await validateReviewPackage();

    expect(result.errors).toEqual([]);
    expect(result.readiness).toEqual({
      expertPacketsComplete: 0,
      expertPacketsRequired: 4,
      completedReviews: 0,
      userStudyStatus: "pending-human-evaluation",
      complete: false,
    });
    expect(result.warnings).toContain("4 expert/opposed packet(s) still need human review");
  });
});
