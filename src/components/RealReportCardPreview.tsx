import { useEffect, useRef, useState } from "react";
import "@/pages/PrintReportCard.css";

/**
 * Renders a REAL empty A4 report card sheet (210x297mm) using the exact
 * same .report-page CSS that the printed/PDF report uses, then auto-scales
 * it down to fit any container width. This guarantees the preview shown
 * under the Stamp Position and Watermark settings matches the final PDF
 * pixel-for-pixel.
 */
export function RealReportCardPreview() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.3);

  // Auto-scale the 210mm-wide page to the container width.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    // 210mm ~ 793.7px at 96dpi
    const PAGE_PX = 793.7;
    const compute = () => {
      const w = el.clientWidth;
      if (w > 0) setScale(w / PAGE_PX);
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 297mm ~ 1122.5px at 96dpi → height after scaling
  const PAGE_HEIGHT_PX = 1122.5;
  const placeholder = "____________";

  return (
    <div
      ref={wrapRef}
      className="relative w-full bg-muted/30 border rounded-md overflow-hidden"
      style={{ height: PAGE_HEIGHT_PX * scale }}
    >
      <div
        style={{
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          width: 793.7,
          height: 1122.5,
        }}
      >
        <div className="report-page" style={{ margin: 0, boxShadow: "none" }}>
          {/* Header */}
          <table className="rc-head" cellSpacing={0} cellPadding={0}>
            <tbody>
              <tr>
                <td className="rc-head-logo-cell">
                  <div className="rc-box rc-logo-box">
                    <span>SCHOOL<br />LOGO</span>
                  </div>
                </td>
                <td className="rc-head-school-cell">
                  <div className="rc-school-name">SCHOOL NAME</div>
                  <div className="rc-school-line">Location: ____ · P.O.BOX ____</div>
                  <div className="rc-school-line">TEL: ____ · Email: ____</div>
                </td>
                <td className="rc-head-photo-cell">
                  <div className="rc-box rc-photo-box">
                    <span>STUDENT<br />PHOTO</span>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>

          <div className="rc-title">LEARNER&rsquo;S ASSESSMENT REPORT CARD TERM &ndash; TERM 1</div>

          <table className="rc-student" cellSpacing={0} cellPadding={0}>
            <tbody>
              <tr>
                <td><span className="rc-lbl">NAME:</span> <span className="rc-fill">{placeholder}</span></td>
                <td><span className="rc-lbl">STREAM:</span> <span className="rc-fill">{placeholder}</span></td>
                <td><span className="rc-lbl">HOUSE:</span> <span className="rc-fill">{placeholder}</span></td>
              </tr>
              <tr>
                <td><span className="rc-lbl">SECTION:</span> <span className="rc-fill">{placeholder}</span></td>
                <td><span className="rc-lbl">AGE:</span> <span className="rc-fill">{placeholder}</span></td>
                <td><span className="rc-lbl">SEX:</span> <span className="rc-fill">{placeholder}</span></td>
              </tr>
              <tr>
                <td><span className="rc-lbl">INDEX NO.:</span> <span className="rc-fill">{placeholder}</span></td>
                <td /><td />
              </tr>
              <tr>
                <td><span className="rc-lbl">CLASS:</span> <span className="rc-fill">{placeholder}</span></td>
                <td><span className="rc-lbl">PAY CODE:</span> <span className="rc-fill">{placeholder}</span></td>
                <td />
              </tr>
            </tbody>
          </table>

          {/* BOT table */}
          {(["BEGINNING OF TERM EXAMS", "MID-TERM EXAMS"] as const).map(label => (
            <div key={label} className="rc-phase-section" data-subjects={5 as any}>
              <div className="rc-section-label">{label}</div>
              <table className="rc-phase" data-subjects={5 as any}>
                <thead>
                  <tr>
                    <th className="rc-phase-rowlabel">SUBJECTS</th>
                    {["ENG","MTC","SCI","SST","RE"].map(c => <th key={c}>{c}</th>)}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="rc-phase-rowlabel">MARKS</td>
                    {[0,1,2,3,4].map(i => <td key={i}></td>)}
                  </tr>
                  <tr>
                    <td className="rc-phase-rowlabel">GRADE</td>
                    {[0,1,2,3,4].map(i => <td key={i}></td>)}
                  </tr>
                </tbody>
              </table>
              <table className="rc-phase-summary">
                <tbody>
                  <tr>
                    <td><span className="rc-ps-label">TOTAL MARKS:</span> <span className="rc-ps-val"></span></td>
                    <td><span className="rc-ps-label">AVERAGE:</span> <span className="rc-ps-val"></span></td>
                    <td><span className="rc-ps-label">POSITION:</span> <span className="rc-ps-val"></span></td>
                    <td><span className="rc-ps-label">AGGREGATES:</span> <span className="rc-ps-val"></span></td>
                    <td><span className="rc-ps-label">DIVISION:</span> <span className="rc-ps-val"></span></td>
                  </tr>
                </tbody>
              </table>
            </div>
          ))}

          {/* EOT table (representative) */}
          <div className="rc-eot-section" data-subjects={5 as any}>
            <div className="rc-section-label">END OF TERM EXAMS</div>
            <table className="rc-eot" data-subjects={5 as any}>
              <thead>
                <tr>
                  <th className="rc-eot-subject">SUBJECTS</th>
                  <th>FULL MARKS</th><th>MARKS GOT</th><th>GRADE</th><th>REMARKS</th><th>INITIALS</th>
                </tr>
              </thead>
              <tbody>
                {["ENGLISH", "MATHEMATICS", "SCIENCE", "SOCIAL STUDIES", "RELIGIOUS EDUCATION"].map(name => (
                  <tr key={name}>
                    <td className="rc-eot-subject">{name}</td>
                    <td>100</td><td></td><td></td><td></td><td></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <table className="rc-phase-summary">
              <tbody>
                <tr>
                  <td><span className="rc-ps-label">TOTAL MARKS:</span> <span className="rc-ps-val"></span></td>
                  <td><span className="rc-ps-label">AVERAGE:</span> <span className="rc-ps-val"></span></td>
                  <td><span className="rc-ps-label">POSITION:</span> <span className="rc-ps-val"></span></td>
                  <td><span className="rc-ps-label">AGGREGATES:</span> <span className="rc-ps-val"></span></td>
                  <td><span className="rc-ps-label">DIVISION:</span> <span className="rc-ps-val"></span></td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Bottom: comments + signatures */}
          <table className="rc-bottom" cellSpacing={0} cellPadding={0}>
            <tbody>
              <tr>
                <td className="rc-b-cell rc-b-tl">
                  <div className="rc-b-block rc-b-inline">
                    <span className="rc-b-label">Learner&rsquo;s Conduct &amp; Behavior:</span>
                    <span className="rc-b-text">{placeholder}</span>
                  </div>
                  <div className="rc-b-block rc-b-inline">
                    <span className="rc-b-label">Co-curricular Activities:</span>
                    <span className="rc-b-text">{placeholder}</span>
                  </div>
                </td>
                <td className="rc-b-cell rc-b-tr">
                  <div className="rc-sig-block">
                    <div className="rc-sig-stack">
                      <div className="rc-sig-dots">..................................................</div>
                    </div>
                    <div className="rc-sig-name">&nbsp;</div>
                    <div className="rc-sig-position">Class Teacher</div>
                  </div>
                </td>
              </tr>
              <tr>
                <td className="rc-b-cell rc-b-bl">
                  <div className="rc-b-row-split">
                    <div className="rc-b-label-col">Class Teacher&rsquo;s final comment:</div>
                    <div className="rc-b-text-col">{placeholder}</div>
                  </div>
                  <div className="rc-b-row-split">
                    <div className="rc-b-label-col">Head Teacher&rsquo;s final comment:</div>
                    <div className="rc-b-text-col">{placeholder}</div>
                  </div>
                </td>
                <td className="rc-b-cell rc-b-br">
                  <div className="rc-sig-block">
                    <div className="rc-sig-stack">
                      <div className="rc-sig-dots">..................................................</div>
                    </div>
                    <div className="rc-sig-name">&nbsp;</div>
                    <div className="rc-sig-position">Head Teacher</div>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>

          <div className="rc-term-dates">
            <div><span className="rc-lbl">Next Term Begins On:</span> <span className="rc-fill">{placeholder}</span></div>
            <div><span className="rc-lbl">Ends On:</span> <span className="rc-fill">{placeholder}</span></div>
          </div>

          <div className="rc-grading-title">SCHOOL GRADING SYSTEM</div>
          <table className="rc-grading">
            <tbody>
              <tr>
                <td className="rc-g-label">GRADE</td>
                {["D1","D2","C3","C4","C5","C6","P7","P8","F9"].map(g => <td key={g}>{g}</td>)}
              </tr>
              <tr>
                <td className="rc-g-label">MARKS</td>
                {["95-100","80-94","70-79","60-69","55-59","50-54","45-49","40-44","0-39"].map(r => <td key={r}>{r}</td>)}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
