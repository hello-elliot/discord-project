/* eslint-disable react/no-unescaped-entities */
import { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import {
  Line,
  LineChart,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';
import { DatePicker } from '@/components/ui/date-picker';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { startOfDay, endOfDay, addDays, eachDayOfInterval, format, parseISO, differenceInDays, differenceInHours } from "date-fns";
import { SentimentIntensityAnalyzer } from 'vader-sentiment';
import { useSession, signIn, signOut } from 'next-auth/react';

// Test sentiment library directly
const testSentiment = () => {
  const testMessages = [
    "Wow this is great, I really wanted to have something like this",
    "amazing",
    "This is awesome!!!"
  ];
  testMessages.forEach(msg => {
    const result = SentimentIntensityAnalyzer.polarity_scores(msg);
    console.log('Test Sentiment:', msg, result);
  });
};
testSentiment();

export default function Home() {
  const { data: session } = useSession();
  const [messages, setMessages] = useState([]);
  const [filteredMessages, setFilteredMessages] = useState([]);
  const [members, setMembers] = useState([]);
  const [voiceData, setVoiceData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('Loading...');
  const [hasFetched, setHasFetched] = useState(false);
  const [startDate, setStartDate] = useState(addDays(new Date(), -7));
  const [endDate, setEndDate] = useState(endOfDay(new Date()));
  const [selectedChannel, setSelectedChannel] = useState('all');
  const [error, setError] = useState(null);
  const [allContributors, setAllContributors] = useState({});
  const [page, setPage] = useState(1);
  const limit = 100;

  // State for the modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState(null);
  const [roleUsers, setRoleUsers] = useState([]);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setLoadingMessage('Fetching messages from Discord channels...');
      const messagesRes = await fetch(`/api/messages?page=${page}&limit=${limit}`);
      if (!messagesRes.ok) {
        const text = await messagesRes.text();
        throw new Error(`Failed to fetch messages: ${messagesRes.status} - ${text}`);
      }
      const messagesData = await messagesRes.json();
      console.log('Raw fetched messages:', messagesData);
      console.log('Fetched messages (first 2):', messagesData.slice(0, 2));
      console.log('Message user_ids:', messagesData.map(msg => msg.user_id));
      setMessages(messagesData);
      setFilteredMessages(messagesData);

      setLoadingMessage('Fetching members from Supabase...');
      const membersRes = await fetch(`/api/supabase?table=members&page=${page}&limit=${limit}`);
      if (!membersRes.ok) {
        const text = await membersRes.text();
        throw new Error(`Failed to fetch members: ${membersRes.status} - ${text}`);
      }
      const membersData = await membersRes.json();
      console.log('Fetched members:', membersData);
      console.log('Member user_ids:', membersData.map(member => member.user_id));
      setMembers(membersData);

      setLoadingMessage('Fetching voice activity from Supabase...');
      const voiceRes = await fetch(`/api/supabase?table=voice_activity&page=${page}&limit=${limit}`);
      if (!voiceRes.ok) {
        const text = await voiceRes.text();
        throw new Error(`Failed to fetch voice activity: ${voiceRes.status} - ${text}`);
      }
      const voiceData = await voiceRes.json();
      console.log('Fetched voice data:', voiceData);
      setVoiceData(voiceData);

      setLoadingMessage('Building contributors list...');
      const contributors = {};
      for (const msg of messagesData) {
        if (msg.user_id && !contributors[msg.user_id]) {
          const username = msg.author?.username || (msg.author?.global_name || `User_${msg.user_id}`);
          contributors[msg.user_id] = { username };
        }
      }
      console.log('Contributors:', contributors);
      setAllContributors(contributors);

      setHasFetched(true);
    } catch (err) {
      console.error('Error fetching data:', err);
      setError(`Failed to load data: ${err.message}`);
    } finally {
      setLoading(false);
      setLoadingMessage('Loading...');
      console.log('Fetch data completed. Loading:', loading);
    }
  }, [page, limit]); // Dependencies for useCallback

  // Fetch data on initial mount only if not already fetched
  useEffect(() => {
    if (session && !hasFetched) {
      fetchData();
    }
  }, [session, hasFetched, fetchData]); // Added fetchData and hasFetched to dependencies

  useEffect(() => {
    console.log('Filtering messages...');
    let filtered = messages;

    console.log('Selected Channel:', selectedChannel);
    if (selectedChannel !== 'all') {
      filtered = filtered.filter(msg => {
        console.log(`Filtering message: channel_name=${msg.channel_name}, selectedChannel=${selectedChannel}, match=${msg.channel_name === selectedChannel}`);
        return msg.channel_name === selectedChannel;
      });
    }

    console.log("Filtered Messages:", filtered);
    setFilteredMessages(filtered);
  }, [selectedChannel, messages]);

  useEffect(() => {
    console.log('Session status:', session);
    if (!session) return;

    console.log('No Supabase subscriptions since operations are server-side.');
  }, [session, allContributors]);

  if (!session) {
    return (
      <div className="p-4">
        <h1 className="text-2xl font-bold mb-4">Discord Community Tracker</h1>
        <Button onClick={() => signIn('discord')}>Sign in with Discord</Button>
      </div>
    );
  }

  const activeMembers = new Set(
    filteredMessages
      .filter(msg => {
        const sevenDaysAgo = endDate ? addDays(endDate, -7).getTime() : addDays(new Date(), -7).getTime();
        return new Date(msg.timestamp).getTime() >= sevenDaysAgo;
      })
      .map(msg => msg.user_id)
  ).size;

  const activeMembersInRange = new Set(filteredMessages.map(msg => msg.user_id)).size;
  const totalMembers = new Set(members.map(m => m.user_id)).size;
  const totalMessages = filteredMessages.length;
  const engagementRate = totalMembers > 0 ? (activeMembersInRange / totalMembers) * 100 : 0;
  console.log('Engagement Rate Debug:', { totalMembers, activeMembersInRange, engagementRate });

  // Sentiment Analysis
  const analyzeSentiment = () => {
    console.log('Analyzing sentiment for filtered messages...');
    const sentimentScores = filteredMessages.map(msg => {
      const content = typeof msg.content === 'string' && msg.content.trim() !== '' ? msg.content : '';
      if (content) {
        try {
          const result = SentimentIntensityAnalyzer.polarity_scores(content);
          console.log('Sentiment for:', content, result);
          return { score: result.compound, comparative: result.compound };
        } catch (err) {
          console.error(`Sentiment analysis failed for content: ${content}`, err);
          return { score: 0, comparative: 0 };
        }
      }
      return { score: 0, comparative: 0 };
    });
    const averageScore = sentimentScores.reduce((sum, s) => sum + (s.score || 0), 0) / (sentimentScores.length || 1);
    const sentimentStatus = averageScore > 0.05 ? 'Positive' : averageScore < -0.05 ? 'Negative' : 'Neutral';
    console.log('Sentiment Analysis Result:', { averageScore, sentimentStatus });
    return { averageScore, sentimentStatus };
  };

  const { averageScore, sentimentStatus } = analyzeSentiment();

  // Member Growth and Retention Metrics
  const calculateGrowthMetrics = () => {
    console.log('Calculating growth metrics...');
    const dailyJoins = {};
    const dailyLeaves = {};
    const dateRange = eachDayOfInterval({ start: startDate, end: endDate });

    members.forEach(member => {
      const joinDate = member.joined_at ? format(new Date(member.joined_at), 'yyyy-MM-dd') : null;
      const leaveDate = member.left_at ? format(new Date(member.left_at), 'yyyy-MM-dd') : null;

      if (joinDate && dateRange.some(d => format(d, 'yyyy-MM-dd') === joinDate)) {
        dailyJoins[joinDate] = (dailyJoins[joinDate] || 0) + 1;
      }
      if (leaveDate && dateRange.some(d => format(d, 'yyyy-MM-dd') === leaveDate)) {
        dailyLeaves[leaveDate] = (dailyLeaves[leaveDate] || 0) + 1;
      }
    });
    console.log('Daily Joins:', dailyJoins);
    console.log('Daily Leaves:', dailyLeaves);

    const totalNewMembers = Object.values(dailyJoins).reduce((sum, count) => sum + count, 0);
    const totalChurnedMembers = Object.values(dailyLeaves).reduce((sum, count) => sum + count, 0);
    const netGrowth = totalNewMembers - totalChurnedMembers;

    const thirtyDaysAgo = addDays(endDate, -30).getTime();
    const sevenDaysAgo = addDays(endDate, -7).getTime();
    const recentJoins = members.filter(m => {
      const joinTime = m.joined_at ? new Date(m.joined_at).getTime() : 0;
      return joinTime >= thirtyDaysAgo && m.is_active;
    });
    const retainedUsers = recentJoins.filter(m => {
      const lastActive = m.last_active ? new Date(m.last_active).getTime() : 0;
      return lastActive >= sevenDaysAgo;
    }).length;
    const retentionRate = recentJoins.length > 0 ? (retainedUsers / recentJoins.length) * 100 : 0;

    const growthData = dateRange.map(date => {
      const dateStr = format(date, 'yyyy-MM-dd');
      return {
        date: dateStr,
        newMembers: dailyJoins[dateStr] || 0,
        churnedMembers: dailyLeaves[dateStr] || 0,
      };
    });

    console.log('Growth Data:', growthData);
    return { totalNewMembers, totalChurnedMembers, netGrowth, retentionRate, growthData };
  };

  const { totalNewMembers, totalChurnedMembers, netGrowth, retentionRate, growthData } = calculateGrowthMetrics();

  // New Messages Metric (within the selected date range)
  const calculateNewMessages = () => {
    console.log('Calculating new messages...');
    const sevenDaysAgo = addDays(endDate, -7).getTime();
    const newMessages = filteredMessages.filter(msg => new Date(msg.timestamp).getTime() >= sevenDaysAgo).length;
    const previousMessages = messages.filter(msg => {
      const msgTime = new Date(msg.timestamp).getTime();
      return msgTime < sevenDaysAgo && msgTime >= addDays(sevenDaysAgo, -7).getTime();
    }).length;
    const growth = previousMessages > 0 ? ((newMessages - previousMessages) / previousMessages) * 100 : 0;
    console.log('New Messages Calculation:', { newMessages, previousMessages, growth });
    return { newMessages, growth };
  };

  const { newMessages, growth: messagesGrowth } = calculateNewMessages();

  // User Roles (Orbit Model)
  const calculateUserRoles = () => {
    const sevenDaysAgo = addDays(new Date(), -7).getTime();
    const fourteenDaysAgo = addDays(new Date(), -14).getTime();
    const thirtyDaysAgo = addDays(new Date(), -30).getTime();

    // Debug logs to check data sources
    console.log('Members:', members);
    console.log('Filtered Messages:', filteredMessages);

    // Create a Map to count messages per user efficiently
    const messageCounts = new Map();
    for (const msg of filteredMessages) {
      const userId = String(msg.user_id).trim();
      messageCounts.set(userId, (messageCounts.get(userId) || 0) + 1);
    }

    // Calculate user activity metrics
    const userActivity = members.map(member => {
      const memberUserId = String(member.user_id).trim();
      const userMessages = messageCounts.get(memberUserId) || 0;
      console.log(`Messages for user ${member.user_id} (${member.username}):`, userMessages);
      const lastActive = member.last_active ? new Date(member.last_active).getTime() : 0;

      // Debug log for each member
      console.log(`User ${member.user_id} (${member.username}):`, {
        userMessages,
        lastActive: lastActive ? new Date(lastActive) : 'N/A',
        memberUserId,
      });

      // Classify user into an orbit
      let orbit = 'Visitor';
      if (userMessages > 50 && lastActive >= sevenDaysAgo) {
        orbit = 'Ambassador';
      } else if (userMessages >= 10 && lastActive >= fourteenDaysAgo) {
        orbit = 'Contributor';
      } else if (userMessages >= 1 && lastActive >= thirtyDaysAgo) {
        orbit = 'Member';
      }

      return {
        user_id: member.user_id,
        username: member.username,
        messages: userMessages,
        lastActive,
        orbit,
      };
    });

    // Aggregate trends
    const orbitTrends = {
      Ambassador: userActivity.filter(u => u.orbit === 'Ambassador').length,
      Contributor: userActivity.filter(u => u.orbit === 'Contributor').length,
      Member: userActivity.filter(u => u.orbit === 'Member').length,
      Visitor: userActivity.filter(u => u.orbit === 'Visitor').length,
    };

    // Get top ambassadors
    const ambassadors = userActivity
      .filter(u => u.orbit === 'Ambassador')
      .sort((a, b) => b.messages - a.messages)
      .slice(0, 5);

    console.log('User Activity:', userActivity);
    console.log('Orbit Trends:', orbitTrends);
    console.log('Top Ambassadors:', ambassadors);

    return { userActivity, orbitTrends, ambassadors };
  };

  const { userActivity, orbitTrends, ambassadors } = calculateUserRoles();

  // Function to open the modal with users for a specific role
  const openRoleModal = (role, e) => {
    e.preventDefault();
    console.log('Opening modal for role:', role);
    const usersInRole = userActivity
      .filter(user => user.orbit === role)
      .sort((a, b) => b.lastActive - a.lastActive);
    setRoleUsers(usersInRole);
    setSelectedRole(role);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedRole(null);
    setRoleUsers([]);
  };

  const channels = ['all', ...new Set(messages.map(msg => msg.channel_name || 'unknown'))];

  const prepareChartData = () => {
    console.log('Preparing chart data...');
    const dateRange = startDate && endDate ? eachDayOfInterval({ start: startDate, end: endDate }) : [];
    console.log('Date Range:', dateRange.map(d => format(d, 'yyyy-MM-dd')));
    
    const messagesByDateAndChannel = filteredMessages.reduce((acc, msg) => {
      const date = parseISO(msg.timestamp);
      const dateKey = format(date, 'yyyy-MM-dd');
      const channel = msg.channel_name || 'unknown';
      if (!acc[dateKey]) acc[dateKey] = {};
      acc[dateKey][channel] = (acc[dateKey][channel] || 0) + 1;
      return acc;
    }, {});
    console.log('Messages by Date and Channel:', messagesByDateAndChannel);

    const allChannels = [...new Set(filteredMessages.map(msg => msg.channel_name || 'unknown'))];
    console.log('All Channels:', allChannels);

    const chartData = [];
    dateRange.forEach((date, index) => {
      const dateKey = format(date, 'yyyy-MM-dd');
      const entry = { date: dateKey };
      allChannels.forEach(channel => {
        const dailyCount = messagesByDateAndChannel[dateKey]?.[channel] || 0;
        const previousEntries = chartData.slice(0, index);
        const previousCount = previousEntries.reduce((sum, prev) => sum + (prev[channel] || 0), 0);
        entry[channel] = dailyCount + previousCount;
      });
      chartData.push(entry);
    });

    console.log('Chart Data:', chartData);
    return { chartData };
  };

  const { chartData } = prepareChartData();

  const chartConfig = {
    welcome: { label: 'Welcome', color: '#4B5EAA' },
    general: { label: 'General', color: '#6B7280' },
    unknown: { label: 'Unknown', color: '#9CA3AF' },
    newMembers: { label: 'New Members', color: '#FF6347' },
    churnedMembers: { label: 'Churned Members', color: '#4682B4' },
  };

  const createInitialAvatar = (username) => {
    const initial = username?.[0]?.toUpperCase() || 'U';
    return (
      <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-sm text-gray-600 mr-2">
        {initial}
      </div>
    );
  };

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Discord Community Tracker</h1>
      <Button onClick={() => signOut()} className="mb-4">Sign Out</Button>

      {/* Filters */}
      <div className="mb-4 flex items-end space-x-4">
        <div className="w-[280px]">
          <Label htmlFor="start-date" className="block mb-1">Start Date</Label>
          <DatePicker
            id="start-date"
            value={startDate}
            onChange={setStartDate}
            className="w-full h-10"
          />
        </div>
        <div className="w-[280px]">
          <Label htmlFor="end-date" className="block mb-1">End Date</Label>
          <DatePicker
            id="end-date"
            value={endDate}
            onChange={setEndDate}
            className="w-full h-10"
          />
        </div>
        <div className="w-[180px]">
          <Label htmlFor="channel" className="block mb-1">Channel</Label>
          <Select value={selectedChannel} onValueChange={setSelectedChannel}>
            <SelectTrigger id="channel" className="w-full h-10">
              <SelectValue placeholder="Select channel" />
            </SelectTrigger>
            <SelectContent>
              {channels.map(channel => (
                <SelectItem key={channel} value={channel}>
                  {channel === 'all' ? 'All Channels' : channel}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          variant="outline"
          className="h-10 w-[120px]"
          onClick={() => {
            const end = endOfDay(new Date());
            const start = addDays(end, -7);
            setStartDate(start);
            setEndDate(end);
            fetchData();
          }}
        >
          Last 7 Days
        </Button>
        <Button
          variant="outline"
          className="h-10 w-[120px]"
          onClick={fetchData}
          disabled={loading}
        >
          {loading ? 'Loading...' : 'Fetch Data'}
        </Button>
      </div>

      {/* Metrics */}
      {loading ? (
        <p className="text-center text-gray-500">{loadingMessage}</p>
      ) : error ? (
        <p className="text-red-500">{error}</p>
      ) : messages.length === 0 && members.length === 0 ? (
        <p className="text-center text-gray-500">No data available. Click "Fetch Data" to load data.</p>
      ) : (
        <>
          {/* Row 1: Membership Overview */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <Card className="hover:bg-zinc-100 transition-colors">
              <CardHeader>
                <CardTitle>Total Members</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{totalMembers || '0'}</p>
              </CardContent>
            </Card>
            <Card className="hover:bg-zinc-100 transition-colors">
              <CardHeader>
                <CardTitle>New Members</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{totalNewMembers || '0'}</p>
              </CardContent>
            </Card>
            <Card className="hover:bg-zinc-100 transition-colors">
              <CardHeader>
                <CardTitle>Active Members</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{activeMembers || '0'}</p>
              </CardContent>
            </Card>
          </div>

          {/* Row 2: Growth and Retention */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <Card className="hover:bg-zinc-100 transition-colors">
              <CardHeader>
                <CardTitle>Net Growth</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{netGrowth || '0'}</p>
              </CardContent>
            </Card>
            <Card className="hover:bg-zinc-100 transition-colors">
              <CardHeader>
                <CardTitle>Retention Rate</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{retentionRate.toFixed(2) || '0'}%</p>
              </CardContent>
            </Card>
            <Card className="hover:bg-zinc-100 transition-colors">
              <CardHeader>
                <CardTitle>Churned Members</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{totalChurnedMembers || '0'}</p>
              </CardContent>
            </Card>
          </div>

          {/* Row 3: Engagement and Sentiment */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <Card className="hover:bg-zinc-100 transition-colors">
              <CardHeader>
                <CardTitle>Total Messages</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{totalMessages || '0'}</p>
              </CardContent>
            </Card>
            <Card className="hover:bg-zinc-100 transition-colors">
              <CardHeader>
                <CardTitle>New Messages (Last 7 Days)</CardTitle>
                <p className="text-sm text-muted-foreground">Growth: {messagesGrowth.toFixed(2)}%</p>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{newMessages || '0'}</p>
              </CardContent>
            </Card>
            <Card className="hover:bg-zinc-100 transition-colors">
              <CardHeader>
                <CardTitle>Engagement Rate</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{engagementRate.toFixed(2) || '0'}%</p>
              </CardContent>
            </Card>
            <Card className="hover:bg-zinc-100 transition-colors">
              <CardHeader>
                <CardTitle>Sentiment Analysis</CardTitle>
                <p className="text-sm text-muted-foreground">Based on messages in selected date range and channel</p>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{sentimentStatus}</p>
                <p className="text-sm text-muted-foreground">Score: {averageScore.toFixed(2)}</p>
              </CardContent>
            </Card>
          </div>

          {/* Community Engagement */}
          <div className="relative">
            <Card className="mb-4">
              <CardHeader>
                <CardTitle>Community Engagement</CardTitle>
                <p className="text-sm text-muted-foreground">Engagement levels across all users based on messages and recency</p>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                  <div className="cursor-pointer" onClick={(e) => openRoleModal('Ambassador', e)}>
                    <p className="text-lg font-bold">Ambassadors</p>
                    <p className="text-2xl">{orbitTrends.Ambassador || '0'}</p>
                  </div>
                  <div className="cursor-pointer" onClick={(e) => openRoleModal('Contributor', e)}>
                    <p className="text-lg font-bold">Contributors</p>
                    <p className="text-2xl">{orbitTrends.Contributor || '0'}</p>
                  </div>
                  <div className="cursor-pointer" onClick={(e) => openRoleModal('Member', e)}>
                    <p className="text-lg font-bold">Members</p>
                    <p className="text-2xl">{orbitTrends.Member || '0'}</p>
                  </div>
                  <div className="cursor-pointer" onClick={(e) => openRoleModal('Visitor', e)}>
                    <p className="text-lg font-bold">Visitors</p>
                    <p className="text-2xl">{orbitTrends.Visitor || '0'}</p>
                  </div>
                </div>
                <h3 className="text-lg font-bold mt-4">Top Ambassadors</h3>
                {ambassadors.length > 0 ? (
                  <ul className="space-y-2 mt-2">
                    {ambassadors.map((ambassador, index) => (
                      <li key={index} className="flex items-center">
                        {createInitialAvatar(ambassador.username)}
                        <span>
                          {ambassador.username} ({ambassador.messages} messages)
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>No ambassadors yet.</p>
                )}
              </CardContent>
            </Card>

            {/* Custom Modal */}
            {isModalOpen && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
                <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-lg max-h-[85vh] overflow-y-auto">
                  <button className="absolute top-4 right-4 text-gray-500 hover:text-gray-700" onClick={closeModal}>
                    <span className="text-2xl">×</span>
                  </button>
                  <h2 className="text-xl font-bold mb-2">{selectedRole ? `${selectedRole} users` : 'Users'}</h2>
                  <p className="text-sm text-gray-500 mb-4">
                    List of users classified as {selectedRole ? selectedRole.toLowerCase() : ''} based on their activity.
                  </p>
                  <div>
                    {roleUsers.length > 0 ? (
                      <ul className="space-y-2">
                        {roleUsers.map((user, index) => (
                          <li key={index} className="flex items-center">
                            {createInitialAvatar(user.username)}
                            <span>
                              {user.username} (last active: {format(new Date(user.lastActive), 'MMM d, yyyy')})
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p>No users in this role.</p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Channel Activity Chart */}
          <Card className="mb-4">
            <CardHeader>
              <CardTitle>Channel Activity</CardTitle>
              <p className="text-sm text-muted-foreground">Your message activity.</p>
            </CardHeader>
            <CardContent>
              <ChartContainer
                config={chartConfig}
                className="h-[300px] w-full"
              >
                <LineChart data={chartData}>
                  <CartesianGrid vertical={false} strokeDasharray="5 5" stroke="rgba(0, 0, 0, 0.1)" />
                  <XAxis
                    dataKey="date"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={10}
                    tickFormatter={(value) => format(parseISO(value), 'MMM d')}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tickMargin={10}
                    tickCount={5}
                    domain={[0, 'auto']}
                    label={{ value: 'Messages', angle: -90, position: 'insideLeft' }}
                  />
                  <ChartTooltip
                    content={<ChartTooltipContent />}
                    labelFormatter={(label) => {
                      const date = parseISO(label);
                      const euDate = format(date, 'dd/MM/yyyy');
                      console.log(`Tooltip Label Formatter: ${label} -> ${euDate}`);
                      return euDate;
                    }}
                  />
                  {channels
                    .filter(channel => channel !== 'all')
                    .map((channel) => (
                      <Line
                        key={channel}
                        dataKey={channel}
                        type="monotone"
                        stroke={chartConfig[channel]?.color || '#8884d8'}
                        strokeWidth={2}
                        dot={{ stroke: chartConfig[channel]?.color || '#8884d8', strokeWidth: 2, r: 4 }}
                        activeDot={{ r: 6 }}
                      />
                    ))}
                </LineChart>
              </ChartContainer>
            </CardContent>
          </Card>

          {/* Member Growth Chart */}
          <Card className="mb-4">
            <CardHeader>
              <CardTitle>Member Growth</CardTitle>
              <p className="text-sm text-muted-foreground">New and churned members over time.</p>
            </CardHeader>
            <CardContent>
              <ChartContainer
                config={chartConfig}
                className="h-[300px] w-full"
              >
                <LineChart data={growthData}>
                  <CartesianGrid vertical={false} strokeDasharray="5 5" stroke="rgba(0, 0, 0, 0.1)" />
                  <XAxis
                    dataKey="date"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={10}
                    tickFormatter={(value) => format(parseISO(value), 'MMM d')}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tickMargin={10}
                    tickCount={5}
                    domain={[0, 'auto']}
                    label={{ value: 'Count', angle: -90, position: 'insideLeft' }}
                  />
                  <ChartTooltip
                    content={<ChartTooltipContent />}
                    labelFormatter={(label) => {
                      const date = parseISO(label);
                      const euDate = format(date, 'dd/MM/yyyy');
                      console.log(`Tooltip Label Formatter: ${label} -> ${euDate}`);
                      return euDate;
                    }}
                  />
                  <Line
                    dataKey="newMembers"
                    type="monotone"
                    stroke={chartConfig.newMembers.color}
                    strokeWidth={2}
                    dot={{ stroke: chartConfig.newMembers.color, strokeWidth: 2, r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                  <Line
                    dataKey="churnedMembers"
                    type="monotone"
                    stroke={chartConfig.churnedMembers.color}
                    strokeWidth={2}
                    dot={{ stroke: chartConfig.churnedMembers.color, strokeWidth: 2, r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ChartContainer>
            </CardContent>
          </Card>

          {/* Voice Activity Card */}
          <Card className="mb-4">
            <CardHeader>
              <CardTitle>Voice Activity (Last 5 Entries)</CardTitle>
            </CardHeader>
            <CardContent>
              {voiceData.length > 0 ? (
                <ul className="space-y-2">
                  {voiceData.slice(0, 5).map((v) => (
                    <li key={v.id}>
                      {v.user_id} in {v.channel_name}: {v.joined_at} - {v.left_at || 'Still Active'}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No voice activity yet.</p>
              )}
            </CardContent>
          </Card>

          {/* Pagination Buttons */}
          <div className="flex space-x-4 mb-4">
            <Button onClick={() => setPage(page - 1)} disabled={page === 1}>Previous Page</Button>
            <Button onClick={() => setPage(page + 1)}>Next Page</Button>
          </div>

          <Button className="mt-4" onClick={fetchData} disabled={loading}>
            {loading ? 'Loading...' : 'Refresh Data'}
          </Button>
        </>
      )}
    </div>
  );
}

const createInitialAvatar = (username) => {
  const initial = username?.[0]?.toUpperCase() || 'U';
  return (
    <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-sm text-gray-600 mr-2">
      {initial}
    </div>
  );
};