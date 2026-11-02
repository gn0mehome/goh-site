import { redirect } from "next/navigation";

// Quest events are listed with everything else on the Contests page.
export default function QuestsIndexPage() {
  redirect("/contests");
}
