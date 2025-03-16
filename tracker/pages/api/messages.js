import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client with environment variables
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_KEY
);

export default async function handler(req, res) {
  try {
    const { data, error } = await supabase.from('messages').select('*');
    if (error) throw error;
    res.status(200).json(data);
  } catch (error) {
    console.error('Supabase error:', error);
    res.status(500).json({ error: 'Failed to fetch messages from Supabase' });
  }
}