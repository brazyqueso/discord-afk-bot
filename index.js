const { Client, GatewayIntentBits } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

const AFK_CHANNEL_NAME = 'AFK GOONING';
const AFK_MS = 2 * 60 * 60 * 1000; // 2 hours (change to 10 * 1000 for testing)

// userId → { timeout, channelId }
const timers = new Map();

function clearTimer(userId) {
  const data = timers.get(userId);
  if (data) {
    clearTimeout(data.timeout);
    timers.delete(userId);
  }
}

function startTimer(member) {
  clearTimer(member.id);

  const timeout = setTimeout(async () => {
    try {
      const afkChannel = member.guild.channels.cache.find(
        (c) => c.name === AFK_CHANNEL_NAME && c.isVoiceBased()
      );

      if (!afkChannel) {
        console.log(`Channel "${AFK_CHANNEL_NAME}" not found`);
        return;
      }

      // Still in voice and still muted/deafened?
      if (
        member.voice.channelId &&
        (member.voice.selfMute || member.voice.selfDeaf) &&
        member.voice.channelId !== afkChannel.id
      ) {
        await member.voice.setChannel(afkChannel);
        console.log(`Moved ${member.user.tag} to ${AFK_CHANNEL_NAME}`);
      }
    } catch (err) {
      console.error('Failed to move member:', err.message);
    } finally {
      timers.delete(member.id);
    }
  }, AFK_MS);

  timers.set(member.id, {
    timeout,
    channelId: member.voice.channelId,
  });
}

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);

  // Re-scan people already in voice on startup
  for (const guild of client.guilds.cache.values()) {
    for (const [userId, voiceState] of guild.voiceStates.cache) {
      if (voiceState.selfMute || voiceState.selfDeaf) {
        const member = voiceState.member;
        if (member && !member.user.bot) {
          startTimer(member);
        }
      }
    }
  }
});

client.on('voiceStateUpdate', (oldState, newState) => {
  const member = newState.member || oldState.member;
  if (!member || member.user.bot) return;

  const isMutedOrDeaf = newState.selfMute || newState.selfDeaf;
  const wasMutedOrDeaf = oldState.selfMute || oldState.selfDeaf;
  const leftVoice = !newState.channelId;
  const joinedVoice = !oldState.channelId && newState.channelId;
  const switchedChannel = oldState.channelId !== newState.channelId;

  // Left voice → clear timer
  if (leftVoice) {
    clearTimer(member.id);
    return;
  }

  // Unmuted/undeafened → clear timer
  if (wasMutedOrDeaf && !isMutedOrDeaf) {
    clearTimer(member.id);
    return;
  }

  // Just became muted/deafened, or switched channels while muted
  if (isMutedOrDeaf && (joinedVoice || switchedChannel || !wasMutedOrDeaf)) {
    startTimer(member);
  }
});

client.login(process.env.DISCORD_TOKEN);