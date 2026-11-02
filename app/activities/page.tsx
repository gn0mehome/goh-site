import { redirect } from "next/navigation";

// Activities was renamed Contests; WOM competitions have their own page.
export default function ActivitiesPage() {
  redirect("/contests");
}
