// tracker/pages/api/supabase.js

import { createClient } from '@supabase/supabase-js';
import { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req, res) {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
  );

  try {
    const { table, page = 1, limit = 1000 } = req.query;

    const { data, error } = await supabase
      .from(table)
      .select('*')
      .range((page - 1) * limit, page * limit - 1);

    if (error) throw error;

    res.status(200).json(data);
  } catch (error) {
    console.error(`Error fetching from Supabase (${table}):`, error);
    res.status(500).json({ error: error.message });
  }
}