import { BotPostEditor } from "@/components/admin/BotPostEditor";

export default function BotPostsPage() {
  return (
    <div>
      <h1 className="font-display text-3xl text-gnome-green mb-1">Bot Posts</h1>
      <p className="text-bark-brown-light mb-6">
        Everything the bot has posted to Discord from the site, newest first: announcements, events, competitions, the weekly posts and more. Fix a typo or update the text
        without deleting and reposting.
      </p>
      <BotPostEditor />
    </div>
  );
}
