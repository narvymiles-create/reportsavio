import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Loader2, RotateCcw, Save, Upload, Droplet } from "lucide-react";
import { ReportCardMiniPreview } from "@/components/ReportCardMiniPreview";

export type WatermarkSettings = {
  watermark_enabled: boolean;
  watermark_x: number;       // 0-100 (% of page), center
  watermark_y: number;       // 0-100 (% of page), center
  watermark_scale: number;   // 0.2 - 2.5
  watermark_opacity: number; // 0 - 1
  watermark_mode: "custom" | "fit" | "fill";
};

export const WATERMARK_DEFAULTS: WatermarkSettings = {
  watermark_enabled: false,
  watermark_x: 50,
  watermark_y: 50,
  watermark_scale: 1.0,
  watermark_opacity: 0.3,
  watermark_mode: "custom",
};

const POSITION_PRESETS: Record<string, { x: number; y: number; label: string }> = {
  "top-left":      { x: 20, y: 20, label: "Top Left" },
  "top-center":    { x: 50, y: 20, label: "Top Center" },
  "top-right":     { x: 80, y: 20, label: "Top Right" },
  "center-left":   { x: 20, y: 50, label: "Center Left" },
  "center":        { x: 50, y: 50, label: "Center" },
  "center-right":  { x: 80, y: 50, label: "Center Right" },
  "bottom-left":   { x: 20, y: 80, label: "Bottom Left" },
  "bottom-center": { x: 50, y: 80, label: "Bottom Center" },
  "bottom-right":  { x: 80, y: 80, label: "Bottom Right" },
};

type Props = {
  schoolId: string;
  watermarkUrl: string | null;
  initial: Partial<WatermarkSettings>;
  onSaved: (s: WatermarkSettings & { watermark_path?: string | null }) => void;
  onUploaded: () => void; // reload signed url
};

export function WatermarkPanel({ schoolId, watermarkUrl, initial, onSaved, onUploaded }: Props) {
  const [s, setS] = useState<WatermarkSettings>({ ...WATERMARK_DEFAULTS, ...initial });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  useEffect(() => {
    setS({ ...WATERMARK_DEFAULTS, ...initial });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial.watermark_enabled, initial.watermark_x, initial.watermark_y, initial.watermark_scale, initial.watermark_opacity, initial.watermark_mode]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Too large", description: "Watermark must be under 5 MB.", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      // Upload watermark exactly as provided (no auto background removal).
      const ext = (file.name.split(".").pop() || "png").toLowerCase();
      const path = `watermark-${schoolId}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("school-assets")
        .upload(path, file, { upsert: true, contentType: file.type || "image/png" });
      if (upErr) throw upErr;
      await supabase.from("school_info" as any).update({ watermark_path: path }).eq("id", schoolId);
      toast({ title: "Watermark uploaded", description: "Your image is saved as-is." });
      onUploaded();
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (s.watermark_mode !== "custom") return;
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
    setS(p => ({
      ...p,
      watermark_x: Math.max(0, Math.min(100, x)),
      watermark_y: Math.max(0, Math.min(100, y)),
    }));
  };

  const reset = () => setS({ ...WATERMARK_DEFAULTS, watermark_enabled: s.watermark_enabled });

  const save = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("school_info" as any)
      .update({
        watermark_enabled: s.watermark_enabled,
        watermark_x: s.watermark_x,
        watermark_y: s.watermark_y,
        watermark_scale: s.watermark_scale,
        watermark_opacity: s.watermark_opacity,
        watermark_mode: s.watermark_mode,
      })
      .eq("id", schoolId);
    setSaving(false);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Watermark settings saved", description: "Applied to all report cards." });
    onSaved(s);
  };

  // Preview sizing — base size is 40% of preview width at scale 1, in custom mode
  const baseWidthPct = 40 * s.watermark_scale;

  const renderWatermark = () => {
    if (!watermarkUrl) return null;
    if (s.watermark_mode === "fit" || s.watermark_mode === "fill") {
      return (
        <img
          src={watermarkUrl}
          alt="watermark"
          draggable={false}
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={{
            objectFit: s.watermark_mode === "fill" ? "cover" : "contain",
            opacity: s.watermark_opacity,
          }}
        />
      );
    }
    return (
      <div
        role="button"
        aria-label="Drag watermark"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className="absolute cursor-grab active:cursor-grabbing"
        style={{
          left: `${s.watermark_x}%`,
          top: `${s.watermark_y}%`,
          width: `${baseWidthPct}%`,
          transform: "translate(-50%, -50%)",
          opacity: s.watermark_opacity,
        }}
      >
        <img src={watermarkUrl} alt="watermark" draggable={false} className="w-full h-auto pointer-events-none" />
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Upload */}
      <div className="flex items-center gap-3 flex-wrap">
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={handleUpload}
        />
        <Button type="button" variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading}>
          {uploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
          {watermarkUrl ? "Replace watermark" : "Upload watermark"}
        </Button>
        <div className="flex items-center gap-2">
          <Switch
            id="wm-enable"
            checked={s.watermark_enabled}
            onCheckedChange={(v) => setS(p => ({ ...p, watermark_enabled: !!v }))}
          />
          <Label htmlFor="wm-enable" className="text-sm">Enable watermark</Label>
        </div>
      </div>
      <p className="text-xs text-amber-600 dark:text-amber-400">
        ⚠ Please remove the background BEFORE uploading (use a transparent PNG). Your image is uploaded exactly as provided.
      </p>

      {/* A4-ratio preview */}
      <div
        ref={previewRef}
        className="relative w-full bg-white border rounded-md select-none touch-none overflow-hidden"
        style={{ aspectRatio: "210 / 297" }}
      >
        {/* watermark layer (behind) */}
        <div className="absolute inset-0" style={{ zIndex: 0 }}>
          {renderWatermark()}
        </div>
        {/* real report card preview layer (above watermark) */}
        <div className="absolute inset-0" style={{ zIndex: 2 }}>
          <ReportCardMiniPreview />
        </div>
        {!watermarkUrl && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground bg-background/40 z-10">
            Upload a watermark image to begin
          </div>
        )}
      </div>

      {/* Quick Position Presets */}
      <div className="space-y-2">
        <div className="text-xs font-medium">Quick Position Presets</div>
        <div className="grid grid-cols-3 gap-2">
          {Object.entries(POSITION_PRESETS).map(([k, p]) => {
            const active =
              s.watermark_mode === "custom" &&
              Math.abs(s.watermark_x - p.x) < 0.5 &&
              Math.abs(s.watermark_y - p.y) < 0.5;
            return (
              <Button
                key={k}
                type="button"
                size="sm"
                variant={active ? "default" : "outline"}
                onClick={() =>
                  setS(prev => ({
                    ...prev,
                    watermark_mode: "custom",
                    watermark_x: p.x,
                    watermark_y: p.y,
                  }))
                }
              >
                {p.label}
              </Button>
            );
          })}
        </div>
        <p className="text-[11px] text-muted-foreground">
          Tap a preset to snap. Switches to Custom mode automatically.
        </p>
      </div>

      {/* Mode */}
      <div className="space-y-2">
        <div className="text-xs font-medium">Coverage Mode</div>
        <div className="grid grid-cols-3 gap-2">
          {(["custom", "fit", "fill"] as const).map(m => (
            <Button
              key={m}
              type="button"
              size="sm"
              variant={s.watermark_mode === m ? "default" : "outline"}
              onClick={() => setS(p => ({ ...p, watermark_mode: m }))}
            >
              {m === "custom" ? "Custom" : m === "fit" ? "Fit Page" : "Fill Page"}
            </Button>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground">
          Custom: drag to position & scale. Fit: full page, keep aspect. Fill: cover entire page.
        </p>
      </div>

      {/* Size */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-xs font-medium">Size</div>
          <div className="text-xs text-muted-foreground">{Math.round(s.watermark_scale * 100)}%</div>
        </div>
        <Slider
          min={0.2} max={2.5} step={0.05}
          value={[s.watermark_scale]}
          onValueChange={([v]) => setS(p => ({ ...p, watermark_scale: v }))}
          disabled={s.watermark_mode !== "custom"}
        />
      </div>

      {/* Opacity */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-xs font-medium flex items-center gap-1"><Droplet className="h-3 w-3" /> Opacity</div>
          <div className="text-xs text-muted-foreground">{Math.round(s.watermark_opacity * 100)}%</div>
        </div>
        <Slider
          min={0} max={1} step={0.05}
          value={[s.watermark_opacity]}
          onValueChange={([v]) => setS(p => ({ ...p, watermark_opacity: v }))}
        />
        <p className="text-[11px] text-muted-foreground">Recommended 20–40% to keep report content readable.</p>
      </div>

      <div className="flex items-center justify-between gap-2 pt-2 border-t">
        <Button type="button" variant="outline" onClick={reset}>
          <RotateCcw className="h-4 w-4 mr-2" /> Reset
        </Button>
        <Button type="button" onClick={save} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Save Watermark Settings
        </Button>
      </div>
    </div>
  );
}
