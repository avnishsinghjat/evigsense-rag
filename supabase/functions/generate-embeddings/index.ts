import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { embed as lmEmbed } from "../_shared/ai.ts";

// Declare EdgeRuntime global for background tasks
declare const EdgeRuntime: {
  waitUntil(promise: Promise<unknown>): void;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const requestSchema = z.object({
  documentId: z.string().uuid("Invalid document ID"),
  chunkId: z.string().uuid("Invalid chunk ID").optional(), // Optional: process only specific chunk
});

// Configuration constants for optimal performance
const CONFIG = {
  // Chunk size optimized for text-embedding-3-small (max 8191 tokens ≈ 32K chars)
  // 1500 chars provides good context while staying well within limits
  MAX_CHUNK_SIZE: 1500,
  // Overlap between chunks ensures context continuity at boundaries
  CHUNK_OVERLAP: 150,
  // Parallel API calls - balance between speed and rate limits
  PARALLEL_BATCH_SIZE: 15,
  // Database insert batch size
  DB_INSERT_BATCH: 100,
  // Chunk processing batch size for large documents
  CHUNK_BATCH_SIZE: 5,
  // Text pieces per chunk batch
  TEXT_BATCH_SIZE: 15,
};

// Split text into overlapping chunks for embedding with page tracking
function chunkText(
  text: string, 
  pageMap: Array<{ page: number, startIndex: number, endIndex: number }>,
  maxChunkSize: number = CONFIG.MAX_CHUNK_SIZE,
  overlap: number = CONFIG.CHUNK_OVERLAP
): Array<{ text: string, pageNumber: number }> {
  const chunks: Array<{ text: string, pageNumber: number }> = [];
  
  // Handle empty or very short text
  if (!text || text.trim().length === 0) {
    return chunks;
  }
  
  if (text.length <= maxChunkSize) {
    return [{ text: text.trim(), pageNumber: findPageNumber(0, pageMap) }];
  }
  
  // Split by paragraphs first for natural boundaries
  const paragraphs = text.split(/\n\n+/);
  let currentChunk = '';
  let chunkStartIndex = 0;
  let currentPosition = 0;
  
  for (const paragraph of paragraphs) {
    const trimmedParagraph = paragraph.trim();
    if (!trimmedParagraph) {
      currentPosition += paragraph.length + 2; // Account for \n\n
      continue;
    }
    
    // If paragraph alone exceeds max size, split by sentences
    if (trimmedParagraph.length > maxChunkSize) {
      // Save current chunk first
      if (currentChunk.length > 0) {
        chunks.push({ 
          text: currentChunk.trim(), 
          pageNumber: findPageNumber(chunkStartIndex, pageMap) 
        });
        currentChunk = '';
      }
      
      // Split long paragraph by sentences
      const sentences = trimmedParagraph.split(/(?<=[.!?])\s+/);
      let sentenceChunk = '';
      let sentenceStartIndex = currentPosition;
      
      for (const sentence of sentences) {
        if (sentenceChunk.length + sentence.length + 1 > maxChunkSize) {
          if (sentenceChunk.length > 0) {
            chunks.push({ 
              text: sentenceChunk.trim(), 
              pageNumber: findPageNumber(sentenceStartIndex, pageMap) 
            });
            // Add overlap from end of previous chunk
            const overlapText = sentenceChunk.slice(-overlap);
            sentenceChunk = overlapText + ' ' + sentence;
            sentenceStartIndex = currentPosition;
          } else {
            // Single sentence too long, force split
            chunks.push({ 
              text: sentence.substring(0, maxChunkSize).trim(), 
              pageNumber: findPageNumber(currentPosition, pageMap) 
            });
            sentenceChunk = sentence.substring(maxChunkSize - overlap);
            sentenceStartIndex = currentPosition + maxChunkSize - overlap;
          }
        } else {
          sentenceChunk += (sentenceChunk ? ' ' : '') + sentence;
        }
      }
      
      if (sentenceChunk.trim().length > 0) {
        currentChunk = sentenceChunk;
        chunkStartIndex = sentenceStartIndex;
      }
    } else if (currentChunk.length + trimmedParagraph.length + 2 > maxChunkSize) {
      // Current chunk would exceed max size, save it and start new
      chunks.push({ 
        text: currentChunk.trim(), 
        pageNumber: findPageNumber(chunkStartIndex, pageMap) 
      });
      
      // Add overlap from end of previous chunk
      const overlapText = currentChunk.slice(-overlap);
      currentChunk = overlapText + '\n\n' + trimmedParagraph;
      chunkStartIndex = currentPosition;
    } else {
      // Add paragraph to current chunk
      if (currentChunk.length === 0) {
        chunkStartIndex = currentPosition;
      }
      currentChunk += (currentChunk ? '\n\n' : '') + trimmedParagraph;
    }
    
    currentPosition += paragraph.length + 2;
  }
  
  // Add final chunk
  if (currentChunk.trim().length > 0) {
    chunks.push({ 
      text: currentChunk.trim(), 
      pageNumber: findPageNumber(chunkStartIndex, pageMap) 
    });
  }
  
  return chunks;
}

// Find which page a text index belongs to
function findPageNumber(
  index: number, 
  pageMap: Array<{ page: number, startIndex: number, endIndex: number }>
): number {
  for (const page of pageMap) {
    if (index >= page.startIndex && index < page.endIndex) {
      return page.page;
    }
  }
  // Default to page 1 if not found
  return 1;
}

// Generate embeddings using LM Studio with retry logic
async function generateEmbedding(text: string, retries = 3): Promise<number[]> {
  return lmEmbed(text, retries);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const validationResult = requestSchema.safeParse(body);
    
    if (!validationResult.success) {
      console.error('Validation error:', validationResult.error);
      return new Response(
        JSON.stringify({ error: 'Invalid input', details: validationResult.error.errors }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const { documentId, chunkId } = validationResult.data;
    
    // Use service role key for all operations (background processing)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const chunkInfo = chunkId ? ` (chunk: ${chunkId})` : '';
    console.log(`[EMBEDDINGS] Starting embedding generation for document: ${documentId}${chunkInfo}`);

    // Simple lock check - allow processing if document has content and is not currently being processed
    const { data: currentDoc, error: checkError } = await supabase
      .from('documents')
      .select('id, status, content_text')
      .eq('id', documentId)
      .maybeSingle();

    if (checkError) {
      console.error('[EMBEDDINGS] Error checking document status:', checkError);
      throw new Error('Failed to check document status');
    }

    if (!currentDoc) {
      console.error('[EMBEDDINGS] Document not found:', documentId);
      throw new Error('Document not found');
    }

    // Skip if no content
    if (!currentDoc.content_text || currentDoc.content_text.trim().length === 0) {
      console.log('[EMBEDDINGS] Document has no text content, skipping embeddings');
      await supabase
        .from('documents')
        .update({ status: 'active' })
        .eq('id', documentId);
      
      return new Response(
        JSON.stringify({ 
          success: true,
          message: 'No text content to generate embeddings',
          skipped: true
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    }

    // Update status to generating_embeddings (allow if status is active, draft, or processing)
    const { error: lockError } = await supabase
      .from('documents')
      .update({ status: 'generating_embeddings' })
      .eq('id', documentId)
      .in('status', ['active', 'draft', 'processing']);

    if (lockError) {
      console.error('[EMBEDDINGS] Error updating document status:', lockError);
      throw new Error('Failed to update document status');
    }

    console.log('[EMBEDDINGS] Starting embedding generation for document:', documentId);

    // If processing specific chunk, check if embeddings already exist for it
    if (chunkId) {
      const { data: chunkData } = await supabase
        .from('document_chunks')
        .select('start_page, end_page')
        .eq('id', chunkId)
        .eq('document_id', documentId)
        .maybeSingle();

      if (!chunkData) {
        throw new Error(`Chunk ${chunkId} not found for document ${documentId}`);
      }

      // Check if embeddings exist for this chunk's page range
      const { data: existingEmbeddings } = await supabase
        .from('document_embeddings')
        .select('id')
        .eq('document_id', documentId)
        .gte('page_number', chunkData.start_page)
        .lte('page_number', chunkData.end_page)
        .limit(1);

      if (existingEmbeddings && existingEmbeddings.length > 0) {
        console.log(`[EMBEDDINGS] Embeddings already exist for chunk ${chunkId}, skipping`);
        return new Response(
          JSON.stringify({ 
            success: true,
            message: 'Embeddings already exist for this chunk',
            skipped: true
          }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
          }
        );
      }
    }

    // Get content from either specific chunk or full document
    let contentText: string;
    let pageMap: any[];
    let startPageForChunk: number | undefined;
    let endPageForChunk: number | undefined;

    if (chunkId) {
      // Get specific chunk content
      const { data: chunkData, error: chunkError } = await supabase
        .from('document_chunks')
        .select('content_text, page_map, start_page, end_page')
        .eq('id', chunkId)
        .eq('document_id', documentId)
        .maybeSingle();

      if (chunkError || !chunkData) {
        throw new Error(`Chunk ${chunkId} not found: ${chunkError?.message || 'Not found'}`);
      }

      if (!chunkData.content_text || chunkData.content_text.trim().length === 0) {
        console.log(`[EMBEDDINGS] Chunk ${chunkId} has no text content, skipping`);
        return new Response(
          JSON.stringify({ 
            success: true,
            message: 'Chunk has no text content',
            skipped: true
          }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
          }
        );
      }

      contentText = chunkData.content_text;
      pageMap = chunkData.page_map;
      startPageForChunk = chunkData.start_page;
      endPageForChunk = chunkData.end_page;
      console.log(`[EMBEDDINGS] Processing chunk ${chunkId} (pages ${startPageForChunk}-${endPageForChunk}, ${contentText.length} chars)`);
    } else {
      // Check if document has chunks (for large documents processed in chunks)
      const { data: chunks, error: chunksError } = await supabase
        .from('document_chunks')
        .select('id, content_text, page_map, start_page, end_page, chunk_index')
        .eq('document_id', documentId)
        .order('chunk_index', { ascending: true });

      if (chunksError) {
        console.error('[EMBEDDINGS] Error fetching document chunks:', chunksError);
        throw new Error('Failed to fetch document chunks: ' + chunksError.message);
      }

      if (chunks && chunks.length > 0) {
        // Process chunks in parallel batches to balance speed with API reliability
        console.log(`[EMBEDDINGS] Found ${chunks.length} chunks, processing in parallel batches`);
        
        const CHUNK_BATCH_SIZE = CONFIG.CHUNK_BATCH_SIZE;
        let totalEmbeddings = 0;
        
        for (let i = 0; i < chunks.length; i += CHUNK_BATCH_SIZE) {
          const chunkBatch = chunks.slice(i, Math.min(i + CHUNK_BATCH_SIZE, chunks.length));
          console.log(`[EMBEDDINGS] Processing chunk batch ${Math.floor(i / CHUNK_BATCH_SIZE) + 1}/${Math.ceil(chunks.length / CHUNK_BATCH_SIZE)}: chunks ${i + 1} to ${i + chunkBatch.length}`);
          
          const chunkPromises = chunkBatch.map(async (chunk) => {
            if (!chunk.content_text || chunk.content_text.trim().length === 0) {
              console.log(`[EMBEDDINGS] Chunk ${chunk.id} has no text content, skipping`);
              return 0;
            }

            console.log(`[EMBEDDINGS] Processing chunk ${chunk.chunk_index + 1} (pages ${chunk.start_page}-${chunk.end_page}, ${chunk.content_text.length} chars)`);
            
            // Chunk the text with optimized settings
            const textChunks = chunkText(chunk.content_text, chunk.page_map, CONFIG.MAX_CHUNK_SIZE, CONFIG.CHUNK_OVERLAP);
            console.log(`[EMBEDDINGS] Generating embeddings for ${textChunks.length} text pieces`);
            
            // Generate embeddings in controlled parallel batches
            const TEXT_BATCH_SIZE = CONFIG.TEXT_BATCH_SIZE;
            const embeddings = [];

            for (let j = 0; j < textChunks.length; j += TEXT_BATCH_SIZE) {
              const textBatch = textChunks.slice(j, Math.min(j + TEXT_BATCH_SIZE, textChunks.length));
              
              // Use Promise.allSettled for resilience - continue even if some fail
              const batchResults = await Promise.allSettled(
                textBatch.map(async (textChunk, idx) => {
                  const embedding = await generateEmbedding(textChunk.text);
                  return {
                    document_id: documentId,
                    chunk_index: j + idx,
                    chunk_text: textChunk.text,
                    embedding: JSON.stringify(embedding),
                    page_number: textChunk.pageNumber
                  };
                })
              );
              
              let failedCount = 0;
              for (const result of batchResults) {
                if (result.status === 'fulfilled') {
                  embeddings.push(result.value);
                } else {
                  failedCount++;
                  console.error(`[EMBEDDINGS] Failed to generate embedding for chunk ${chunk.chunk_index + 1}, piece:`, result.reason);
                }
              }
              
              if (failedCount > 0) {
                console.warn(`[EMBEDDINGS] ${failedCount} pieces failed, continuing with ${batchResults.length - failedCount} successful`);
              }
            }

            // Insert embeddings for this chunk in batches
            if (embeddings.length > 0) {
              const INSERT_BATCH_SIZE = 100;
              for (let j = 0; j < embeddings.length; j += INSERT_BATCH_SIZE) {
                const insertBatch = embeddings.slice(j, j + INSERT_BATCH_SIZE);
                const { error: insertError } = await supabase
                  .from('document_embeddings')
                  .insert(insertBatch);

                if (insertError) {
                  console.error(`[EMBEDDINGS] Error inserting embeddings for chunk ${chunk.chunk_index}:`, insertError);
                  throw new Error('Failed to insert embeddings: ' + insertError.message);
                }
              }
              console.log(`[EMBEDDINGS] Generated ${embeddings.length} embeddings for chunk ${chunk.chunk_index + 1}`);
            }

            return embeddings.length;
          });

          // Wait for this batch of chunks to complete
          const batchResults = await Promise.all(chunkPromises);
          const batchTotal = batchResults.reduce((sum, count) => sum + count, 0);
          totalEmbeddings += batchTotal;
          console.log(`[EMBEDDINGS] Completed chunk batch: ${batchTotal} embeddings (total: ${totalEmbeddings})`);
        }

        console.log(`[EMBEDDINGS] Successfully generated ${totalEmbeddings} embeddings from ${chunks.length} chunks`);

        // Update document status to active
        await supabase
          .from('documents')
          .update({ status: 'active' })
          .eq('id', documentId);

        console.log(`[EMBEDDINGS] ✓ Document ${documentId} completed: ${totalEmbeddings} embeddings`);

        return new Response(
          JSON.stringify({ 
            success: true,
            embeddingsCount: totalEmbeddings,
            chunksProcessed: chunks.length
          }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
          }
        );
      }

      // No chunks found, fall back to reading from documents table (for small documents)
      console.log('[EMBEDDINGS] No chunks found, reading from documents table');
      const { data: docContent, error: contentError } = await supabase
        .from('documents')
        .select('content_text, page_map')
        .eq('id', documentId)
        .maybeSingle();

      if (contentError) {
        console.error('[EMBEDDINGS] Error fetching document content:', contentError);
        throw new Error('Document content not found: ' + contentError.message);
      }

      if (!docContent?.content_text || docContent.content_text.trim().length === 0) {
        console.error('[EMBEDDINGS] Document has no text content:', documentId);
        await supabase
          .from('documents')
          .update({ status: 'active' })
          .eq('id', documentId);
        
        return new Response(
          JSON.stringify({ 
            success: true,
            message: 'No text content to generate embeddings',
            skipped: true
          }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
          }
        );
      }

      contentText = docContent.content_text;
      pageMap = docContent.page_map;
      console.log(`[EMBEDDINGS] Document has ${contentText.length} characters of text`);
    }

    // Start background processing
    const backgroundTask = async () => {
      try {
        // Normalize page map
        const normalizedPageMap = (pageMap && Array.isArray(pageMap) && pageMap.length > 0)
          ? pageMap 
          : [{ 
              page: 1, 
              startIndex: 0, 
              endIndex: contentText.length 
            }];
        
        console.log(`[EMBEDDINGS] Using page map with ${normalizedPageMap.length} pages${chunkInfo}`);

        // Chunk the text with page tracking
        const chunks = chunkText(contentText, normalizedPageMap);
        console.log(`[EMBEDDINGS] Created ${chunks.length} text chunks${chunkInfo}`);

        // Process embeddings in parallel batches for speed
        const PARALLEL_BATCH_SIZE = CONFIG.PARALLEL_BATCH_SIZE;
        const DB_INSERT_BATCH = CONFIG.DB_INSERT_BATCH;
        let totalProcessed = 0;
        let allEmbeddings = [];

        for (let batchStart = 0; batchStart < chunks.length; batchStart += PARALLEL_BATCH_SIZE) {
          const batchEnd = Math.min(batchStart + PARALLEL_BATCH_SIZE, chunks.length);
          const batchChunks = chunks.slice(batchStart, batchEnd);

          console.log(`[EMBEDDINGS] Processing batch: chunks ${batchStart + 1} to ${batchEnd} of ${chunks.length}${chunkInfo}`);

          // Generate all embeddings in this batch in parallel using Promise.allSettled for resilience
          const embeddingPromises = batchChunks.map(async (chunk, i) => {
            const globalIndex = batchStart + i;
            const embedding = await generateEmbedding(chunk.text);
            return {
              document_id: documentId,
              chunk_text: chunk.text,
              chunk_index: globalIndex,
              page_number: chunk.pageNumber,
              embedding: JSON.stringify(embedding),
            };
          });

          try {
            // Use Promise.allSettled to continue even if some embeddings fail
            const results = await Promise.allSettled(embeddingPromises);
            const batchEmbeddings = [];
            let failedCount = 0;
            
            for (let i = 0; i < results.length; i++) {
              const result = results[i];
              if (result.status === 'fulfilled') {
                batchEmbeddings.push(result.value);
              } else {
                failedCount++;
                console.error(`[EMBEDDINGS] Failed chunk ${batchStart + i + 1}/${chunks.length}:`, result.reason);
              }
            }
            
            if (failedCount > 0) {
              console.warn(`[EMBEDDINGS] ${failedCount} chunks failed in batch, continuing with ${batchEmbeddings.length} successful`);
            }
            
            allEmbeddings.push(...batchEmbeddings);
            totalProcessed += batchEmbeddings.length;
            console.log(`[EMBEDDINGS] Completed batch: ${batchEmbeddings.length} embeddings (total: ${totalProcessed}/${chunks.length})${chunkInfo}`);

            // Insert to database when we hit the DB batch size or at the end
            if (allEmbeddings.length >= DB_INSERT_BATCH || batchEnd >= chunks.length) {
              const { error: insertError } = await supabase
                .from('document_embeddings')
                .insert(allEmbeddings);

              if (insertError) {
                console.error('Error inserting embeddings batch:', insertError);
                throw insertError;
              }

              console.log(`[EMBEDDINGS] Inserted ${allEmbeddings.length} embeddings to database${chunkInfo}`);
              allEmbeddings = []; // Clear the batch
            }
          } catch (error) {
            // Save any embeddings we generated before the error
            if (allEmbeddings.length > 0) {
              console.log(`Saving ${allEmbeddings.length} embeddings before error`);
              await supabase.from('document_embeddings').insert(allEmbeddings);
            }
            throw error;
          }
        }

        console.log(`[EMBEDDINGS] Successfully generated ${totalProcessed} embeddings${chunkInfo}`);

        // Only update document status if processing full document (not a specific chunk)
        if (!chunkId) {
          const { error: updateError } = await supabase
            .from('documents')
            .update({ status: 'active' })
            .eq('id', documentId);

          if (updateError) {
            console.error('[EMBEDDINGS] Error updating document status:', updateError);
          } else {
            console.log(`[EMBEDDINGS] ✓ Document ${documentId} completed: ${totalProcessed} embeddings`);
          }
        } else {
          console.log(`[EMBEDDINGS] ✓ Chunk ${chunkId} completed: ${totalProcessed} embeddings`);
        }
      } catch (error) {
        console.error(`[EMBEDDINGS] Error${chunkInfo}:`, error);
        // Only update document status if processing full document (not a specific chunk)
        if (!chunkId) {
          const { error: updateError } = await supabase
            .from('documents')
            .update({ status: 'active' })
            .eq('id', documentId);
        
          if (!updateError) {
            console.log(`Set document ${documentId} to active despite error - content is available`);
          }
        }
      }
    };

    // Start background task
    EdgeRuntime.waitUntil(backgroundTask());

    // Return immediately
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Embedding generation started in background'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Generate embeddings error:', error);
    
    // Enhanced error logging
    if (error instanceof Error) {
      console.error('Error name:', error.name);
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
    } else {
      console.error('Non-Error object caught:', JSON.stringify(error));
    }
    
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : (typeof error === 'string' ? error : 'Unknown error'),
        errorType: error instanceof Error ? error.name : typeof error,
        success: false 
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});