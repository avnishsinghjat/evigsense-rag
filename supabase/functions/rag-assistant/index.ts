import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { chatCompletionText, embed } from "../_shared/ai.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const requestSchema = z.object({
  query: z.string().trim().min(1, "Query cannot be empty").max(5000, "Query too long"),
  conversationId: z.string().uuid("Invalid conversation ID").nullish(),
  documentId: z.string().uuid("Invalid document ID").optional(),
});

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
    
    const { query, conversationId, documentId } = validationResult.data;
    const authHeader = req.headers.get('Authorization')!;
    
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    // Get user context
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    console.log('Processing query:', query, 'for conversation:', conversationId);

    // Verify conversation ownership or create new conversation
    let currentConversationId = conversationId;
    if (conversationId) {
      const { data: conv } = await supabase
        .from('conversations')
        .select('id')
        .eq('id', conversationId)
        .eq('user_id', user.id)
        .single();
      
      if (!conv) {
        throw new Error('Conversation not found or access denied');
      }
    } else {
      // Create new conversation
      const { data: newConv, error: convError } = await supabase
        .from('conversations')
        .insert({ 
          user_id: user.id,
          title: query.substring(0, 50) + (query.length > 50 ? '...' : '')
        })
        .select()
        .single();
      
      if (convError) throw convError;
      currentConversationId = newConv.id;
      console.log('Created new conversation:', currentConversationId);
    }

    // Store user message
    const { error: userMsgError } = await supabase
      .from('conversation_messages')
      .insert({
        conversation_id: currentConversationId,
        role: 'user',
        content: query
      });
    
    if (userMsgError) throw userMsgError;

    // Retrieve conversation history (last 10 messages for context)
    const { data: history } = await supabase
      .from('conversation_messages')
      .select('role, content')
      .eq('conversation_id', currentConversationId)
      .order('created_at', { ascending: true })
      .limit(10);

    const conversationHistory = history || [];

    // Generate embedding for the query using LM Studio with retry logic
    let queryEmbedding: number[] | undefined;
    let embeddingAttempts = 0;
    const maxEmbeddingRetries = 3;
    
    while (embeddingAttempts < maxEmbeddingRetries) {
      try {
        embeddingAttempts++;
        queryEmbedding = await embed(query);
        if (queryEmbedding) {
          console.log('Generated query embedding, dimensions:', queryEmbedding.length);
        }
        break;
      } catch (error) {
        if (embeddingAttempts >= maxEmbeddingRetries) {
          throw new Error(`Failed to generate embedding after ${maxEmbeddingRetries} attempts: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
        console.error(`Embedding error (attempt ${embeddingAttempts}):`, error);
        const delay = Math.pow(2, embeddingAttempts) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    if (!queryEmbedding) {
      throw new Error('Failed to generate query embedding');
    }

    // Use vector similarity search - filter by documentId if provided
    // Format embedding as PostgreSQL vector string format: [x,y,z,...]
    const embeddingString = `[${queryEmbedding.join(',')}]`;
    
    const { data: similarChunks, error: searchError } = await supabase
      .rpc('search_documents_by_embedding', {
        query_embedding: embeddingString,
        // Lower threshold when scoped to a single document (cross-lingual queries
        // e.g. English question on Chinese/Russian doc score much lower)
        match_threshold: documentId ? 0.0 : 0.3,
        match_count: documentId ? 50 : 15,
        filter_user_id: user.id
      });

    if (searchError) {
      console.error('Vector search error:', searchError);
      throw searchError;
    }

    // Filter by documentId if provided
    let filteredByDocument = similarChunks || [];
    if (documentId && filteredByDocument.length > 0) {
      filteredByDocument = filteredByDocument.filter((chunk: any) => chunk.document_id === documentId);
      console.log(`Filtered to ${filteredByDocument.length} chunks from document ${documentId}`);
    }

    // Detect if the user query is asking about a figure/image/diagram and, if so,
    // boost similarity for chunks that actually contain image markdown so they
    // surface in the top-k context window passed to the LLM.
    const IMAGE_QUERY_RE = /\b(image|images|figure|figures|fig\.?|diagram|diagrams|chart|charts|graph|graphs|illustration|illustrations|picture|pictures|photo|photos|screenshot|screenshots|drawing|drawings|схем|рисун|изображен|картин|фото|диаграмм|график)/i;
    const IMAGE_MD_RE = /!\[[^\]]*\]\([^)]+\)|<img\s[^>]*src=/i;
    const isImageQuery = IMAGE_QUERY_RE.test(query);
    if (isImageQuery && filteredByDocument.length > 0) {
      const BOOST = 0.15;
      filteredByDocument = filteredByDocument.map((chunk: any) => {
        if (chunk?.chunk_text && IMAGE_MD_RE.test(chunk.chunk_text)) {
          return { ...chunk, similarity: Math.min(1, (chunk.similarity ?? 0) + BOOST), has_image: true };
        }
        return chunk;
      });
      // Re-sort so boosted image chunks rise to the top before page filtering.
      filteredByDocument.sort((a: any, b: any) => (b.similarity ?? 0) - (a.similarity ?? 0));
      const boostedCount = filteredByDocument.filter((c: any) => c.has_image).length;
      console.log(`Image-aware retrieval: query mentions visuals, boosted ${boostedCount} chunks containing image markdown`);
    }

    console.log(`Found ${filteredByDocument?.length || 0} similar chunks`);
    console.log('Search results sample:', filteredByDocument?.slice(0, 2));

    // Filter to keep only chunks from top 2 most relevant pages
    let filteredChunks = filteredByDocument;
    if (!documentId && filteredChunks.length > 0) {
      // Only apply page filtering if not searching within a specific document
      // Group chunks by page and find max similarity per page
      const pageRelevance = new Map<string, number>();
      filteredChunks.forEach((chunk: any) => {
        const pageKey = `${chunk.document_id}_${chunk.page_number || 1}`;
        const currentMax = pageRelevance.get(pageKey) || 0;
        if (chunk.similarity > currentMax) {
          pageRelevance.set(pageKey, chunk.similarity);
        }
      });
      
      // Get top 2 pages by relevance
      const topPages = Array.from(pageRelevance.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(([pageKey]) => pageKey);
      
      console.log('Top 2 most relevant pages:', topPages);
      
      // Filter chunks to only include those from top 2 pages
      filteredChunks = filteredChunks.filter((chunk: any) => {
        const pageKey = `${chunk.document_id}_${chunk.page_number || 1}`;
        return topPages.includes(pageKey);
      });
      
      console.log(`Filtered to ${filteredChunks.length} chunks from top 2 pages`);
    }

    // Track document access for analytics and prepare sources for response
    const documentIds = new Set<string>();
    const accessRecords: any[] = [];
    const documentSources: any[] = [];
    
    if (filteredChunks && filteredChunks.length > 0) {
      // Group by page and get max relevance per page
      const pageRelevanceMap = new Map<string, any>();
      
      filteredChunks.forEach((chunk: any) => {
        const docKey = `${chunk.document_id}_${chunk.page_number || 1}`;
        const existing = pageRelevanceMap.get(docKey);
        
        if (!existing || chunk.similarity > existing.similarity) {
          pageRelevanceMap.set(docKey, {
            document_id: chunk.document_id,
            document_title: chunk.document_title,
            relevance_score: chunk.similarity,
            page_number: chunk.page_number || null
          });
        }
      });
      
      // Sort by relevance and take top 2 pages
      const sortedPages = Array.from(pageRelevanceMap.values())
        .sort((a, b) => b.relevance_score - a.relevance_score)
        .slice(0, 2);
      
      // Build access records and sources from top 2 pages
      sortedPages.forEach(pageData => {
        const docKey = `${pageData.document_id}_${pageData.page_number || 1}`;
        documentIds.add(docKey);
        accessRecords.push({
          user_id: user.id,
          document_id: pageData.document_id,
          relevance_score: pageData.relevance_score
        });
        documentSources.push(pageData);
      });
    }

    // Extract every image markdown / <img> reference found in the retrieved
    // chunks. We pass these to the model as an explicit list so it can copy
    // URLs verbatim, and we use it as a fallback to auto-append images when
    // the user clearly asked about a figure but the model omitted them.
    const IMAGE_EXTRACT_RE = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)|<img\s[^>]*src=["']([^"']+)["'][^>]*>/gi;
    type ExtractedImage = { url: string; alt: string; document: string; page: number | null };
    const extractedImages: ExtractedImage[] = [];
    const seenUrls = new Set<string>();
    if (filteredChunks && filteredChunks.length > 0) {
      for (const chunk of filteredChunks as any[]) {
        const text: string = chunk?.chunk_text ?? "";
        if (!text) continue;
        let m: RegExpExecArray | null;
        IMAGE_EXTRACT_RE.lastIndex = 0;
        while ((m = IMAGE_EXTRACT_RE.exec(text)) !== null) {
          const url = (m[2] || m[3] || "").trim();
          if (!url || seenUrls.has(url)) continue;
          seenUrls.add(url);
          extractedImages.push({
            url,
            alt: (m[1] || "Figure").trim(),
            document: chunk.document_title,
            page: chunk.page_number ?? null,
          });
        }
      }
    }
    console.log(`Extracted ${extractedImages.length} image(s) from retrieved chunks`);

    const imagesBlock = extractedImages.length > 0
      ? extractedImages
          .map((img, i) =>
            `[${i + 1}] ${img.document}${img.page ? ` (Page ${img.page})` : ""}\n` +
            `    markdown: ![${img.alt}](${img.url})`,
          )
          .join("\n")
      : "(no images found in retrieved chunks)";

    // Build context from filtered chunks
    const context = filteredChunks && filteredChunks.length > 0
      ? filteredChunks
          .map((chunk: any) => 
            `Document: ${chunk.document_title}${chunk.page_number ? ` (Page ${chunk.page_number})` : ''}\n` +
            `Relevance: ${(chunk.similarity * 100).toFixed(1)}%\n` +
            `Content: ${chunk.chunk_text}\n---`
          )
          .join('\n\n')
      : 'No relevant documents found for this query. Please upload documents or try rephrasing your question.';

    // Build messages array with conversation history
    const messages: any[] = [
      { 
        role: 'system', 
        content: `You are EVIGSENSE AI Assistant, an intelligent agentic system for document analysis and retrieval.

CAPABILITIES:
- Search and analyze user documents intelligently
- Extract key information and insights
- Provide accurate answers with source citations
- Summarize complex documents
- Compare information across multiple documents
- Maintain context from previous conversation

INSTRUCTIONS:
- Always cite which document(s) you're referencing (use document titles)
- If information is found in multiple documents, synthesize and compare
- If no relevant information exists in the documents, clearly state this
- Be precise and factual - only use information from the provided documents
- Remember context from previous messages in the conversation
- When appropriate, suggest related topics or documents the user might want to explore
- Structure your responses clearly using markdown (headings, bullet points, tables)
- For math/formulas use KaTeX delimiters: inline math as $...$ and block/display math as $$...$$. Never use \[...\], \(...\), or bare [ ... ] / ( ... ) for equations.

IMAGES — CRITICAL RULES:
- The "Available Images" section below lists every image present in the
  retrieved context, with the exact markdown to use.
- If the user's question is about a figure, image, diagram, chart, drawing,
  illustration, photo, screenshot, or any visual (including Russian terms
  like "схема", "рисунок", "изображение", "диаграмма", "график"), you MUST
  embed the relevant image(s) inline in your answer using the EXACT markdown
  shown in "Available Images" — copy it character-for-character.
- Place each image immediately next to the sentence that explains it.
- If multiple images are relevant, include all of them.
- NEVER invent, paraphrase, or shorten image URLs. Only reuse URLs from the
  "Available Images" list. If no images are listed, say so explicitly.

Available Images (copy markdown verbatim):
${imagesBlock}

Available Documents Context:
${context}`
      }
    ];

    // Add conversation history (excluding the last user message which we'll add separately)
    conversationHistory.slice(0, -1).forEach((msg: any) => {
      messages.push({ role: msg.role, content: msg.content });
    });

    // Add current query
    messages.push({ 
      role: 'user', 
      content: query
    });

    console.log(`Calling AI with ${messages.length} messages in context`);

    const startTime = Date.now();

    // Call LM Studio for chat completion
    let answer = await chatCompletionText(messages);

    // Fallback: if the user clearly asked about a figure but the model didn't
    // embed any of the available images, append them so they always show up.
    if (isImageQuery && extractedImages.length > 0 && !IMAGE_MD_RE.test(answer)) {
      const appended = extractedImages
        .map((img) => `![${img.alt}](${img.url})\n*${img.document}${img.page ? ` — Page ${img.page}` : ""}*`)
        .join("\n\n");
      answer = `${answer}\n\n---\n\n**Referenced figure${extractedImages.length > 1 ? "s" : ""}:**\n\n${appended}`;
      console.log("Auto-appended images to answer (model omitted them).");
    }

    const executionTime = Date.now() - startTime;

    // Generate follow-up question suggestions
    let suggestions: string[] = [];
    try {
      const suggestionsText = await chatCompletionText([
        { 
          role: 'system', 
          content: `You are a helpful assistant that generates follow-up questions. 
Based on the user's query and the assistant's answer, suggest 3-5 relevant follow-up questions that the user might want to ask next.
The questions should be:
- Specific and actionable
- Related to the document content or the current topic
- Help the user dig deeper or explore related areas
- Natural and conversational

Return ONLY a JSON array of strings, with no additional text or explanation.
Example: ["What are the key findings?", "Can you compare this with other documents?", "What are the implications?"]`
        },
        { 
          role: 'user', 
          content: `User query: "${query}"\n\nAssistant answer: "${answer.substring(0, 500)}..."\n\nGenerate 3-5 follow-up questions:`
        }
      ], { temperature: 0.7 });
      
      try {
        const jsonMatch = suggestionsText.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          suggestions = JSON.parse(jsonMatch[0]);
        }
      } catch (parseError) {
        console.error('Error parsing suggestions JSON:', parseError);
        console.log('Raw suggestions response:', suggestionsText);
      }
    } catch (suggestionError) {
      console.error('Error generating follow-up suggestions:', suggestionError);
    }

    // Log analytics query
    const { data: analyticsQuery, error: analyticsError } = await supabase
      .from('analytics_queries')
      .insert({
        user_id: user.id,
        conversation_id: currentConversationId,
        query_text: query,
        response_length: answer.length,
        documents_referenced: documentIds.size,
        execution_time_ms: executionTime
      })
      .select()
      .single();

    if (analyticsError) {
      console.error('Error logging analytics query:', analyticsError);
    }

    // Log document access analytics
    if (accessRecords.length > 0 && analyticsQuery) {
      const accessWithQueryId = accessRecords.map(record => ({
        ...record,
        query_id: analyticsQuery.id
      }));

      const { error: accessError } = await supabase
        .from('analytics_document_access')
        .insert(accessWithQueryId);

      if (accessError) {
        console.error('Error logging document access:', accessError);
      }
    }

    // Store assistant message with sources
    const { error: assistantMsgError } = await supabase
      .from('conversation_messages')
      .insert({
        conversation_id: currentConversationId,
        role: 'assistant',
        content: answer,
        sources: documentSources
      });
    
    if (assistantMsgError) {
      console.error('Error storing assistant message:', assistantMsgError);
    }

    // Update conversation timestamp
    await supabase
      .from('conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', currentConversationId);

    return new Response(JSON.stringify({ 
      answer,
      conversationId: currentConversationId,
      sources: documentSources,
      suggestions: suggestions.length > 0 ? suggestions : undefined
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('RAG Assistant error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});