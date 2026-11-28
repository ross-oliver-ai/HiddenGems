import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { AiSettingsForm } from "@/components/AiSettingsForm";
import { aiKeyPresent, aiMonthSummary, getAiSettings } from "@/lib/ai-service";
import { aiModelLabel, microUsdToPounds, poundsLabel } from "@/lib/ai-pricing";

export default async function AdminAiPage() {
  await requireAdmin();
  const [settings, month] = await Promise.all([getAiSettings(), aiMonthSummary()]);
  const keyPresent = aiKeyPresent();
  const spent = microUsdToPounds(month.costMicroUsd);
  const each = month.requests > 0 ? microUsdToPounds(month.costMicroUsd / month.requests) : null;
  const live = settings.enabled && keyPresent;

  return (
    <div className="space-y-3">
      <div>
        <Link href="/settings" className="text-sm font-bold text-primary">← Settings</Link>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight">AI photo fill</h1>
        <p className="text-sm text-muted">On Add item, the AI reads the item photo (and an optional tag photo) by itself and fills in the name, brand, size, category and condition. The seller checks and saves. If they save before it finishes, it finishes afterwards and the item is flagged &ldquo;Check details&rdquo;.</p>
      </div>

      <section className="card space-y-1" data-ai-status={live ? "on" : "off"}>
        <p className="font-extrabold">{live ? "✅ On for everyone" : settings.enabled ? "⚠️ Switched on, but no key" : "Off"}</p>
        {settings.enabled && !keyPresent && (
          <p className="text-sm text-danger">The server has no <code>ANTHROPIC_API_KEY</code>, so nothing can be sent yet. Add it in Vercel (Production) and redeploy.</p>
        )}
        <p className="text-sm text-muted">Using {aiModelLabel(settings.model)}.</p>
      </section>

      <section className="card">
        <AiSettingsForm settings={settings} />
      </section>

      <h2 className="pt-2 text-sm font-extrabold uppercase tracking-wider text-muted">This month</h2>
      <div className="grid grid-cols-2 gap-3">
        <div className="card p-3">
          <p className="text-3xl font-extrabold leading-none">{month.requests}</p>
          <p className="mt-1 text-xs font-bold text-muted">suggestions{month.failed > 0 ? ` (${month.failed} unusable)` : ""}</p>
        </div>
        <div className="card p-3">
          <p className="text-3xl font-extrabold leading-none">{poundsLabel(spent)}</p>
          <p className="mt-1 text-xs font-bold text-muted">estimated spend of £{settings.monthlyBudgetPounds}</p>
        </div>
      </div>
      <p className="text-xs text-muted">
        {each !== null ? `About ${poundsLabel(each)} each. ` : ""}
        {month.inputTokens.toLocaleString("en-GB")} tokens in, {month.outputTokens.toLocaleString("en-GB")} out. These are estimates from Anthropic&rsquo;s list prices; the real bill is in the Anthropic Console. The month runs from the 1st (UK time).
      </p>
    </div>
  );
}
