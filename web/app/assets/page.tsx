import { redirect } from "next/navigation";

// Dashboard and Assets showed the same information two different ways. The dashboard
// table is now the one place for it, and each row links through to the asset detail
// page — this route stays only so old links don't break.
export default function AssetsPage() {
  redirect("/dashboard");
}
