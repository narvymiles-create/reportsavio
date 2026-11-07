import { describe, expect, it } from "vitest";
import { inflateSync } from "node:zlib";
import { PDFDocument } from "pdf-lib";
import { renderNurseryReport, type NurseryData } from "@/lib/pdf/nurseryReport";
import { hexToRgb } from "@/lib/pdf/core";

/**
 * The on-screen Nursery sheet styles learning-area comments with `.nrc-write`
 * (#1d4ed8 blue). The generated PDF must use the same blue, not the old
 * near-black #1f2937 that made downloads differ from preview and print.
 */
const BLUE = hexToRgb("#1d4ed8");
const NEAR_BLACK = hexToRgb("#1f2937");

function fixture(): unknown {
  return {
    school: { name: "Test Nursery", motto: "Learn and grow", watermark_enabled: false },
    learner: { id: "l1", full_name: "Test Learner", age: 5, sex: "F" },
    cls: { name: "Nursery 1" },
    stream: { name: "Blue" },
    classTeacher: { full_name: "Jane Doe" },
    term: { name: "Term 1" },
    areas: [
      { id: "a1", name: "Literacy" },
      { id: "a2", name: "Numeracy" },
    ],
    areaImageUrls: [],
    colors: [{ grade: "E", label: "Excellent", color: "#22c55e" }],
    assessments: {
      a1: { grade: "E", comment: "reads with confidence" },
      a2: { grade: "E", comment: "counts to twenty" },
    },
    report: { class_teacher_comment: "well done", head_teacher_comment: "keep it up" },
    borderStyle: "double",
    showPayCode: false,
    assets: { logo: null, photo: null, stamp: null, watermark: null, classSig: null, headSig: null },
  };
}

/** Every "r g b rg" (fill) operator in the PDF, including compressed streams. */
async function fillOps(doc: PDFDocument): Promise<number[][]> {
  const bytes = await doc.save();
  const raw = Buffer.from(bytes);
  const parts: Buffer[] = [];
  let cursor = 0;
  while (true) {
    const start = raw.indexOf("stream", cursor);
    if (start === -1) break;
    let body = start + "stream".length;
    if (raw[body] === 0x0d) body += 1;
    if (raw[body] === 0x0a) body += 1;
    const end = raw.indexOf("endstream", body);
    if (end === -1) break;
    const chunk = raw.subarray(body, end);
    try {
      parts.push(inflateSync(chunk));
    } catch {
      parts.push(Buffer.from(chunk));
    }
    cursor = end + "endstream".length;
  }
  const text = Buffer.concat(parts).toString("latin1");
  const ops: number[][] = [];
  for (const m of text.matchAll(/([\d.]+) ([\d.]+) ([\d.]+) rg/g)) {
    ops.push([Number(m[1]), Number(m[2]), Number(m[3])]);
  }
  return ops;
}

const near = (op: number[], target: { r: number; g: number; b: number }) =>
  Math.abs(op[0] - target.r) < 0.002 &&
  Math.abs(op[1] - target.g) < 0.002 &&
  Math.abs(op[2] - target.b) < 0.002;

describe("Nursery report card PDF — learning-area comment colour", () => {
  it("draws area comments in the same blue as the on-screen sheet", async () => {
    const doc = await renderNurseryReport(fixture() as NurseryData, await PDFDocument.create());
    const ops = await fillOps(doc);
    expect(ops.filter((o) => near(o, BLUE)).length).toBeGreaterThanOrEqual(2);
  });

  it("no longer fills any text with the old near-black", async () => {
    const doc = await renderNurseryReport(fixture() as NurseryData, await PDFDocument.create());
    const ops = await fillOps(doc);
    expect(ops.filter((o) => near(o, NEAR_BLACK)).length).toBe(0);
  });
});
