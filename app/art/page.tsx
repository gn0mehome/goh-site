import { redirect } from "next/navigation";

// Art contests are listed with everything else on the Contests page.
export default function ArtIndexPage() {
  redirect("/contests");
}
