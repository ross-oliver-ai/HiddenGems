import { Block, CardBlock, SpinnerRow } from "@/components/Loading";

export default function Loading() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold tracking-tight">Reports</h1>
      <Block className="h-11 w-full" />
      <SpinnerRow />
      <div className="grid grid-cols-2 gap-3">
        <CardBlock className="h-24" />
        <CardBlock className="h-24" />
        <CardBlock className="h-24" />
        <CardBlock className="h-24" />
      </div>
      <CardBlock className="h-56" />
    </div>
  );
}
