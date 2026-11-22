import { Block, CardBlock, SpinnerRow } from "@/components/Loading";

/** Shown straight away while any page in the app is fetching its data (Home, Settings, Billing...) */
export default function Loading() {
  return (
    <div className="space-y-4">
      <Block className="h-8 w-40" />
      <SpinnerRow />
      <CardBlock />
      <CardBlock />
      <CardBlock />
    </div>
  );
}
