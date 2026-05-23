import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { chatCompletionText } from "../_shared/ai.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const requestSchema = z.object({
  texts: z.array(z.string()),
  sourceLanguage: z.string().min(2).max(10),
  targetLanguage: z.string().min(2).max(10),
});

const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  ru: "Russian",
  es: "Spanish",
  fr: "French",
  de: "German",
  zh: "Chinese",
  ja: "Japanese",
  ko: "Korean",
  ar: "Arabic",
  pt: "Portuguese",
  it: "Italian",
  nl: "Dutch",
  pl: "Polish",
  tr: "Turkish",
  vi: "Vietnamese",
  th: "Thai",
  hi: "Hindi",
  bn: "Bengali",
  uk: "Ukrainian",
  cs: "Czech",
  sv: "Swedish",
  no: "Norwegian",
  da: "Danish",
  fi: "Finnish",
  el: "Greek",
  he: "Hebrew",
  id: "Indonesian",
  ms: "Malay",
  ro: "Romanian",
  hu: "Hungarian",
  bg: "Bulgarian",
  hr: "Croatian",
  sk: "Slovak",
  sl: "Slovenian",
  lt: "Lithuanian",
  lv: "Latvian",
  et: "Estonian",
  fa: "Persian",
  ur: "Urdu",
  ta: "Tamil",
  te: "Telugu",
  ml: "Malayalam",
  kn: "Kannada",
  mr: "Marathi",
  gu: "Gujarati",
  pa: "Punjabi",
};

function getLanguageName(code: string): string {
  return LANGUAGE_NAMES[code.toLowerCase()] || code;
}

async function translateWithLLM(
  texts: string[],
  sourceLanguage: string,
  targetLanguage: string,
): Promise<string[]> {
  const sourceName = getLanguageName(sourceLanguage);
  const targetName = getLanguageName(targetLanguage);
  
  // Filter out empty or non-translatable texts, keeping track of indices
  const toTranslate: { index: number; text: string }[] = [];
  const results: string[] = new Array(texts.length);
  
  for (let i = 0; i < texts.length; i++) {
    const text = texts[i];
    if (!text || text.trim() === '' || /^[\d\s\-\/\.\,\:\;\!\?\@\#\$\%\^\&\*\(\)\[\]\{\}\+\=\_\<\>\~\`\'\"\\|]+$/.test(text)) {
      results[i] = text; // Keep original for non-translatable
    } else {
      toTranslate.push({ index: i, text });
    }
  }
  
  if (toTranslate.length === 0) {
    return results;
  }
  
  // Build numbered list for LLM
  const numberedTexts = toTranslate.map((item, idx) => `[${idx + 1}] ${item.text}`).join('\n');
  
  const systemPrompt = `You are a professional translator. Translate from ${sourceName} to ${targetName}.
Rules:
- Translate ONLY the text content, preserve meaning and tone
- Return translations in the EXACT same numbered format
- Keep numbers, dates, proper nouns, and technical terms as appropriate
- Do not add explanations or notes
- Each line must start with [number] followed by the translation`;

  const userPrompt = `Translate these ${toTranslate.length} texts from ${sourceName} to ${targetName}:

${numberedTexts}`;

  console.log(`Translating ${toTranslate.length} texts with LLM...`);

  const translatedContent = await chatCompletionText([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ], { temperature: 0.1, max_tokens: 8000 });
  
  console.log('LLM response received, parsing...');
  
  // Parse the numbered response
  const lines = translatedContent.split('\n').filter((line: string) => line.trim());
  const translationMap = new Map<number, string>();
  
  for (const line of lines) {
    const match = line.match(/^\[(\d+)\]\s*(.+)$/);
    if (match) {
      const num = parseInt(match[1], 10);
      const translation = match[2].trim();
      translationMap.set(num, translation);
    }
  }
  
  // Map translations back to results
  for (let idx = 0; idx < toTranslate.length; idx++) {
    const item = toTranslate[idx];
    const translation = translationMap.get(idx + 1);
    results[item.index] = translation || item.text; // Fallback to original if parsing failed
  }
  
  console.log(`Successfully translated ${translationMap.size}/${toTranslate.length} texts`);
  
  return results;
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
    
    const { texts, sourceLanguage, targetLanguage } = validationResult.data;

    console.log(`Received ${texts.length} texts for translation: ${sourceLanguage} -> ${targetLanguage}`);

    // Process in chunks of 50 to stay within token limits
    const CHUNK_SIZE = 50;
    const allResults: string[] = [];
    
    for (let i = 0; i < texts.length; i += CHUNK_SIZE) {
      const chunk = texts.slice(i, i + CHUNK_SIZE);
      console.log(`Processing chunk ${Math.floor(i / CHUNK_SIZE) + 1}/${Math.ceil(texts.length / CHUNK_SIZE)}`);
      
      const translated = await translateWithLLM(chunk, sourceLanguage, targetLanguage);
      allResults.push(...translated);
      
      // Small delay between chunks to avoid rate limits
      if (i + CHUNK_SIZE < texts.length) {
        await new Promise(r => setTimeout(r, 200));
      }
    }

    console.log(`Translation complete: ${allResults.length} texts`);

    return new Response(
      JSON.stringify({ success: true, translatedTexts: allResults }), 
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Translation error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Translation failed' }), 
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
