import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Loader2, RotateCcw, Save, Move } from "lucide-react";

export type StampSettings = {
  stamp_x: number;          // % of preview width (0-100), center of stamp
  stamp_y: number;          // % of preview height (0-100), center of stamp
  stamp_position_type: string | null;
  stamp_size: number;       // 0.3 - 1.5
  stamp_opacity: number;    // 0 - 1
};

const DEFAULTS: StampSettings = {
  stamp_x: 75,
  stamp_y: 78,
  stamp_position_type: "bottom-right",
  stamp_size: 1.0,
  stamp_opacity: 0.6,
};

const PRESETS: Record<string, { x: number; y: number; label: string }> = {
  "top-left":      { x: 18, y: 14, label: "Top Left" },
  "top-right":     { x: 82, y: 14, label: "Top Right" },
  "center":        { x: 50, y: 50, label: "Center" },
  "bottom-left":   { x: 18, y: 88, label: "Bottom Left" },
  "bottom-right":  { x: 82, y: 88, label: "Bottom Right" },
  "near-signature":{ x: 78, y: 70, label: "Near Signatures" },
};

const SIZE_PRESETS = { Small: 0.5, Medium: 1.0, Large: 1.4 };
const OPACITY_PRESETS = [1, 0.8, 0.6, 0.4];

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  schoolId: string;
  stampUrl: string | null;
  initial: Partial<StampSettings>;
  onSaved: (s: StampSettings) => void;
};

export function StampPositionDialog({ open, onOpenChange, schoolId, stampUrl, initial, onSaved }: Props) {
  const [s, setS] = useState<StampSettings>({ ...DEFAULTS, ...initial });
  const [saving, setSaving] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  useEffect(() => {
    if (open) setS({ ...DEFAULTS, ...initial });
  }, [open]);

  const applyPreset = (key: string) => {
    const p = PRESETS[key];
    if (!p) return;
    setS(prev => ({ ...prev, stamp_x: p.x, stamp_y: p.y, stamp_position_type: key }));
  };

  const onPointerDown = (e: React.PointerEvent) => {
    draggingRef.current = true;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    updatePosFromEvent(e);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    updatePosFromEvent(e);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    draggingRef.current = false;
    (e.target as Element).releasePointerCapture?.(e.pointerId);
  };
  const updatePosFromEvent = (e: React.PointerEvent) => {
    const el = previewRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setS(prev => ({
      ...prev,
      stamp_x: Math.max(0, Math.min(100, x)),
      stamp_y: Math.max(0, Math.min(100, y)),
      stamp_position_type: null,
    }));
  };

  const reset = () => setS(DEFAULTS);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("school_info" as any)
      .update({
        stamp_x: s.stamp_x,
        stamp_y: s.stamp_y,
        stamp_position_type: s.stamp_position_type,
        stamp_size: s.stamp_size,
        stamp_opacity: s.stamp_opacity,
      })
      .eq("id", schoolId);
    setSaving(false);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Stamp position saved", description: "Will apply to all reports for this school." });
    onSaved(s);
    onOpenChange(false);
  };

  // Stamp display size in preview: base 90px * scale
  const stampPx = 90 * s.stamp_size;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Move className="h-4 w-4" /> Stamp Position & Settings
          </DialogTitle>
          <p className="text-xs text-muted-foreground">Drag the stamp to position it</p>
        </DialogHeader>

        {/* A4-ratio preview */}
        <div
          ref={previewRef}
          className="relative w-full bg-white border rounded-md select-none touch-none overflow-hidden"
          style={{ aspectRatio: "210 / 297" }}
        >
          {/* Mock layout */}
          <div className="absolute inset-x-3 top-3 h-6 bg-muted rounded-sm flex items-center justify-center text-[10px] text-muted-foreground">SCHOOL HEADER</div>
          <div className="absolute inset-x-3 top-12 h-4 bg-muted/70 rounded-sm flex items-center justify-center text-[9px] text-muted-foreground">Student Info</div>
          <div className="absolute inset-x-3 top-[42%] h-5 bg-muted rounded-sm flex items-center justify-center text-[9px] text-muted-foreground">Performance Table</div>
          <div className="absolute inset-x-3 top-[55%] h-5 bg-muted rounded-sm flex items-center justify-center text-[9px] text-muted-foreground">Comments / Signatures</div>
          <div className="absolute inset-x-3 bottom-3 h-4 bg-muted/70 rounded-sm flex items-center justify-center text-[9px] text-muted-foreground">Footer</div>

          {/* Stamp */}
          {stampUrl ? (
            <div
              role="button"
              aria-label="Drag stamp"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              className="absolute cursor-grab active:cursor-grabbing"
              style={{
                left: `${s.stamp_x}%`,
                top: `${s.stamp_y}%`,
                width: stampPx,
                height: stampPx,
                transform: "translate(-50%, -50%)",
                opacity: s.stamp_opacity,
              }}
            >
              <img src={stampUrl} alt="stamp" className="w-full h-full object-contain pointer-events-none" draggable={false} />
            </div>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
              Upload a stamp first
            </div>
          )}
        </div>

        {/* Presets */}
        <div className="space-y-2">
          <div className="text-xs font-medium">Quick Position Presets</div>
          <div className="grid grid-cols-3 gap-2">
            {Object.entries(PRESETS).map(([k, p]) => (
              <Button
                key={k}
                type="button"
                variant={s.stamp_position_type === k ? "default" : "outline"}
                size="sm"
                onClick={() => applyPreset(k)}
              >
                {p.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Size */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-xs font-medium">Stamp Size</div>
            <div className="text-xs text-muted-foreground">{Math.round(s.stamp_size * 100)}%</div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {Object.entries(SIZE_PRESETS).map(([label, val]) => (
              <Button
                key={label}
                type="button"
                variant={Math.abs(s.stamp_size - val) < 0.001 ? "default" : "outline"}
                size="sm"
                onClick={() => setS(p => ({ ...p, stamp_size: val }))}
              >
                {label}
              </Button>
            ))}
          </div>
          <Slider
            min={0.3} max={1.5} step={0.05}
            value={[s.stamp_size]}
            onValueChange={([v]) => setS(p => ({ ...p, stamp_size: v }))}
          />
        </div>

        {/* Opacity */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-xs font-medium">Stamp Opacity</div>
            <div className="text-xs text-muted-foreground">{Math.round(s.stamp_opacity * 100)}%</div>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {OPACITY_PRESETS.map(v => (
              <Button
                key={v}
                type="button"
                variant={Math.abs(s.stamp_opacity - v) < 0.001 ? "default" : "outline"}
                size="sm"
                onClick={() => setS(p => ({ ...p, stamp_opacity: v }))}
              >
                {Math.round(v * 100)}%
              </Button>
            ))}
          </div>
          <Slider
            min={0} max={1} step={0.05}
            value={[s.stamp_opacity]}
            onValueChange={([v]) => setS(p => ({ ...p, stamp_opacity: v }))}
          />
        </div>

        <div className="flex items-center justify-between gap-2 pt-2 border-t">
          <Button type="button" variant="outline" onClick={reset}>
            <RotateCcw className="h-4 w-4 mr-2" /> Reset
          </Button>
          <Button type="button" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Save Position for All Reports
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export { DEFAULTS as STAMP_DEFAULTS };
