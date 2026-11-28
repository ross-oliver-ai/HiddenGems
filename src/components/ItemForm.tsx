"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createItemAction, updateItemAction, type ItemState } from "@/app/(app)/items/actions";
import { SubmitButton } from "./SubmitButton";
import { PhotoPicker } from "./PhotoPicker";
import { TagPhotoPicker } from "./TagPhotoPicker";
import { AiSuggestStatus, useAiSuggest } from "./AiSuggest";
import type { Suggestion } from "@/lib/ai-rules";
import { ShopPicker } from "./ShopPicker";
import { CONDITIONS } from "@/lib/items";
import { HANDOVERS, HANDOVER_LABEL } from "@/lib/listing-labels";
import type { Handover } from "@/db/schema";

export type ItemFormValues = {
  id?: number;
  name?: string;
  buyPrice?: string;
  boughtAt: string;
  shop?: string;
  categoryId?: number | null;
  brand?: string | null;
  size?: string | null;
  condition?: string | null;
  notes?: string | null;
  photoUrl?: string | null;
  // stage-specific (edit only)
  listings?: { id: number; platform: string; price: string; url: string | null; listedAt: string; ended: boolean }[];
  soldAt?: string | null;
  soldPrice?: string | null;
  fees?: string | null;
  postagePaid?: string | null;
  soldPlatformId?: number | null;
  handover?: Handover | null;
  postalServiceId?: number | null;
  postedAt?: string | null;
};

type Opt = { id: number; name: string };

/** The one-tap prices under "Paid (£)" on a new item */
const QUICK_PRICES = [1, 2, 3, 5, 8, 10];

export function ItemForm({
  mode,
  values,
  shops,
  categories,
  postalServices = [],
  platforms = [],
  aiOffered = false,
}: {
  mode: "create" | "edit";
  values: ItemFormValues;
  shops: string[];
  categories: Opt[];
  postalServices?: Opt[];
  platforms?: Opt[];
  /** The AI reads the photos by itself on new items (the admin has switched it on). */
  aiOffered?: boolean;
}) {
  const [state, action] = useActionState<ItemState, FormData>(mode === "create" ? createItemAction : updateItemAction, {});
  const edit = mode === "edit";
  const formRef = useRef<HTMLFormElement>(null);
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null);
  const [tagBlob, setTagBlob] = useState<Blob | null>(null);
  const [handover, setHandover] = useState<Handover | "">(values.handover ?? "");
  const [buyPrice, setBuyPrice] = useState(values.buyPrice ?? "");
  const tagInput = useRef<HTMLInputElement>(null);
  const ai = !edit && aiOffered;
  // What the AI last put in each box, so a later run (once the tag photo is added) can improve it unless the person has changed it
  const aiPut = useRef<Record<string, string>>({});

  /** Puts the AI's suggestions into boxes that are empty, or that still hold what the AI itself put there. Returns what it filled. */
  function applySuggestion(s: Suggestion): string[] {
    const form = formRef.current;
    if (!form) return [];
    const filled: string[] = [];
    const put = (field: string, label: string, value: string | null) => {
      const el = form.elements.namedItem(field);
      if (!value || !(el instanceof HTMLInputElement || el instanceof HTMLSelectElement)) return;
      if (el.value && el.value !== aiPut.current[field]) return;
      if (el instanceof HTMLSelectElement && !Array.from(el.options).some((o) => o.value === value)) return;
      if (el.value === value) return;
      el.value = value;
      aiPut.current[field] = value;
      filled.push(label);
    };
    put("name", "name", s.name);
    put("brand", "brand", s.brand);
    put("size", "size", s.size);
    put("categoryId", "category", s.categoryId === null ? null : String(s.categoryId));
    put("condition", "condition", s.condition);
    return filled;
  }

  const { working, note, retry } = useAiSuggest({ enabled: ai, photo: photoBlob, tag: tagBlob, onApply: applySuggestion });

  // If Save is tapped while the AI is still reading, the server finishes the job afterwards. The tag photo travels with the form for that.
  useEffect(() => {
    const el = tagInput.current;
    if (!el) return;
    try {
      const dt = new DataTransfer();
      if (working && tagBlob) dt.items.add(new File([tagBlob], "tag.jpg", { type: "image/jpeg" }));
      el.files = dt.files;
    } catch {
      /* older browsers: the server just reads the item photo */
    }
  }, [working, tagBlob]);

  return (
    <form ref={formRef} action={action} className="space-y-4">
      {edit && <input type="hidden" name="id" value={values.id} />}
      {ai ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <PhotoPicker tile initialUrl={values.photoUrl} onPhoto={setPhotoBlob} />
            <TagPhotoPicker tag={tagBlob} onTag={setTagBlob} />
          </div>
          <input type="hidden" name="aiPending" value={working ? "1" : ""} />
          <input ref={tagInput} type="file" name="aiTag" className="hidden" tabIndex={-1} aria-hidden />
          <AiSuggestStatus working={working} note={note} hasPhoto={photoBlob !== null} retry={retry} />
        </>
      ) : (
        <PhotoPicker initialUrl={values.photoUrl} />
      )}

      <div>
        <label className="label" htmlFor="buyPrice">Paid (£)</label>
        <input id="buyPrice" name="buyPrice" required inputMode="decimal" value={buyPrice} onChange={(e) => setBuyPrice(e.target.value)} placeholder="0.00" className="field" />
        {!edit && (
          <div className="mt-2 flex flex-wrap gap-2" data-price-buttons>
            {QUICK_PRICES.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setBuyPrice(p.toFixed(2))}
                className={`rounded-full px-4 py-2 text-sm font-bold ${Number(buyPrice) === p && buyPrice !== "" ? "bg-primary text-primary-contrast" : "bg-surface-2 text-muted"}`}
              >
                £{p}
              </button>
            ))}
          </div>
        )}
      </div>

      <div data-tour={edit ? undefined : "add-item"}>
        <label className="label" htmlFor="name">What is it?</label>
        <input id="name" name="name" required={!ai} maxLength={120} defaultValue={values.name} placeholder={ai ? "Filled in from the photo, or type it" : "e.g. Barbour wax jacket"} className="field" autoComplete="off" />
      </div>

      <div>
        <label className="label" htmlFor="boughtAt">Date bought</label>
        <input id="boughtAt" name="boughtAt" type="date" required defaultValue={values.boughtAt} className="field" />
      </div>

      <div>
        <label className="label" htmlFor="shop">Where from</label>
        <ShopPicker shops={shops} defaultValue={values.shop} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="categoryId">Category</label>
          <select id="categoryId" name="categoryId" defaultValue={values.categoryId ?? ""} className="field">
            <option value="">None</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="condition">Condition</label>
          <select id="condition" name="condition" defaultValue={values.condition ?? ""} className="field">
            <option value="">Not set</option>
            {CONDITIONS.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="brand">Brand</label>
          <input id="brand" name="brand" maxLength={60} defaultValue={values.brand ?? ""} className="field" autoComplete="off" />
        </div>
        <div>
          <label className="label" htmlFor="size">Size</label>
          <input id="size" name="size" maxLength={30} defaultValue={values.size ?? ""} className="field" autoComplete="off" />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="notes">Notes</label>
        <textarea id="notes" name="notes" rows={2} maxLength={500} defaultValue={values.notes ?? ""} placeholder="Flaws, where it's stored, ideas…" className="field" />
      </div>

      {edit && values.listings && values.listings.length > 0 && (
        <fieldset className="space-y-3 rounded-2xl bg-surface-2 p-3">
          <legend className="px-1 text-sm font-extrabold">Listings</legend>
          {values.listings.map((l) => (
            <div key={l.id} className="space-y-2">
              <input type="hidden" name="listingIds" value={l.id} />
              <p className="text-sm font-bold">{l.platform}{l.ended ? " (ended)" : ""}</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label" htmlFor={`listing_${l.id}_date`}>Date listed</label>
                  <input id={`listing_${l.id}_date`} name={`listing_${l.id}_date`} type="date" required defaultValue={l.listedAt} className="field" />
                </div>
                <div>
                  <label className="label" htmlFor={`listing_${l.id}_price`}>Asking (£)</label>
                  <input id={`listing_${l.id}_price`} name={`listing_${l.id}_price`} required inputMode="decimal" defaultValue={l.price} className="field" />
                </div>
              </div>
              <div>
                <label className="label" htmlFor={`listing_${l.id}_url`}>Listing link</label>
                <input id={`listing_${l.id}_url`} name={`listing_${l.id}_url`} type="url" inputMode="url" defaultValue={l.url ?? ""} placeholder="https://…" className="field" />
              </div>
            </div>
          ))}
        </fieldset>
      )}

      {edit && values.soldAt && (
        <fieldset className="space-y-3 rounded-2xl bg-surface-2 p-3">
          <legend className="px-1 text-sm font-extrabold">Sale</legend>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="soldAt">Date sold</label>
              <input id="soldAt" name="soldAt" type="date" required defaultValue={values.soldAt} className="field" />
            </div>
            <div>
              <label className="label" htmlFor="soldPrice">Sold for (£)</label>
              <input id="soldPrice" name="soldPrice" required inputMode="decimal" defaultValue={values.soldPrice ?? ""} className="field" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="fees">Fees (£)</label>
              <input id="fees" name="fees" inputMode="decimal" defaultValue={Number(values.fees) > 0 ? values.fees ?? "" : ""} placeholder="0.00" className="field" />
            </div>
            <div>
              <label className="label" htmlFor="postagePaid">Postage I paid (£)</label>
              <input id="postagePaid" name="postagePaid" inputMode="decimal" defaultValue={Number(values.postagePaid) > 0 ? values.postagePaid ?? "" : ""} placeholder="0.00" className="field" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="soldPlatformId">Sold on</label>
              <select id="soldPlatformId" name="soldPlatformId" defaultValue={values.soldPlatformId ?? ""} className="field">
                <option value="">Not set</option>
                {platforms.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="handover">How it got there</label>
              <select id="handover" name="handover" value={handover} onChange={(e) => setHandover(e.target.value as Handover | "")} className="field">
                <option value="">Not set</option>
                {HANDOVERS.map((h) => <option key={h} value={h}>{HANDOVER_LABEL[h]}</option>)}
              </select>
            </div>
          </div>
          {(handover === "posted" || handover === "") && (
            <div>
              <label className="label" htmlFor="postalServiceId">Postage</label>
              <select id="postalServiceId" name="postalServiceId" defaultValue={values.postalServiceId ?? ""} className="field">
                <option value="">Not set</option>
                {postalServices.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          )}
          {values.postedAt !== undefined && (
            <div>
              <label className="label" htmlFor="postedAt">{handover === "posted" || handover === "" ? "Date posted" : "Date handed over"}</label>
              <input id="postedAt" name="postedAt" type="date" defaultValue={values.postedAt ?? ""} className="field" />
            </div>
          )}
        </fieldset>
      )}

      {state.error && <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{state.error}</p>}

      <div className="space-y-2">
        <SubmitButton pendingText="Saving…">{edit ? "Save changes" : "Save item"}</SubmitButton>
        {!edit && (
          <SubmitButton className="btn-soft w-full" pendingText="Saving…" name="again" value="1">
            Save and add another
          </SubmitButton>
        )}
      </div>
    </form>
  );
}
