import { useEffect, useState } from 'react';
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
import { startOfDay, endOfDay, addDays, eachDayOfInterval, format, parseISO, differenceInDays } from "date-fns";
import { createClient } from '@supabase/supabase-js';
import sentiment from 'sentiment';

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_KEY
);

// Test sentiment library directly
const testSentiment = () => {
  const testMessages = [
    "Wow this is great, I really wanted to have something like this",
    "amazing",
    "This is awesome!!!"
  ];
  testMessages.forEach(msg => {
    const result = sentiment(msg);
    console.log('Test Sentiment:', msg, result);
  });
};
testSentiment();

export default function Home() {
  const [messages, setMessages] = useState([]);
  const [filteredMessages, setFilteredMessages] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState(addDays(new Date(), -7)); // Start 7 days ago
  const [endDate, setEndDate] = useState(endOfDay(new Date())); // End today, including current time
  const [selectedChannel, setSelectedChannel] = useState('all');
  const [error, setError] = useState(null);
  const [allContributors, setAllContributors] = useState({});

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const messagesRes = await fetch('/api/messages');
      if (!messagesRes.ok) {
        const text = await messagesRes.text();
        throw new Error(`Failed to fetch messages: ${messagesRes.status} - ${text}`);
      }
      const messagesData = await messagesRes.json();
      console.log('Fetched messages:', messagesData.slice(0, 2));
      setMessages(messagesData);
      setFilteredMessages(messagesData);

      const { data: membersData, error: membersError } = await supabase
        .from('members')
        .select('*');
      if (membersError) {
        console.error('Error fetching members:', membersError);
        throw membersError;
      }
      console.log('Fetched members:', membersData);
      setMembers(membersData);

      const contributors = {};
      for (const msg of messagesData) {
        if (msg.user_id && !contributors[msg.user_id]) {
          contributors[msg.user_id] = {
            username: msg.username || msg.user_id,
          };
        }
      }
      setAllContributors(contributors);
    } catch (err) {
      console.error('Error fetching data:', err);
      setError(`Failed to load data: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    // Subscription for messages
    const messagesSubscription = supabase
      .channel('public:messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        setMessages((prev) => [...prev, payload.new]);
        if (payload.new.user_id && !allContributors[payload.new.user_id]) {
          setAllContributors((prev) => ({
            ...prev,
            [payload.new.user_id]: {
              username: payload.new.username || payload.new.user_id,
            }
          }));
        }
      })
      .subscribe();

    // Subscription for members
    const membersSubscription = supabase
      .channel('public:members')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'members' }, (payload) => {
        setMembers((prev) => {
          const updatedMembers = prev.filter(m => m.user_id !== payload.new.user_id);
          return [...updatedMembers, payload.new];
        });
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'members' }, (payload) => {
        setMembers((prev) => {
          const updatedMembers = prev.filter(m => m.user_id !== payload.new.user_id);
          return [...updatedMembers, payload.new];
        });
      })
      .subscribe();

    return () => {
      messagesSubscription.unsubscribe();
      membersSubscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let filtered = messages;

    if (startDate && endDate) {
      const maxDays = 180;
      const daysBetween = differenceInDays(endDate, startDate);
      if (daysBetween > maxDays) {
        setEndDate(addDays(startDate, maxDays));
      }
      const start = startOfDay(startDate).getTime();
      const end = endOfDay(endDate).getTime();
      console.log('Date Range for Messages:', { start: new Date(start), end: new Date(end) });
      filtered = messages.filter(msg => {
        const msgTimestamp = Number(msg.timestamp); // Discord timestamp in milliseconds
        console.log('Message:', msg.content, 'Timestamp:', msgTimestamp, 'In Range:', msgTimestamp >= start && msgTimestamp <= end);
        return msgTimestamp >= start && msgTimestamp <= end;
      });
    }
    if (selectedChannel !== 'all') {
      filtered = filtered.filter(msg => msg.channel_name === selectedChannel);
    }

    console.log("Filtered Messages:", filtered);
    setFilteredMessages(filtered);
  }, [startDate, endDate, selectedChannel, messages]);

  const activeMembers = new Set(
    filteredMessages
      .filter(msg => {
        const sevenDaysAgo = endDate ? addDays(endDate, -7).getTime() : addDays(new Date(), -7).getTime();
        return Number(msg.timestamp) >= sevenDaysAgo;
      })
      .map(msg => msg.user_id)
  ).size;

  const activeMembersInRange = new Set(filteredMessages.map(msg => msg.user_id)).size;

  const totalMembers = new Set(members.map(m => m.user_id)).size; // Changed to count all members

  const totalMessages = filteredMessages.length;
  const topContributors = Object.entries(
    filteredMessages.reduce((acc, msg) => {
      acc[msg.user_id] = (acc[msg.user_id] || 0) + 1;
      return acc;
    }, {})
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([user_id, count]) => ({
      user_id,
      username: allContributors[user_id]?.username || user_id,
      count
    }));
  const engagementRate = totalMembers > 0 ? (activeMembersInRange / totalMembers) * 100 : 0;
  console.log('Engagement Rate Debug:', { totalMembers, activeMembersInRange, engagementRate });

  // Sentiment Analysis
  const analyzeSentiment = () => {
    const sentimentScores = filteredMessages.map(msg => {
      const content = typeof msg.content === 'string' && msg.content.trim() !== '' ? msg.content : '';
      if (content) {
        try {
          const result = sentiment(content);
          console.log('Sentiment for:', content, result);
          if (result && typeof result.score === 'number' && typeof result.comparative === 'number') {
            return { score: result.score, comparative: result.comparative };
          } else {
            console.warn(`Invalid sentiment result for content: ${content}`, result);
            return { score: 0, comparative: 0 };
          }
        } catch (err) {
          console.error(`Sentiment analysis failed for content: ${content}`, err);
          return { score: 0, comparative: 0 };
        }
      }
      return { score: 0, comparative: 0 };
    });
    const averageScore = sentimentScores.reduce((sum, s) => sum + (s.score || 0), 0) / (sentimentScores.length || 1);
    const sentimentStatus = averageScore > 0 ? 'Positive' : averageScore < 0 ? 'Negative' : 'Neutral';
    return { averageScore, sentimentStatus };
  };

  const { averageScore, sentimentStatus } = analyzeSentiment();

  // Member Growth and Retention Metrics
  const calculateGrowthMetrics = () => {
    const dailyJoins = {};
    const dailyLeaves = {};
    const dateRange = eachDayOfInterval({ start: startDate, end: endDate });

    // Calculate daily joins and leaves
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

    // Total new members and churned members in the date range
    const totalNewMembers = Object.values(dailyJoins).reduce((sum, count) => sum + count, 0);
    const totalChurnedMembers = Object.values(dailyLeaves).reduce((sum, count) => sum + count, 0);
    const netGrowth = totalNewMembers - totalChurnedMembers;

    // Retention Rate: Users who joined in the last 30 days and are still active
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

    // Growth Data for Chart
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

  const channels = ['all', ...new Set(messages.map(msg => msg.channel_name || 'unknown'))];

  const prepareChartData = () => {
    const dateRange = startDate && endDate ? eachDayOfInterval({ start: startDate, end: endDate }) : [];
    console.log('Date Range:', dateRange.map(d => format(d, 'yyyy-MM-dd')));
    
    const messagesByDateAndChannel = filteredMessages.reduce((acc, msg) => {
      const date = new Date(Number(msg.timestamp));
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
          }}
        >
          Last 7 Days
        </Button>
      </div>

      {/* Metrics */}
      {loading ? (
        <p>Loading...</p>
      ) : error ? (
        <p className="text-red-500">{error}</p>
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

          {/* Top Contributors */}
          <Card className="mb-4">
            <CardHeader>
              <CardTitle>Top Contributors</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p>Loading...</p>
              ) : topContributors.length > 0 ? (
                <ul className="space-y-2">
                  {topContributors.map((contributor, index) => (
                    <li key={index} className="flex items-center">
                      {createInitialAvatar(contributor.username)}
                      <span>
                        {contributor.username || contributor.user_id} ({contributor.count} messages)
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No contributors yet.</p>
              )}
            </CardContent>
          </Card>

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
                    labelFormatter={(label) => format(parseISO(label), 'dd/MM/yyyy')}
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

          {/* User Activity Trends Table */}
          <Card className="mb-4">
            <CardHeader>
              <CardTitle>User Activity Trends</CardTitle>
            </CardHeader>
            <CardContent>
              <table className="w-full mt-2 border-collapse">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border p-2 text-left">Username</th>
                    <th className="border p-2 text-left">Messages Sent</th>
                    <th className="border p-2 text-left">Most Active Channel</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(
                    filteredMessages.reduce((acc, msg) => {
                      acc[msg.user_id] = acc[msg.user_id] || { count: 0, channel: '' };
                      acc[msg.user_id].count += 1;
                      const userMessages = filteredMessages.filter(m => m.user_id === msg.user_id);
                      const channelCounts = userMessages.reduce((counts, m) => {
                        counts[m.channel_name] = (counts[m.channel_name] || 0) + 1;
                        return counts;
                      }, {});
                      const mostActiveChannel = Object.keys(channelCounts).reduce((a, b) =>
                        channelCounts[a] > channelCounts[b] ? a : b, 'unknown'
                      );
                      acc[msg.user_id].channel = mostActiveChannel;
                      return acc;
                    }, {})
                  )
                    .sort((a, b) => b[1].count - a[1].count)
                    .slice(0, 5)
                    .map(([user_id, { count, channel }], index) => (
                      <tr key={index} className="border">
                        <td className="p-2">{allContributors[user_id]?.username || user_id}</td>
                        <td className="p-2">{count}</td>
                        <td className="p-2">{channel}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}
      <Button className="mt-4" onClick={fetchData} disabled={loading}>
        {loading ? 'Loading...' : 'Refresh Data'}
      </Button>
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