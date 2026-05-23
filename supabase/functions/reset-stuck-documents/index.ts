import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-internal-secret',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Accept either internal secret OR valid JWT for authenticated users
    const internalSecret = req.headers.get('x-internal-secret');
    const expectedSecret = Deno.env.get('INTERNAL_FUNCTION_SECRET');
    const authHeader = req.headers.get('Authorization');
    
    let isAuthorized = false;
    
    // Check internal secret first (for function-to-function calls)
    if (expectedSecret && internalSecret === expectedSecret) {
      isAuthorized = true;
      console.log('[RESET] Authorized via internal secret');
    }
    
    // If no secret, check for valid JWT (for client calls)
    if (!isAuthorized && authHeader) {
      const userClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        { global: { headers: { Authorization: authHeader } } }
      );
      const { data: { user }, error: authError } = await userClient.auth.getUser();
      if (user && !authError) {
        isAuthorized = true;
        console.log(`[RESET] Authorized via JWT for user: ${user.id}`);
      }
    }
    
    if (!isAuthorized) {
      console.error('[RESET] Unauthorized: Invalid or missing credentials');
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use service role key for admin operations
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log('[RESET] Finding stuck documents...');

    // Find documents with text but in wrong status
    const { data: stuckDocs, error: findError } = await supabase
      .from('documents')
      .select('id, title, status')
      .or('status.eq.draft,status.eq.generating_embeddings,status.eq.processing')
      .not('content_text', 'is', null);

    if (findError) {
      console.error('[RESET] Error finding documents:', findError);
      throw new Error('Failed to find documents');
    }

    console.log(`[RESET] Found ${stuckDocs?.length || 0} documents to reset`);

    if (!stuckDocs || stuckDocs.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true,
          message: 'No stuck documents found',
          count: 0
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update all stuck documents to active status
    const { error: updateError } = await supabase
      .from('documents')
      .update({ status: 'active' })
      .in('id', stuckDocs.map(d => d.id));

    if (updateError) {
      console.error('[RESET] Error updating documents:', updateError);
      throw new Error('Failed to update documents');
    }

    console.log(`[RESET] Reset ${stuckDocs.length} documents to active status`);

    // Trigger embedding generation for each document
    const results = [];
    for (const doc of stuckDocs) {
      try {
        const { error: embedError } = await supabase.functions.invoke(
          'generate-embeddings',
          { body: { documentId: doc.id } }
        );

        if (embedError) {
          console.error(`[RESET] Failed to trigger embeddings for ${doc.title}:`, embedError);
          results.push({ id: doc.id, title: doc.title, success: false, error: embedError.message });
        } else {
          console.log(`[RESET] Triggered embeddings for ${doc.title}`);
          results.push({ id: doc.id, title: doc.title, success: true });
        }
      } catch (err) {
        console.error(`[RESET] Error triggering embeddings for ${doc.title}:`, err);
        results.push({ id: doc.id, title: doc.title, success: false, error: String(err) });
      }
    }

    const successCount = results.filter(r => r.success).length;

    return new Response(
      JSON.stringify({ 
        success: true,
        message: `Reset ${stuckDocs.length} documents, triggered embeddings for ${successCount}`,
        count: stuckDocs.length,
        triggered: successCount,
        results
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[RESET] Error:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        success: false 
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
