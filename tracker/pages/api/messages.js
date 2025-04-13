import fetch from 'node-fetch';

// Simple sleep function to add a delay
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export default async function handler(req, res) {
  const { page = 1, limit = 100 } = req.query;

  try {
    const token = process.env.DISCORD_BOT_TOKEN;
    console.log('DISCORD_BOT_TOKEN loaded:', token ? 'Token present' : 'Token missing');
    if (!token) {
      throw new Error('DISCORD_BOT_TOKEN is not defined in environment variables.');
    }

    // Replace with your Discord server (guild) ID
    const guildId = '1014882925893926912'; // Replace with the actual guild ID
    console.log('Using guildId:', guildId);

    // Fetch the bot's guilds to confirm it's in the correct server
    const guildsUrl = 'https://discord.com/api/v10/users/@me/guilds';
    const guildsResponse = await fetch(guildsUrl, {
      headers: {
        Authorization: `Bot ${token}`,
      },
    });
    if (!guildsResponse.ok) {
      const error = await guildsResponse.json();
      throw new Error(`Failed to fetch bot guilds: ${error.message}`);
    }
    const guilds = await guildsResponse.json();
    console.log('Bot is in the following guilds:', guilds.map(g => ({ id: g.id, name: g.name })));

    // Verify the bot is in the specified guild
    const guild = guilds.find(g => g.id === guildId);
    if (!guild) {
      throw new Error(`Bot is not in the guild with ID ${guildId}`);
    }

    // Fetch all channels in the guild
    const channelsUrl = `https://discord.com/api/v10/guilds/${guildId}/channels`;
    const channelsResponse = await fetch(channelsUrl, {
      headers: {
        Authorization: `Bot ${token}`,
      },
    });
    if (!channelsResponse.ok) {
      const error = await channelsResponse.json();
      throw new Error(`Failed to fetch channels: ${error.message}`);
    }
    const channels = await channelsResponse.json();
    console.log('Fetched channels:', channels.map(c => ({ id: c.id, name: c.name, type: c.type })));

    // Filter for text channels (type 0 is a text channel)
    const textChannels = channels.filter(channel => channel.type === 0);
    console.log('Text channels:', textChannels.map(c => ({ id: c.id, name: c.name })));

    // Cap the limit at 100 (Discord API maximum)
    const cappedLimit = Math.min(parseInt(limit), 100);
    console.log('Requested limit:', limit, 'Capped limit:', cappedLimit);

    // Fetch messages from each text channel
    const allMessages = [];
    for (const channel of textChannels) {
      console.log(`Attempting to fetch messages from channel: ${channel.name} (ID: ${channel.id})`);
      const url = `https://discord.com/api/v10/channels/${channel.id}/messages?limit=${cappedLimit}`;
      console.log('Fetching messages from Discord API with URL:', url);

      const response = await fetch(url, {
        headers: {
          Authorization: `Bot ${token}`,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        console.log(`Error fetching messages from channel ${channel.name} (ID: ${channel.id}):`, error);
        continue; // Skip this channel if there's an error (e.g., missing permissions)
      }

      const messages = await response.json();
      console.log(`Fetched ${messages.length} messages from channel ${channel.name}`);

      // Add channel information to each message
      const messagesWithChannel = messages.map(msg => ({
        ...msg,
        channel_id: channel.id,
        channel_name: channel.name,
      }));

      allMessages.push(...messagesWithChannel);

      // Add a delay of 100ms to avoid hitting rate limits
      await sleep(100);
    }

    console.log('Total messages fetched from all channels:', allMessages.length);
    res.status(200).json(allMessages);
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ error: error.message });
  }
}