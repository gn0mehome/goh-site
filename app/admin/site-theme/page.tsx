import { SiteThemeSettings } from "@/components/admin/SiteThemeSettings";

export default function SiteThemePage() {
  return (
    <div>
      <h1 className="font-display text-3xl text-gnome-green mb-1">Site Theme</h1>
      <p className="text-bark-brown-light mb-6">
        The colours everyone sees on the site. Pick a theme, or Auto to switch with the holidays. Every theme has a light and a dark version, and members choose
        light or dark with the moon button in the menu. Members can also pick their own theme on My Account; this is what everyone else gets.
      </p>
      <SiteThemeSettings />
    </div>
  );
}
