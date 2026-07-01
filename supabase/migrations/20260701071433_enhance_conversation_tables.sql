/*
# Omni Extension - Enhanced Conversation Schema

This migration enhances the conversation tables to support the
Universal Conversation Capture system.
*/

-- Enhance omni_conversations table with new columns
ALTER TABLE omni_conversations ADD COLUMN IF NOT EXISTS platform text DEFAULT 'Other';
ALTER TABLE omni_conversations ADD COLUMN IF NOT EXISTS model text DEFAULT '';
ALTER TABLE omni_conversations ADD COLUMN IF NOT EXISTS is_starred boolean DEFAULT false;
ALTER TABLE omni_conversations ADD COLUMN IF NOT EXISTS is_pinned boolean DEFAULT false;
ALTER TABLE omni_conversations ADD COLUMN IF NOT EXISTS is_archived boolean DEFAULT false;
ALTER TABLE omni_conversations ADD COLUMN IF NOT EXISTS is_deleted boolean DEFAULT false;
ALTER TABLE omni_conversations ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE omni_conversations ADD COLUMN IF NOT EXISTS capture_method text DEFAULT 'manual';
ALTER TABLE omni_conversations ADD COLUMN IF NOT EXISTS last_capture_at timestamptz DEFAULT now();
ALTER TABLE omni_conversations ADD COLUMN IF NOT EXISTS capture_version integer DEFAULT 1;
ALTER TABLE omni_conversations ADD COLUMN IF NOT EXISTS tags jsonb NOT NULL DEFAULT '[]';
ALTER TABLE omni_conversations ADD COLUMN IF NOT EXISTS stats jsonb NOT NULL DEFAULT '{}';

-- Update source column to platform
UPDATE omni_conversations SET platform = source WHERE platform IS NULL OR platform = '';

-- Create omni_messages table for normalized message storage
CREATE TABLE IF NOT EXISTS omni_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES omni_conversations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
  content text NOT NULL,
  timestamp timestamptz DEFAULT now(),
  platform text DEFAULT 'Other',
  model_used text,
  code_blocks jsonb NOT NULL DEFAULT '[]',
  attachments jsonb NOT NULL DEFAULT '[]',
  citations jsonb NOT NULL DEFAULT '[]',
  token_count integer DEFAULT 0,
  input_tokens integer DEFAULT 0,
  output_tokens integer DEFAULT 0,
  is_edited boolean DEFAULT false,
  is_regenerated boolean DEFAULT false,
  is_deleted boolean DEFAULT false,
  edited_at timestamptz,
  original_content text,
  metadata jsonb NOT NULL DEFAULT '{}',
  message_order integer DEFAULT 0
);

-- Create omni_conversation_summaries table
CREATE TABLE IF NOT EXISTS omni_conversation_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES omni_conversations(id) ON DELETE CASCADE UNIQUE,
  generated_at timestamptz DEFAULT now(),
  short_summary text,
  medium_summary text,
  detailed_summary text,
  goals jsonb NOT NULL DEFAULT '[]',
  decisions jsonb NOT NULL DEFAULT '[]',
  action_items jsonb NOT NULL DEFAULT '[]',
  technologies jsonb NOT NULL DEFAULT '[]',
  libraries jsonb NOT NULL DEFAULT '[]',
  frameworks jsonb NOT NULL DEFAULT '[]',
  languages jsonb NOT NULL DEFAULT '[]',
  files jsonb NOT NULL DEFAULT '[]',
  urls jsonb NOT NULL DEFAULT '[]',
  future_tasks jsonb NOT NULL DEFAULT '[]',
  questions jsonb NOT NULL DEFAULT '[]',
  risks jsonb NOT NULL DEFAULT '[]',
  unknowns jsonb NOT NULL DEFAULT '[]'
);

-- Create omni_context_packages table
CREATE TABLE IF NOT EXISTS omni_context_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES omni_conversations(id) ON DELETE CASCADE,
  project_id uuid REFERENCES omni_projects(id) ON DELETE SET NULL,
  generated_at timestamptz DEFAULT now(),
  formatted_context text NOT NULL,
  token_count integer DEFAULT 0,
  format text DEFAULT 'concise' CHECK (format IN ('detailed', 'concise', 'minimal')),
  context_data jsonb NOT NULL DEFAULT '{}'
);

-- Enable RLS on new tables
ALTER TABLE omni_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE omni_conversation_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE omni_context_packages ENABLE ROW LEVEL SECURITY;

-- RLS policies for omni_messages
CREATE POLICY "anon_select_messages" ON omni_messages FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_insert_messages" ON omni_messages FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_update_messages" ON omni_messages FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_delete_messages" ON omni_messages FOR DELETE TO anon, authenticated USING (true);

-- RLS policies for omni_conversation_summaries
CREATE POLICY "anon_select_summaries" ON omni_conversation_summaries FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_insert_summaries" ON omni_conversation_summaries FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_update_summaries" ON omni_conversation_summaries FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_delete_summaries" ON omni_conversation_summaries FOR DELETE TO anon, authenticated USING (true);

-- RLS policies for omni_context_packages
CREATE POLICY "anon_select_context" ON omni_context_packages FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_insert_context" ON omni_context_packages FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_update_context" ON omni_context_packages FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_delete_context" ON omni_context_packages FOR DELETE TO anon, authenticated USING (true);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_conversations_platform ON omni_conversations(platform);
CREATE INDEX IF NOT EXISTS idx_conversations_project_id ON omni_conversations(project_id);
CREATE INDEX IF NOT EXISTS idx_conversations_captured_at ON omni_conversations(captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON omni_conversations(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_starred ON omni_conversations(is_starred) WHERE is_starred = true;
CREATE INDEX IF NOT EXISTS idx_conversations_pinned ON omni_conversations(is_pinned) WHERE is_pinned = true;
CREATE INDEX IF NOT EXISTS idx_conversations_deleted ON omni_conversations(is_deleted) WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON omni_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_role ON omni_messages(role);
CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON omni_messages(timestamp);

CREATE INDEX IF NOT EXISTS idx_summaries_conversation_id ON omni_conversation_summaries(conversation_id);
CREATE INDEX IF NOT EXISTS idx_context_conversation_id ON omni_context_packages(conversation_id);