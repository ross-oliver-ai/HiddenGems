"use client";

import { useActionState } from "react";
import { createItemAction, updateItemAction, type ItemState } from "@/app/(app)/items/actions";
import { SubmitButton } from "./SubmitButton";
import { PhotoPicker } from "./PhotoPicker";
import { ShopPicker } from "./ShopPicker";
import { CONDITIONS } from "@/lib/items";

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
  listedAt?: string | null;
  listPrice?: string | null;
  vintedUrl?: string | null;
  soldAt?: string | null;
  soldPrice?: string | null;
  postalServiceId?: number | null;
  postedAt?: string | null;
};

type Opt = { id: number; name: string };

export function ItemForm({
  mode,
  values,
  shops,
  categories,
  postalServices = [],
}: {
  mode: "create" | "edit";
  values: ItemFormValues;
  shops: string[];
  categories: Opt[];
  postalServices?: Opt[];
}) {
  const [state, action] = useActionState<ItemState, FormData>(mode === "create" ? createItemAction : updateItemAction, {});
  const edit = mode === "edit";
  return (
    <form action={action} className="space-y-4">
      {edit && <input type="hidden" name="id" value={values.id} />}
      <PhotoPicker initialUrl={values.photoUrl} />

      <div>
        <label className="label" htmlFor="name">What is it?</label>
        <input id="name" name="name" required maxLength={120} defaultValue={values.name} placeholder="e.g. Barbour wax jacket" className="field" autoComplete="off" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="buyPrice">Paid (£)</label>
          <input id="buyPrice" name="buyPrice" required inputMode="decimal" defaultValue={values.buyPrice} placeholder="0.00" className="field" />
        </div>
        <div>
          <label className="label" htmlFor="boughtAt">Date bought</label>
          <input id="boughtAt" name="boughtAt" type="date" required defaultValue={values.boughtAt} className="field" />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="shop">Charity shop</label>
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

      {edit && values.listedAt && (
        <fieldset className="space-y-3 rounded-2xl bg-surface-2 p-3">
          <legend className="px-1 text-sm font-extrabold">Listing</legend>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="listedAt">Date listed</label>
              <input id="listedAt" name="listedAt" type="date" required defaultValue={values.listedAt} className="field" />
            </div>
            <div>
              <label className="label" htmlFor="listPrice">Asking (£)</label>
              <input id="listPrice" name="listPrice" required inputMode="decimal" defaultValue={values.listPrice ?? ""} className="field" />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="vintedUrl">Listing link</label>
            <input id="vintedUrl" name="vintedUrl" type="url" inputMode="url" defaultValue={values.vintedUrl ?? ""} placeholder="https://…" className="field" />
          </div>
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
          <div>
            <label className="label" htmlFor="postalServiceId">Postage</label>
            <select id="postalServiceId" name="postalServiceId" defaultValue={values.postalServiceId ?? ""} className="field">
              <option value="">Not set</option>
              {postalServices.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          {values.postedAt !== undefined && (
            <div>
              <label className="label" htmlFor="postedAt">Date posted</label>
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
