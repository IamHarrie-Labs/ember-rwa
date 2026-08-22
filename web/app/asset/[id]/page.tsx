import { AssetView } from "@/components/AssetView";

export default function AssetPage({ params }: { params: { id: string } }) {
  return <AssetView id={params.id} />;
}
