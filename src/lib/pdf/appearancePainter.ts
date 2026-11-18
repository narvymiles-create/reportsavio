import { Painter, type Fonts } from "./core";
import type { PDFPage } from "pdf-lib";
import type { AppearanceRole, ReportAppearance } from "@/lib/reportAppearance";
/** Scoped semantic roles override colours only; all dimensions and original fallbacks remain unchanged. */
export class AppearancePainter extends Painter {
  textRole: AppearanceRole = "tableText";
  fillRole: AppearanceRole = "tableBackground";
  borderRole: AppearanceRole = "tableBorder";
  constructor(page: PDFPage, fonts: Fonts, readonly appearance: ReportAppearance = {}, private watermark = false) { super(page, fonts); }
  text(str: string, opts: Parameters<Painter["text"]>[1]) { return super.text(str, { ...opts, color: this.appearance[this.textRole] ?? opts.color }); }
  rect(opts: Parameters<Painter["rect"]>[0]) { return super.rect({ ...opts, fill: this.appearance[this.fillRole] ?? opts.fill, border: opts.border ? this.appearance[this.borderRole] ?? opts.border : undefined, opacity: this.watermark && this.appearance[this.fillRole] ? 0.18 : opts.opacity, borderOpacity: opts.borderOpacity ?? opts.opacity ?? 1 }); }
  line(...args: Parameters<Painter["line"]>) { const [x1,y1,x2,y2,o] = args; super.line(x1,y1,x2,y2,{ ...o, color: this.appearance[this.borderRole] ?? o?.color }); }
  roundRect(opts: Parameters<Painter["roundRect"]>[0]) { super.roundRect({ ...opts, opacity: this.watermark ? 0.18 : 1, border: this.appearance[this.borderRole] ?? opts.border }); }
  section(text: AppearanceRole, fill: AppearanceRole, border: AppearanceRole) { this.textRole = text; this.fillRole = fill; this.borderRole = border; }
  background() { const bg = this.appearance.pageBackground; if (bg) super.rect({ x: 0, y: 0, w: 210, h: 297, fill: bg }); }
}