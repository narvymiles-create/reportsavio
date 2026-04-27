/**
 * Shared mini A4 preview that mimics the REAL report card layout
 * (header with logo + school info + photo, title, student info,
 *  performance table, signatures, grading scale, footer).
 *
 * Used as the background for the Stamp Position dialog and the
 * Watermark Panel so admins see exactly where overlays will land.
 */
export function ReportCardMiniPreview() {
  return (
    <div
      aria-hidden
      className="absolute inset-0 text-[7px] leading-tight text-foreground/80 font-sans"
      style={{ padding: "4%" }}
    >
      {/* ===== Header: logo | school info | photo ===== */}
      <div className="flex gap-2 border-b border-foreground/30 pb-1">
        <div className="w-[16%] aspect-square border border-foreground/40 rounded-sm bg-foreground/5 flex items-center justify-center text-[6px] text-foreground/50">
          LOGO
        </div>
        <div className="flex-1 text-center">
          <div className="font-bold text-[10px] tracking-wide">SCHOOL NAME</div>
          <div className="text-[6.5px]">Location: Town · P.O.BOX 000</div>
          <div className="text-[6.5px]">TEL: 000-000 · Email: info@school</div>
          <div className="italic text-[6.5px] text-foreground/60">"School Motto Here"</div>
        </div>
        <div className="w-[16%] aspect-[122/132] border border-foreground/40 rounded-sm bg-foreground/5 flex items-center justify-center text-[6px] text-foreground/50">
          PHOTO
        </div>
      </div>

      {/* ===== Title ===== */}
      <div className="text-center font-semibold text-[8px] mt-1 mb-1 underline">
        LEARNER&rsquo;S ASSESSMENT REPORT CARD &mdash; TERM
      </div>

      {/* ===== Student info ===== */}
      <div className="grid grid-cols-3 gap-x-2 gap-y-0.5 border border-foreground/30 p-1 mb-1">
        <div><b>NAME:</b> __________</div>
        <div><b>STREAM:</b> ___</div>
        <div><b>HOUSE:</b> ___</div>
        <div><b>AGE:</b> __</div>
        <div><b>SEX:</b> __</div>
        <div><b>LIN:</b> _______</div>
        <div><b>CLASS:</b> ___</div>
        <div><b>SECTION:</b> ___</div>
        <div><b>PAY:</b> ___</div>
      </div>

      {/* ===== Performance table ===== */}
      <div className="text-center text-[6.5px] font-semibold bg-foreground/10 py-0.5 mb-0.5">
        END OF TERM EXAMS
      </div>
      <table className="w-full border-collapse mb-1 text-[6px]">
        <thead>
          <tr className="bg-foreground/10">
            {["SUBJECT", "FULL", "GOT", "GR", "REMARK", "INIT"].map(h => (
              <th key={h} className="border border-foreground/30 px-0.5 py-[1px] font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {["English", "Mathematics", "Science", "S.S.T", "R.E"].map(name => (
            <tr key={name}>
              <td className="border border-foreground/30 px-0.5">{name}</td>
              <td className="border border-foreground/30 text-center">100</td>
              <td className="border border-foreground/30 text-center">__</td>
              <td className="border border-foreground/30 text-center">__</td>
              <td className="border border-foreground/30 px-0.5">______</td>
              <td className="border border-foreground/30 text-center">__</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex justify-between text-[6px] mb-1">
        <span><b>TOTAL:</b> __</span>
        <span><b>AVG:</b> __</span>
        <span><b>POS:</b> _/_</span>
        <span><b>AGG:</b> __</span>
        <span><b>DIV:</b> _</span>
      </div>

      {/* ===== Comments + signatures ===== */}
      <div className="grid grid-cols-2 gap-1 border border-foreground/30 p-1 mb-1">
        <div className="text-[6px]">
          <div><b>Conduct:</b> ______</div>
          <div><b>Class T. Comment:</b> ______</div>
          <div><b>Head T. Comment:</b> ______</div>
        </div>
        <div className="text-[6px] text-right">
          <div className="border-b border-dotted border-foreground/50 mt-1">&nbsp;</div>
          <div>Class Teacher</div>
          <div className="border-b border-dotted border-foreground/50 mt-2">&nbsp;</div>
          <div>Head Teacher</div>
        </div>
      </div>

      {/* ===== Grading scale + footer ===== */}
      <div className="text-center font-semibold text-[6.5px]">SCHOOL GRADING SYSTEM</div>
      <table className="w-full border-collapse text-[6px]">
        <tbody>
          <tr>
            <td className="border border-foreground/30 font-medium px-0.5">GRADE</td>
            {["D1","D2","C3","C4","C5","C6","P7","P8","F9"].map(g => (
              <td key={g} className="border border-foreground/30 text-center">{g}</td>
            ))}
          </tr>
          <tr>
            <td className="border border-foreground/30 font-medium px-0.5">MARKS</td>
            {["95+","80-94","70-79","60-69","55-59","50-54","45-49","40-44","0-39"].map(r => (
              <td key={r} className="border border-foreground/30 text-center">{r}</td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
