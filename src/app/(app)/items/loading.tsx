import { Block, ItemCardSkeleton, SpinnerRow } from "@/components/Loading";

export default function Loading() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold tracking-tight">Items</h1>
      <Block className="h-12 w-full" />
      <div className="flex flex-wrap gap-2" aria-hidden>
        <Block className="h-9 w-14 !rounded-full" />
        <Block className="h-9 w-20 !rounded-full" />
        <Block className="h-9 w-16 !rounded-full" />
        <Block className="h-9 w-16 !rounded-full" />
      </div>
      <SpinnerRow />
      <ul className="space-y-3">
        {[0, 1, 2, 3, 4].map((i) => <li key={i}><ItemCardSkeleton /></li>)}
      </ul>
    </div>
  );
}
