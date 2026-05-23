import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Deprecated: scanned PDFs are OCR'd directly in extract-document-text via Chandra.
 * This shim remains for backward compatibility with any stale callers.
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
  const { conversionId } = await req.json();

  return new Response(
    JSON.stringify({
      success: true,
      conversionId,
      converted: false,
      useMarkdown: true,
      message: 'Searchable PDF conversion is deprecated. Use Chandra OCR markdown path in extract-document-text instead.',
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
