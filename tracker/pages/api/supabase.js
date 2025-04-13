import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  const { table, page = 1, limit = 100 } = req.query;

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
  );

  try {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .range((page - 1) * limit, page * limit - 1);

    if (error) {
      console.error(`Supabase error: ${error.message}`);
      return res.status(500).json({ error: error.message });
    }

    res.status(200).json(data);
  } catch (err) {
    console.error('Error fetching data from Supabase:', err);
    res.status(500).json({ error: err.message });
  }
}