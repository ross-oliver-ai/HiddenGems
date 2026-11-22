import Link from "next/link";
import { Block, CardBlock, SpinnerRow } from "@/components/Loading";

export default function Loading() {
  return (
    <div className="space-y-4">
      <Link href="/items" className="text-sm font-bold text-primary">← Items</Link>
      <Block className="aspect-square w-full" />
      <SpinnerRow />
      <CardBlock className="h-32" />
      <CardBlock className="h-40" />
    </div>
  );
}
