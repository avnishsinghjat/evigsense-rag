import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MICRO_BATCH_SIZE = 5; // Ultra-small batches
const BATCH_DELAY = 50; // Minimal delay

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { documentId } = await req.json();

    if (!documentId) {
      throw new Error('Document ID is required');
    }

    // Use service role for all operations
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log(`[CLEANUP] Starting aggressive cleanup for document: ${documentId}`);

    // Start background cleanup
    const cleanupPromise = (async () => {
      let totalDeleted = 0;
      let iterations = 0;
      const maxIterations = 1000; // Safety limit

      while (iterations < maxIterations) {
        iterations++;
        
        // Delete micro-batch
        const { data: deleted, error } = await supabase
          .from('document_embeddings')
          .delete()
          .eq('document_id', documentId)
          .limit(MICRO_BATCH_SIZE)
          .select('id');

        if (error) {
          console.error(`[CLEANUP] Error in iteration ${iterations}:`, error);
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue;
        }

        const deletedCount = deleted?.length || 0;
        totalDeleted += deletedCount;

        if (deletedCount === 0) {
          console.log(`[CLEANUP] All embeddings deleted. Total: ${totalDeleted}`);
          break;
        }

        if (iterations % 20 === 0) {
          console.log(`[CLEANUP] Progress: ${totalDeleted} embeddings deleted...`);
        }

        await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
      }

      // Delete chunks
      await supabase
        .from('document_chunks')
        .delete()
        .eq('document_id', documentId);

      // Get storage path
      const { data: doc } = await supabase
        .from('documents')
        .select('storage_path')
        .eq('id', documentId)
        .maybeSingle();

      // Delete storage file
      if (doc?.storage_path) {
        await supabase.storage
          .from('documents')
          .remove([doc.storage_path]);
      }

      // Delete document
      await supabase
        .from('documents')
        .delete()
        .eq('id', documentId);

      console.log(`[CLEANUP] Document ${documentId} fully cleaned up`);
    })();

    // Return immediately
    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'Cleanup started in background',
        documentId
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    );
  } catch (error) {
    console.error('[CLEANUP] Error:', error);
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
