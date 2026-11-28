"use client";

import { useActionState } from "react";
import { saveAiSettingsAction, type AiSettingsState } from "@/app/(app)/admin/ai/actions";
import { SubmitButton } from "./SubmitButton";
import { AI_MODELS } from "@/lib/ai-pricing";
import type { AiSettings } from "@/lib/ai-rules";

export function AiSettingsForm({ settings }: { settings: AiSettings }) {
  const [state, action] = useActionState<AiSettingsState, FormData>(saveAiSettingsAction, {});
  return (
    <form action={action} className="space-y-4">
      <label className="flex items-start gap-3">
        <input type="checkbox" name="enabled" defaultChecked={settings.enabled} className="mt-1 h-5 w-5 shrink-0" />
        <span>
          <span className="block font-extrabold">Switch on &ldquo;Suggest details from photo&rdquo;</span>
          <span className="block text-sm text-muted">When off, the button doesn&rsquo;t appear on Add item and nothing is sent to the AI. This is the emergency stop.</span>
        </span>
      </label>

      <div>
        <label className="label" htmlFor="model">Model</label>
        <select id="model" name="model" defaultValue={settings.model} className="field">
          {AI_MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="limit">Suggestions per person per month</label>
          <input id="limit" name="limit" type="number" inputMode="numeric" min={1} max={10000} defaultValue={settings.monthlyLimitPerUser} className="field" />
        </div>
        <div>
          <label className="label" htmlFor="budget">Stop everyone at (£ a month)</label>
          <input id="budget" name="budget" type="number" inputMode="numeric" min={1} max={1000} defaultValue={settings.monthlyBudgetPounds} className="field" />
        </div>
      </div>

      {state.error && <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{state.error}</p>}
      {state.ok && <p role="status" className="rounded-xl bg-success/10 px-3 py-2 text-sm font-semibold text-success">{state.ok}</p>}
      <SubmitButton pendingText="Saving…">Save settings</SubmitButton>
    </form>
  );
}
