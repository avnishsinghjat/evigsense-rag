import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface LogEntry {
  level: 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  source: string;
  message: string;
  context?: Record<string, any>;
  userId?: string;
  sessionId?: string;
  url?: string;
  userAgent?: string;
  ipAddress?: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { logs } = await req.json();

    if (!Array.isArray(logs) || logs.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Invalid request: logs array required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate and prepare logs
    const validLevels = ['debug', 'info', 'warn', 'error', 'fatal'];
    const preparedLogs = logs.map((log: LogEntry) => {
      if (!validLevels.includes(log.level)) {
        throw new Error(`Invalid log level: ${log.level}`);
      }

      return {
        level: log.level,
        source: log.source || 'unknown',
        message: log.message,
        context: log.context || null,
        user_id: log.userId || null,
        session_id: log.sessionId || null,
        url: log.url || null,
        user_agent: log.userAgent || null,
        ip_address: log.ipAddress || null,
      };
    });

    // Insert logs in batch
    const { error: insertError } = await supabase
      .from('application_logs')
      .insert(preparedLogs);

    if (insertError) {
      console.error('Error inserting logs:', insertError);
      return new Response(
        JSON.stringify({ error: 'Failed to insert logs', details: insertError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Successfully ingested ${logs.length} log entries`);

    return new Response(
      JSON.stringify({ success: true, count: logs.length }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in ingest-logs function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
