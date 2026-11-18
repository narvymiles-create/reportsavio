import { ReactNode } from "react";
import { Check, Infinity as InfinityIcon, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  ONLINE_TIERS, DESKTOP_TIERS, CREDIT_PACKS, annualPrice, creditsAmount, formatUGX, graceLimit,
  type OnlineTier, type DesktopTier,
} from "@/lib/billing/api";

export type BillingPeriod = "termly" | "annual";

const ONLINE_NAMES: Record<string, string> = {
  online_150: "Online Starter", online_300: "Online Growth", online_600: "Online Professional", online_1000: "Online Premium", online_1500: "Online Enterprise",
};
const DESKTOP_NAMES: Record<string, string> = {
  desktop_300: "Desktop Starter", desktop_600: "Desktop Growth", desktop_1200: "Desktop Professional", desktop_2000: "Desktop Enterprise",
};
export const onlinePackageName = (code: string) => ONLINE_NAMES[code] ?? "Online package";
export const desktopPackageName = (code: string) => DESKTOP_NAMES[code] ?? "Desktop licence";
const fmt = (n: number) => n.toLocaleString("en-US");

export function GrowthAllowance({ capacity }: { capacity: number }) {
  return (
    <div className="rounded-md border border-success/20 bg-success/10 p-3">
      <p className="flex items-center gap-1.5 text-sm font-medium text-success"><TrendingUp className="h-4 w-4" />Growth Allowance</p>
      <p className="mt-1 text-lg font-semibold text-success">Up to {fmt(graceLimit(capacity))} learners</p>
      <p className="text-xs text-muted-foreground">10% extra capacity · Permanent · No expiry · No extra charge</p>
    </div>
  );
}

interface CardProps {
  name: string; capacityLabel: string; price: string; priceNote: string; badge?: string; popular?: boolean; selected?: boolean;
  allowanceFor?: number; benefits: string[]; footer?: ReactNode; action: ReactNode; extra?: ReactNode;
}

export function PackageCard({ name, capacityLabel, price, priceNote, badge, popular, selected, allowanceFor, benefits, action, extra }: CardProps) {
  return (
    <div className={cn("flex flex-col rounded-xl border bg-card p-5 shadow-sm transition-shadow",
      popular && "border-accent", selected && "ring-2 ring-primary shadow-[var(--shadow-elegant)]")} data-selected={selected || undefined}>
      <div className="flex min-h-6 flex-wrap gap-1">
        {popular && <Badge className="bg-accent text-accent-foreground hover:bg-accent">Popular</Badge>}
        {selected && <Badge>Selected</Badge>}
      </div>
      <h3 className="mt-2 text-lg font-semibold">{name}</h3>
      <p className="text-sm text-muted-foreground">{capacityLabel}</p>
      <p className="mt-3 text-2xl font-bold text-primary">{price}</p>
      <p className="text-xs text-muted-foreground">{priceNote}</p>
      {badge && <Badge variant="outline" className="mt-2 w-fit border-success/40 text-success">{badge}</Badge>}
      {extra}
      <div className="my-4 border-t" />
      {allowanceFor ? <GrowthAllowance capacity={allowanceFor} /> : null}
      <ul className="mt-3 flex-1 space-y-2 text-sm">
        {benefits.map((b) => <li key={b} className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />{b}</li>)}
      </ul>
      <div className="mt-5">{action}</div>
    </div>
  );
}

interface ChooseProps { selected?: string | null; onChoose: (code: string) => void; disabledFor?: (code: string) => string | null; actionLabel?: (code: string) => string }

export function OnlinePackages({ period, selected, onChoose, disabledFor, actionLabel }: ChooseProps & { period: BillingPeriod }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {ONLINE_TIERS.map((t: OnlineTier) => {
        const a = annualPrice(t);
        const reason = disabledFor?.(t.code) ?? null;
        return (
          <PackageCard key={t.code} name={onlinePackageName(t.code)} capacityLabel={t.label} popular={t.code === "online_300"} selected={selected === t.code}
            price={formatUGX(period === "annual" ? a.final : t.perTerm)}
            priceNote={period === "annual" ? `per year · normally ${formatUGX(a.normalTotal)}` : "per term"}
            badge={period === "annual" ? `Save ${formatUGX(a.discount)} (8%)` : undefined}
            allowanceFor={t.max}
            benefits={[
              "10% permanent Growth Allowance",
              period === "annual" ? "Covers all three terms of the year" : "Covers the chosen term",
              "Unlimited downloads and printing",
              "Bulk download and bulk print",
              "Primary and Nursery report cards",
              "Renewal reminders and 7-day grace period",
            ]}
            action={<>
              <Button className="w-full" variant={selected === t.code ? "default" : "outline"} disabled={!!reason} onClick={() => onChoose(t.code)}>{actionLabel?.(t.code) ?? "Choose package"}</Button>
              {reason && <p className="mt-1 text-center text-xs text-muted-foreground">{reason}</p>}
            </>} />
        );
      })}
      <CustomCard title="Above 1,500 learners" body="Custom online subscription quotation, with the same permanent 10% Growth Allowance." onChoose={() => onChoose("custom")} />
    </div>
  );
}

export function DesktopPackages({ selected, onChoose, disabledFor, actionLabel, priceFor }: ChooseProps & { priceFor?: (t: DesktopTier) => { price: string; note: string } | null }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {DESKTOP_TIERS.map((t) => {
        const reason = disabledFor?.(t.code) ?? null;
        const custom = priceFor?.(t);
        return (
          <PackageCard key={t.code} name={desktopPackageName(t.code)} capacityLabel={t.label} popular={t.code === "desktop_600"} selected={selected === t.code}
            price={custom?.price ?? formatUGX(t.price)} priceNote={custom?.note ?? "One-time payment"} badge="Lifetime licence" allowanceFor={t.max}
            extra={<p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground"><InfinityIcon className="h-3.5 w-3.5" />No compulsory renewal</p>}
            benefits={["10% permanent Growth Allowance", "Lifetime licence", "Works without internet", "Local school data storage",
              "Also unlocks online downloads and printing", "Upgrade later by paying only the difference"]}
            action={<>
              <Button className="w-full" variant={selected === t.code ? "default" : "outline"} disabled={!!reason} onClick={() => onChoose(t.code)}>{actionLabel?.(t.code) ?? "Choose package"}</Button>
              {reason && <p className="mt-1 text-center text-xs text-muted-foreground">{reason}</p>}
            </>} />
        );
      })}
      <CustomCard title="Above 2,000 learners" body="Custom desktop lifetime licence quotation." onChoose={() => onChoose("custom")} />
    </div>
  );
}

export function PerReportPackages({ selected, onChoose, disabledFor }: ChooseProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {CREDIT_PACKS.map((n) => {
        const reason = disabledFor?.(String(n)) ?? null;
        return (
          <PackageCard key={n} name={`${n} Learners`} capacityLabel={`${n} report cards`} popular={n === 100} selected={selected === String(n)}
            price={formatUGX(creditsAmount(n))} priceNote="Prepaid · UGX 500 per report card"
            benefits={["No fixed subscription", "One Learner per unique report card per term", "Free reprinting, downloading and regeneration", "Unused Learners never expire"]}
            action={<>
              <Button className="w-full" variant={selected === String(n) ? "default" : "outline"} disabled={!!reason} onClick={() => onChoose(String(n))}>Choose package</Button>
              {reason && <p className="mt-1 text-center text-xs text-muted-foreground">{reason}</p>}
            </>} />
        );
      })}
    </div>
  );
}

function CustomCard({ title, body, onChoose }: { title: string; body: string; onChoose: () => void }) {
  return (
    <div className="flex flex-col justify-between rounded-xl border border-dashed bg-card p-5">
      <div><h3 className="text-lg font-semibold">{title}</h3><p className="mt-1 text-sm text-muted-foreground">{body}</p></div>
      <Button variant="outline" className="mt-4 w-full" onClick={onChoose}>Request a quotation</Button>
    </div>
  );
}
