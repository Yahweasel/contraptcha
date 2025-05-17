/*
 * Copyright (c) 2025 Yahweasel
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED “AS IS” AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY
 * SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER
 * RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF
 * CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN
 * CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 */

import * as discord from "discord.js";
import * as sqlite3 from "promised-sqlite3";
import * as fs from "fs/promises";

// Load configuration
const configJson = await fs.readFile("./config.json", "utf8");
const config = JSON.parse(configJson);
const { token, masterUserId, scoreChannelId, scoreboardChannelId, clientId, guildId } = config;

// Initialize Discord client
const client = new discord.Client({
    intents: [
        discord.GatewayIntentBits.Guilds,
        discord.GatewayIntentBits.GuildMessages,
        discord.GatewayIntentBits.MessageContent
    ],
    partials: [discord.Partials.Message, discord.Partials.Channel, discord.Partials.Reaction]
});

// Initialize database
const db = await sqlite3.AsyncDatabase.open("./scores.db");

// Create tables
await db.exec(`
  CREATE TABLE IF NOT EXISTS entries (
    user_id TEXT PRIMARY KEY,
    score INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS scoreboard (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    message_id TEXT,
    channel_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Ensure one active scoreboard
const countRow = await db.get("SELECT COUNT(*) AS count FROM scoreboard");
if (countRow.count === 0) {
    await db.run("INSERT INTO scoreboard (name, channel_id) VALUES (?, ?)", [
        "Default",
        scoreboardChannelId
    ]);
}

// Helper: get current scoreboard record
async function getCurrentScoreboard() {
    return db.get(
        "SELECT * FROM scoreboard ORDER BY created_at DESC LIMIT 1"
    );
}

// Helper: update the scoreboard message
async function updateScoreboard() {
    const sb = await getCurrentScoreboard();
    if (!sb?.message_id) return;
    const rows = await db.all(
        "SELECT user_id, score FROM entries ORDER BY score DESC"
    );
    const lines = [`# ${sb.name}`, ""];
    for (const { user_id, score } of rows) {
        lines.push(`<@${user_id}> ${score}`);
    }
    const channel = await client.channels.fetch(sb.channel_id);
    if (!channel?.isTextBased()) return;
    const message = await channel.messages.fetch(sb.message_id);
    await message.edit(lines.join("\n"));
}

// Register slash commands
const { SlashCommandBuilder } = discord;
const commands = [
    new SlashCommandBuilder()
        .setName("restart")
        .setDescription("Restart the scoreboard")
        .addStringOption(opt =>
            opt.setName("name").setDescription("Name for new scoreboard").setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName("add")
        .setDescription("Add to a user score")
        .addUserOption(opt =>
            opt.setName("user").setDescription("User to add").setRequired(true)
        )
        .addIntegerOption(opt =>
            opt.setName("amount").setDescription("Amount to add").setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName("set")
        .setDescription("Set a user score")
        .addUserOption(opt =>
            opt.setName("user").setDescription("User to set").setRequired(true)
        )
        .addIntegerOption(opt =>
            opt.setName("amount").setDescription("New score").setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName("remove")
        .setDescription("Remove a user from scoreboard")
        .addUserOption(opt =>
            opt.setName("user").setDescription("User to remove").setRequired(true)
        )
].map(cmd => cmd.toJSON());

const rest = new discord.REST({ version: "10" }).setToken(token);
await rest.put(
    discord.Routes.applicationGuildCommands(clientId, guildId),
    { body: commands }
);
console.log("Slash commands registered.");

// On ready
client.once("ready", () => {
    console.log(`Logged in as ${client.user.tag}`);
});

// Handle slash interactions
client.on("interactionCreate", async interaction => {
    if (!interaction.isCommand() || interaction.user.id !== masterUserId)
        return;
    const name = interaction.commandName;
    const opts = interaction.options;

    if (name === "restart") {
        const sbName = opts.getString("name", true);
        await db.run("DELETE FROM entries");
        const insert = await db.run(
            "INSERT INTO scoreboard (name, channel_id) VALUES (?, ?)",
            [sbName, scoreboardChannelId]
        );
        const channel = await client.channels.fetch(scoreboardChannelId);
        if (channel?.isTextBased()) {
            const msg = await channel.send(`# ${sbName}`);
            await db.run("UPDATE scoreboard SET message_id = ? WHERE id = ?", [
                msg.id,
                insert.lastID
            ]);
        }
        await interaction.reply({
            content: `Scoreboard restarted as **${sbName}**`,
            flags: discord.MessageFlags.Ephemeral
        });

    } else if (["add", "set", "remove"].includes(name)) {
        const user = opts.getUser("user", true);
        const amount =
            name === "remove" ? undefined : Math.max(0, opts.getInteger("amount", true));

        if (name === "add") {
            await db.run(
                "INSERT INTO entries (user_id, score) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET score = score + ?",
                [user.id, amount, amount]
            );
            await interaction.reply({
                content: `Added ${amount} to ${user}`,
                flags: discord.MessageFlags.Ephemeral
            });

        } else if (name === "set") {
            await db.run(
                "INSERT INTO entries (user_id, score) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET score = ?",
                [user.id, amount, amount]
            );
            await interaction.reply({
                content: `Set ${user}"s score to ${amount}`,
                flags: discord.MessageFlags.Ephemeral
            });

        } else {
            await db.run("DELETE FROM entries WHERE user_id = ?", [user.id]);
            await interaction.reply({
                content: `Removed ${user} from scoreboard`,
                flags: discord.MessageFlags.Ephemeral
            });
        }
        await updateScoreboard();
    }
});

// Message handler for posted scores
client.on("messageCreate", async message => {
    if (message.author.bot) return;
    if (
        message.channel.id === scoreChannelId &&
        message.content.startsWith("Contraptcha seed")
    ) {
        const match = message.content.match(/Score:\s*(-?\d+)/);
        if (!match) return;
        const value = Math.max(0, parseInt(match[1], 10));
        await db.run(
            "INSERT INTO entries (user_id, score) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET score = score + ?",
            [message.author.id, value, value]
        );
        await message.react("✅");
        await updateScoreboard();
    }
});

// Start bot
await client.login(token);
