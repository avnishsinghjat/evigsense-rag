import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user from auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    // Check if fields already exist
    const { data: existingFields } = await supabase
      .from('metadata_field_definitions')
      .select('name')
      .in('name', ['author', 'department', 'document_date', 'confidentiality_level', 'review_date', 'status']);

    const existingFieldNames = new Set(existingFields?.map(f => f.name) || []);

    const defaultFields = [
      {
        name: 'author',
        label: 'Author',
        field_type: 'text',
        options: null,
        is_required: false,
        help_text: 'Document author or creator',
        display_order: 1,
        is_active: true,
        created_by: user.id,
      },
      {
        name: 'department',
        label: 'Department',
        field_type: 'select',
        options: { options: ['HR', 'Finance', 'Legal', 'IT', 'Operations', 'Sales', 'Marketing'] },
        is_required: false,
        help_text: 'Department responsible for this document',
        display_order: 2,
        is_active: true,
        created_by: user.id,
      },
      {
        name: 'document_date',
        label: 'Document Date',
        field_type: 'date',
        options: null,
        is_required: false,
        help_text: 'Date when the document was created or issued',
        display_order: 3,
        is_active: true,
        created_by: user.id,
      },
      {
        name: 'confidentiality_level',
        label: 'Confidentiality Level',
        field_type: 'select',
        options: { options: ['Public', 'Internal', 'Confidential', 'Highly Confidential'] },
        is_required: true,
        help_text: 'Document sensitivity level',
        display_order: 4,
        is_active: true,
        created_by: user.id,
      },
      {
        name: 'review_date',
        label: 'Review Date',
        field_type: 'date',
        options: null,
        is_required: false,
        help_text: 'Next review or expiration date',
        display_order: 5,
        is_active: true,
        created_by: user.id,
      },
      {
        name: 'status',
        label: 'Status',
        field_type: 'select',
        options: { options: ['Draft', 'In Review', 'Final', 'Archived'] },
        is_required: true,
        help_text: 'Current document status',
        display_order: 6,
        is_active: true,
        created_by: user.id,
      },
    ];

    // Filter out fields that already exist
    const fieldsToInsert = defaultFields.filter(field => !existingFieldNames.has(field.name));

    if (fieldsToInsert.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'All default fields already exist',
          created: 0
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data, error } = await supabase
      .from('metadata_field_definitions')
      .insert(fieldsToInsert)
      .select();

    if (error) throw error;

    console.log(`Created ${data.length} default metadata fields`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Created ${data.length} default metadata fields`,
        created: data.length,
        fields: data
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Setup default metadata fields error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
