import { Client, GatewayIntentBits, Collection, Events, ChannelType } from "discord.js";
import { config } from "dotenv";
import { fileURLToPath } from "url";
import type { AutocompleteInteraction, ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";

// Load .env from project root
config({ path: fileURLToPath(new URL("../../.env.local", import.meta.url)) });

// Types
export interface BotCommand {
  data: SlashCommandBuilder;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
  autocomplete?: (interaction: AutocompleteInteraction) => Promise<void>;
}

// Extend client with commands collection
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

const commands = new Collection<string, BotCommand>();

// Load commands
async function loadCommands() {
  const commandFiles = [
    await import("./commands/link.js"),
    await import("./commands/stats.js"),
    await import("./commands/levels.js"),
    await import("./commands/kc.js"),
    await import("./commands/gains.js"),
    await import("./commands/check.js"),
    await import("./commands/lfg.js"),
    await import("./commands/signup.js"),
    await import("./commands/banner.js"),
    await import("./commands/attendance.js"),
    await import("./commands/command.js"),
    await import("./commands/vc.js"),
    await import("./commands/room.js"),
    await import("./commands/bingo.js"),
  ];

  for (const file of commandFiles) {
    const cmd = file.default as BotCommand;
    commands.set(cmd.data.name, cmd);
    console.log(`  Loaded /${cmd.data.name}`);
  }

  // Load custom commands from website API
  const { fetchCustomCommands, buildCustomCommand } = await import("./lib/custom-commands.js");
  const customCmds = await fetchCustomCommands();
  for (const record of customCmds) {
    const cmd = buildCustomCommand(record);
    commands.set(record.name, cmd);
    console.log(`  Loaded custom /${record.name}`);
  }
}

// Handle interactions
client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isAutocomplete()) {
    await commands.get(interaction.commandName)?.autocomplete?.(interaction).catch((err) => console.error(`Autocomplete for /${interaction.commandName} failed:`, err));
    return;
  }
  if (!interaction.isChatInputCommand()) return;

  const command = commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(`Error executing /${interaction.commandName}:`, error);
    const reply = {
      content: "Something went wrong running that command.",
      ephemeral: true,
    };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(reply);
    } else {
      await interaction.reply(reply);
    }
  }
});

// Temp rooms: when someone leaves one, it may need deleting straight away.
client.on(Events.VoiceStateUpdate, async (oldState) => {
  const left = oldState.channel;
  if (!left || left.type !== ChannelType.GuildVoice || oldState.channelId === oldState.member?.voice.channelId) return;
  const { onVoiceLeave } = await import("./lib/temp-rooms.js");
  await onVoiceLeave(left).catch((err) => console.error("Temp room check failed:", err));
});

// Ready
client.once(Events.ClientReady, async (c) => {
  console.log(`\n🏰 Gn0me Home Bot online as ${c.user.tag}`);
  console.log(`   Serving ${c.guilds.cache.size} guild(s)`);
  console.log(`   ${commands.size} commands loaded\n`);

  // Keep Discord's slash command list in step with this build, so a deploy
  // needs no separate "npm run register".
  const guildId = process.env.DISCORD_GUILD_ID;
  if (guildId) {
    try {
      await c.application.commands.set(commands.map((cmd) => cmd.data.toJSON()), guildId);
      console.log(`   Registered ${commands.size} slash commands`);
    } catch (err) {
      console.error("Slash command registration failed:", err);
    }
  }

  // Remove empty /vc rooms now and every 30 minutes.
  const { startRoomCleanup } = await import("./lib/temp-rooms.js");
  startRoomCleanup(c);

  // Read drops and quest completions from the clan feed channels.
  const { startClanFeed } = await import("./lib/clan-feed.js");
  startClanFeed(c);

  // Drops from the DropTracker API for live bingos, every 5 minutes.
  const { syncDroptracker } = await import("./lib/api.js");
  setInterval(syncDroptracker, 5 * 60 * 1000);

  // Keep live bingo boards' tracked tiles fresh (the site skips boards it updated recently).
  // Same for quest events' WikiSync checks, and closed weekly SOTW/BotW polls.
  const { syncBingo, syncQuests, syncWeeklyPoll } = await import("./lib/api.js");
  syncBingo();
  syncQuests();
  syncWeeklyPoll();
  setInterval(() => {
    syncBingo();
    syncQuests();
    syncWeeklyPoll();
  }, 30 * 60 * 1000);
});

// Start
async function main() {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    console.error("DISCORD_BOT_TOKEN is not set (.env.local locally, or the host's environment variables)");
    process.exit(1);
  }

  console.log("🌳 Loading commands...");
  await loadCommands();

  console.log("🔌 Connecting to Discord...");
  await client.login(token);
}

main().catch(console.error);
