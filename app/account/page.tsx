import { requireAuth } from "@/lib/auth";
import { AccountForm } from "@/components/account/AccountForm";
import { AccountOutfitSection } from "@/components/profiles/AccountOutfitSection";
import { AccountThemeSection } from "@/components/account/AccountThemeSection";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "My Account",
  description: "Link your OSRS RSN to your Discord account.",
};

export default async function AccountPage() {
  const { user } = await requireAuth("/account");

  // If Supabase not configured, show setup message
  if (!user) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center">
        <h1 className="font-display text-4xl text-gnome-green mb-4">My Account</h1>
        <p className="text-bark-brown-light">
          Account management requires Supabase to be configured. Add your
          Supabase credentials to <code className="font-mono text-gnome-green">.env.local</code> to enable Discord login.
        </p>
      </div>
    );
  }

  return (
    <>
      <AccountForm userId={user.id} userMeta={user.user_metadata} />
      <AccountOutfitSection />
      <AccountThemeSection />
    </>
  );
}
