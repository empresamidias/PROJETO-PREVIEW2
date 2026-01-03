
import { createClient } from '@supabase/supabase-js';
import { PromptEntry } from '../types';

const SUPABASE_URL = 'https://wnwlmtnfvasxtcycydxm.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indud2xtdG5mdmFzeHRjeWN5ZHhtIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzE1MjY5MywiZXhwIjoyMDgyNzI4NjkzfQ.2umg5CRFpA4hDCQVZWVE0tVCghu7uapqhDU-ZiNS9QE';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export const sendPrompt = async (message: string, sessionId: string): Promise<{ success: boolean; error?: string }> => {
  try {
    const { error } = await supabase
      .from('prompts')
      .insert([
        { session_id: sessionId, mensagem: message }
      ]);

    if (error) throw error;
    return { success: true };
  } catch (err: any) {
    console.error('Supabase error:', err);
    return { success: false, error: err.message };
  }
};
