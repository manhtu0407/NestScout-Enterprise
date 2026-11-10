
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {

  "public": {
          Tables: {
            "account_deletion_requests": {
                  Row: {
                    "processed_at": string | null,"requested_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "processed_at"?: string | null,"requested_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "processed_at"?: string | null,"requested_at"?: string,"user_id"?: string
                  }
                  Relationships: [

                  ]
                },"consent_events": {
                  Row: {
                    "granted": boolean,"id": number,"policy_version": string,"purpose": string,"recorded_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "granted": boolean,"id"?: never,"policy_version": string,"purpose": string,"recorded_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "granted"?: boolean,"id"?: never,"policy_version"?: string,"purpose"?: string,"recorded_at"?: string,"user_id"?: string
                  }
                  Relationships: [

                  ]
                },"customer_profiles": {
                  Row: {
                    "address": string,"avatar_path": string,"display_name": string,"email": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "address"?: string,"avatar_path"?: string,"display_name"?: string,"email"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "address"?: string,"avatar_path"?: string,"display_name"?: string,"email"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [

                  ]
                },"customer_saved_workers": {
                  Row: {
                    "created_at": string,"customer_id": string,"profile_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"customer_id"?: string,"profile_id": string
                  }
                  Update: {
                    "created_at"?: string,"customer_id"?: string,"profile_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "customer_saved_workers_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "worker_public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"customer_settings": {
                  Row: {
                    "messages": boolean,"promotions": boolean,"push": boolean,"quotes": boolean,"reduce_motion": boolean,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "messages"?: boolean,"promotions"?: boolean,"push"?: boolean,"quotes"?: boolean,"reduce_motion"?: boolean,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "messages"?: boolean,"promotions"?: boolean,"push"?: boolean,"quotes"?: boolean,"reduce_motion"?: boolean,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [

                  ]
                },"job_change_requests": {
                  Row: {
                    "created_at": string,"decided_at": string | null,"decided_by": string | null,"id": string,"job_id": string,"kind": string,"proposed_for": string | null,"reason": string | null,"requested_by": string,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"decided_at"?: string | null,"decided_by"?: string | null,"id"?: string,"job_id": string,"kind": string,"proposed_for"?: string | null,"reason"?: string | null,"requested_by"?: string,"status"?: string
                  }
                  Update: {
                    "created_at"?: string,"decided_at"?: string | null,"decided_by"?: string | null,"id"?: string,"job_id"?: string,"kind"?: string,"proposed_for"?: string | null,"reason"?: string | null,"requested_by"?: string,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "job_change_requests_job_id_fkey"
      columns: ["job_id"]
isOneToOne: false
      referencedRelation: "service_jobs"
      referencedColumns: ["id"]
    }
                  ]
                },"kael_conversations": {
                  Row: {
                    "created_at": string,"id": string,"mode": string,"owner_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"mode": string,"owner_id": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"mode"?: string,"owner_id"?: string,"updated_at"?: string
                  }
                  Relationships: [

                  ]
                },"kael_knowledge_sources": {
                  Row: {
                    "content_hash": string,"corpus_version": string,"effective_at": string | null,"expires_at": string | null,"ingested_at": string,"is_current": boolean,"locale": string,"normalized_aliases": (string)[],"normalized_text": string,"owner_id": string | null,"provenance": string,"public_source": Json | null,"publication": string,"region": string,"review_state": string,"revision": number,"search_vector": unknown,"source": NonNullable<Json>,"source_id": string,"source_kind": string,"visibility": string
                  }
                  ComputedFields: never
                  Insert: {
                    "content_hash": string,"corpus_version": string,"effective_at"?: string | null,"expires_at"?: string | null,"ingested_at"?: string,"is_current"?: boolean,"locale": string,"normalized_aliases": (string)[],"normalized_text": string,"owner_id"?: string | null,"provenance": string,"public_source"?: never,"publication": string,"region": string,"review_state": string,"revision": number,"search_vector"?: never,"source": NonNullable<Json>,"source_id": string,"source_kind": string,"visibility": string
                  }
                  Update: {
                    "content_hash"?: string,"corpus_version"?: string,"effective_at"?: string | null,"expires_at"?: string | null,"ingested_at"?: string,"is_current"?: boolean,"locale"?: string,"normalized_aliases"?: (string)[],"normalized_text"?: string,"owner_id"?: string | null,"provenance"?: string,"public_source"?: never,"publication"?: string,"region"?: string,"review_state"?: string,"revision"?: number,"search_vector"?: never,"source"?: NonNullable<Json>,"source_id"?: string,"source_kind"?: string,"visibility"?: string
                  }
                  Relationships: [

                  ]
                },"kael_memory_modes": {
                  Row: {
                    "enabled_at": string,"mode": string,"owner_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "enabled_at"?: string,"mode": string,"owner_id"?: string
                  }
                  Update: {
                    "enabled_at"?: string,"mode"?: string,"owner_id"?: string
                  }
                  Relationships: [

                  ]
                },"kael_memory_preferences": {
                  Row: {
                    "mode": string,"owner_id": string,"preference": string,"source": string,"updated_at": string,"value": string
                  }
                  ComputedFields: never
                  Insert: {
                    "mode": string,"owner_id"?: string,"preference": string,"source"?: string,"updated_at"?: string,"value": string
                  }
                  Update: {
                    "mode"?: string,"owner_id"?: string,"preference"?: string,"source"?: string,"updated_at"?: string,"value"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "kael_memory_preferences_owner_id_mode_fkey"
      columns: ["owner_id","mode"]
isOneToOne: false
      referencedRelation: "kael_memory_modes"
      referencedColumns: ["owner_id","mode"]
    }
                  ]
                },"kael_messages": {
                  Row: {
                    "content": string,"conversation_id": string,"created_at": string,"id": string,"owner_id": string,"role": string,"run_id": string,"seq": number,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "content": string,"conversation_id": string,"created_at"?: string,"id"?: string,"owner_id": string,"role": string,"run_id": string,"seq": number,"status"?: string
                  }
                  Update: {
                    "content"?: string,"conversation_id"?: string,"created_at"?: string,"id"?: string,"owner_id"?: string,"role"?: string,"run_id"?: string,"seq"?: number,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "kael_messages_conversation_id_fkey"
      columns: ["conversation_id"]
isOneToOne: false
      referencedRelation: "kael_conversations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "kael_messages_run_id_fkey"
      columns: ["run_id"]
isOneToOne: false
      referencedRelation: "kael_runs"
      referencedColumns: ["id"]
    }
                  ]
                },"kael_runs": {
                  Row: {
                    "conversation_id": string,"error_code": string | null,"finished_at": string | null,"id": string,"input_tokens": number,"model": string | null,"output_tokens": number,"owner_id": string,"provider": string | null,"request_id": string,"started_at": string,"status": string,"steps": number
                  }
                  ComputedFields: never
                  Insert: {
                    "conversation_id": string,"error_code"?: string | null,"finished_at"?: string | null,"id"?: string,"input_tokens"?: number,"model"?: string | null,"output_tokens"?: number,"owner_id": string,"provider"?: string | null,"request_id": string,"started_at"?: string,"status"?: string,"steps"?: number
                  }
                  Update: {
                    "conversation_id"?: string,"error_code"?: string | null,"finished_at"?: string | null,"id"?: string,"input_tokens"?: number,"model"?: string | null,"output_tokens"?: number,"owner_id"?: string,"provider"?: string | null,"request_id"?: string,"started_at"?: string,"status"?: string,"steps"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "kael_runs_conversation_id_fkey"
      columns: ["conversation_id"]
isOneToOne: false
      referencedRelation: "kael_conversations"
      referencedColumns: ["id"]
    }
                  ]
                },"kael_task_events": {
                  Row: {
                    "created_at": string,"event": string,"from_status": string | null,"id": string,"owner_id": string,"run_id": string | null,"task_id": string,"to_status": string,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"event": string,"from_status"?: string | null,"id"?: string,"owner_id": string,"run_id"?: string | null,"task_id": string,"to_status": string,"version": number
                  }
                  Update: {
                    "created_at"?: string,"event"?: string,"from_status"?: string | null,"id"?: string,"owner_id"?: string,"run_id"?: string | null,"task_id"?: string,"to_status"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "kael_task_events_run_id_fkey"
      columns: ["run_id"]
isOneToOne: false
      referencedRelation: "kael_runs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "kael_task_events_task_id_fkey"
      columns: ["task_id"]
isOneToOne: false
      referencedRelation: "kael_tasks"
      referencedColumns: ["id"]
    }
                  ]
                },"kael_tasks": {
                  Row: {
                    "artifact": NonNullable<Json>,"conversation_id": string,"created_at": string,"id": string,"kind": string,"owner_id": string,"status": string,"summary": string,"title": string,"updated_at": string,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "artifact"?: NonNullable<Json>,"conversation_id": string,"created_at"?: string,"id"?: string,"kind": string,"owner_id": string,"status": string,"summary"?: string,"title": string,"updated_at"?: string,"version"?: number
                  }
                  Update: {
                    "artifact"?: NonNullable<Json>,"conversation_id"?: string,"created_at"?: string,"id"?: string,"kind"?: string,"owner_id"?: string,"status"?: string,"summary"?: string,"title"?: string,"updated_at"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "kael_tasks_conversation_id_fkey"
      columns: ["conversation_id"]
isOneToOne: false
      referencedRelation: "kael_conversations"
      referencedColumns: ["id"]
    }
                  ]
                },"notifications": {
                  Row: {
                    "body": string,"created_at": string,"id": string,"kind": string,"read_at": string | null,"recipient_id": string,"request_id": string,"title": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body": string,"created_at"?: string,"id"?: string,"kind": string,"read_at"?: string | null,"recipient_id": string,"request_id": string,"title": string
                  }
                  Update: {
                    "body"?: string,"created_at"?: string,"id"?: string,"kind"?: string,"read_at"?: string | null,"recipient_id"?: string,"request_id"?: string,"title"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notifications_request_id_fkey"
      columns: ["request_id"]
isOneToOne: false
      referencedRelation: "service_requests"
      referencedColumns: ["id"]
    }
                  ]
                },"push_tokens": {
                  Row: {
                    "platform": string,"registered_at": string,"token": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "platform": string,"registered_at"?: string,"token": string,"user_id"?: string
                  }
                  Update: {
                    "platform"?: string,"registered_at"?: string,"token"?: string,"user_id"?: string
                  }
                  Relationships: [

                  ]
                },"request_photos": {
                  Row: {
                    "created_at": string,"id": string,"owner_id": string,"path": string,"request_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"owner_id"?: string,"path": string,"request_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"owner_id"?: string,"path"?: string,"request_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "request_photos_request_id_fkey"
      columns: ["request_id"]
isOneToOne: false
      referencedRelation: "service_requests"
      referencedColumns: ["id"]
    }
                  ]
                },"request_pins": {
                  Row: {
                    "created_at": string,"owner_id": string,"request_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"owner_id"?: string,"request_id": string
                  }
                  Update: {
                    "created_at"?: string,"owner_id"?: string,"request_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "request_pins_request_id_fkey"
      columns: ["request_id"]
isOneToOne: false
      referencedRelation: "service_requests"
      referencedColumns: ["id"]
    }
                  ]
                },"review_reactions": {
                  Row: {
                    "created_at": string,"reaction": string,"review_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"reaction": string,"review_id": string,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"reaction"?: string,"review_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "review_reactions_review_id_fkey"
      columns: ["review_id"]
isOneToOne: false
      referencedRelation: "worker_reviews"
      referencedColumns: ["id"]
    }
                  ]
                },"service_cases": {
                  Row: {
                    "created_at": string,"id": string,"job_id": string,"kind": string,"opened_by": string,"operation_key": string,"reason": string,"submission_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"job_id": string,"kind": string,"opened_by": string,"operation_key": string,"reason": string,"submission_id"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"job_id"?: string,"kind"?: string,"opened_by"?: string,"operation_key"?: string,"reason"?: string,"submission_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "service_cases_job_id_fkey"
      columns: ["job_id"]
isOneToOne: false
      referencedRelation: "service_jobs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "service_cases_submission_id_fkey"
      columns: ["submission_id"]
isOneToOne: false
      referencedRelation: "service_submissions"
      referencedColumns: ["id"]
    }
                  ]
                },"service_invitations": {
                  Row: {
                    "basis": string,"expires_at": string,"id": string,"quote_id": string,"request_id": string,"state": string,"worker_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "basis"?: string,"expires_at": string,"id"?: string,"quote_id": string,"request_id": string,"state"?: string,"worker_id": string
                  }
                  Update: {
                    "basis"?: string,"expires_at"?: string,"id"?: string,"quote_id"?: string,"request_id"?: string,"state"?: string,"worker_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "service_invitations_quote_id_request_id_fkey"
      columns: ["quote_id","request_id"]
isOneToOne: false
      referencedRelation: "service_quotes"
      referencedColumns: ["id","request_id"]
    },{
      foreignKeyName: "service_invitations_request_id_fkey"
      columns: ["request_id"]
isOneToOne: false
      referencedRelation: "service_requests"
      referencedColumns: ["id"]
    }
                  ]
                },"service_job_events": {
                  Row: {
                    "actor_id": string,"created_at": string,"event": string,"id": string,"job_id": string,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_id": string,"created_at"?: string,"event": string,"id"?: string,"job_id": string,"version": number
                  }
                  Update: {
                    "actor_id"?: string,"created_at"?: string,"event"?: string,"id"?: string,"job_id"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "service_job_events_job_id_fkey"
      columns: ["job_id"]
isOneToOne: false
      referencedRelation: "service_jobs"
      referencedColumns: ["id"]
    }
                  ]
                },"service_job_pauses": {
                  Row: {
                    "category": string,"created_at": string,"escalated_at": string | null,"escalated_from_version": number | null,"id": string,"job_id": string,"paused_by": string,"paused_from_version": number,"prior_stage": string,"resume_requested_at": string | null,"resume_requested_by": string | null,"resume_requested_from_version": number | null,"resumed_at": string | null,"resumed_by": string | null,"resumed_from_version": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "category": string,"created_at"?: string,"escalated_at"?: string | null,"escalated_from_version"?: number | null,"id"?: string,"job_id": string,"paused_by": string,"paused_from_version": number,"prior_stage": string,"resume_requested_at"?: string | null,"resume_requested_by"?: string | null,"resume_requested_from_version"?: number | null,"resumed_at"?: string | null,"resumed_by"?: string | null,"resumed_from_version"?: number | null
                  }
                  Update: {
                    "category"?: string,"created_at"?: string,"escalated_at"?: string | null,"escalated_from_version"?: number | null,"id"?: string,"job_id"?: string,"paused_by"?: string,"paused_from_version"?: number,"prior_stage"?: string,"resume_requested_at"?: string | null,"resume_requested_by"?: string | null,"resume_requested_from_version"?: number | null,"resumed_at"?: string | null,"resumed_by"?: string | null,"resumed_from_version"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "service_job_pauses_job_id_fkey"
      columns: ["job_id"]
isOneToOne: false
      referencedRelation: "service_jobs"
      referencedColumns: ["id"]
    }
                  ]
                },"service_job_reports": {
                  Row: {
                    "actor_id": string,"created_at": string,"details": string,"id": string,"job_id": string,"kind": string,"report_key": string,"reported_from_version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_id": string,"created_at"?: string,"details": string,"id"?: string,"job_id": string,"kind": string,"report_key": string,"reported_from_version": number
                  }
                  Update: {
                    "actor_id"?: string,"created_at"?: string,"details"?: string,"id"?: string,"job_id"?: string,"kind"?: string,"report_key"?: string,"reported_from_version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "service_job_reports_job_id_fkey"
      columns: ["job_id"]
isOneToOne: false
      referencedRelation: "service_jobs"
      referencedColumns: ["id"]
    }
                  ]
                },"service_jobs": {
                  Row: {
                    "created_at": string,"id": string,"invitation_id": string,"quote_id": string,"request_id": string,"stage": string,"version": number,"worker_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"invitation_id": string,"quote_id": string,"request_id": string,"stage"?: string,"version"?: number,"worker_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"invitation_id"?: string,"quote_id"?: string,"request_id"?: string,"stage"?: string,"version"?: number,"worker_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "service_jobs_invitation_id_fkey"
      columns: ["invitation_id"]
isOneToOne: true
      referencedRelation: "service_invitations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "service_jobs_quote_id_request_id_fkey"
      columns: ["quote_id","request_id"]
isOneToOne: false
      referencedRelation: "service_quotes"
      referencedColumns: ["id","request_id"]
    },{
      foreignKeyName: "service_jobs_request_id_fkey"
      columns: ["request_id"]
isOneToOne: true
      referencedRelation: "service_requests"
      referencedColumns: ["id"]
    }
                  ]
                },"service_quotes": {
                  Row: {
                    "accepted_at": string | null,"accepted_by": string | null,"amount_minor": number,"basis": string,"currency": string,"expires_at": string,"id": string,"rejected_at": string | null,"rejected_by": string | null,"request_id": string,"scope": string,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_at"?: string | null,"accepted_by"?: string | null,"amount_minor": number,"basis"?: string,"currency": string,"expires_at": string,"id"?: string,"rejected_at"?: string | null,"rejected_by"?: string | null,"request_id": string,"scope": string,"version": number
                  }
                  Update: {
                    "accepted_at"?: string | null,"accepted_by"?: string | null,"amount_minor"?: number,"basis"?: string,"currency"?: string,"expires_at"?: string,"id"?: string,"rejected_at"?: string | null,"rejected_by"?: string | null,"request_id"?: string,"scope"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "service_quotes_request_id_fkey"
      columns: ["request_id"]
isOneToOne: false
      referencedRelation: "service_requests"
      referencedColumns: ["id"]
    }
                  ]
                },"service_requests": {
                  Row: {
                    "created_at": string,"description": string,"id": string,"location": string,"owner_id": string,"submission_key": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"description": string,"id"?: string,"location"?: string,"owner_id"?: string,"submission_key": string
                  }
                  Update: {
                    "created_at"?: string,"description"?: string,"id"?: string,"location"?: string,"owner_id"?: string,"submission_key"?: string
                  }
                  Relationships: [

                  ]
                },"service_scope_changes": {
                  Row: {
                    "basis": string,"created_at": string,"currency": string,"decided_at": string | null,"decided_by": string | null,"decided_from_version": number | null,"decision": string,"id": string,"job_id": string,"new_amount_minor": number,"new_scope": string,"old_amount_minor": number,"old_scope": string,"proposal_key": string,"proposed_by": string,"proposed_from_version": number,"rationale": string,"sequence": number
                  }
                  ComputedFields: never
                  Insert: {
                    "basis": string,"created_at"?: string,"currency": string,"decided_at"?: string | null,"decided_by"?: string | null,"decided_from_version"?: number | null,"decision"?: string,"id"?: string,"job_id": string,"new_amount_minor": number,"new_scope": string,"old_amount_minor": number,"old_scope": string,"proposal_key": string,"proposed_by": string,"proposed_from_version": number,"rationale": string,"sequence": number
                  }
                  Update: {
                    "basis"?: string,"created_at"?: string,"currency"?: string,"decided_at"?: string | null,"decided_by"?: string | null,"decided_from_version"?: number | null,"decision"?: string,"id"?: string,"job_id"?: string,"new_amount_minor"?: number,"new_scope"?: string,"old_amount_minor"?: number,"old_scope"?: string,"proposal_key"?: string,"proposed_by"?: string,"proposed_from_version"?: number,"rationale"?: string,"sequence"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "service_scope_changes_job_id_fkey"
      columns: ["job_id"]
isOneToOne: false
      referencedRelation: "service_jobs"
      referencedColumns: ["id"]
    }
                  ]
                },"service_submissions": {
                  Row: {
                    "correction_note": string | null,"created_at": string,"decided_at": string | null,"decided_by": string | null,"decided_from_version": number | null,"decision": string,"decision_reason": string | null,"evidence": string,"id": string,"job_id": string,"submission_key": string,"submitted_by": string,"submitted_from_version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "correction_note"?: string | null,"created_at"?: string,"decided_at"?: string | null,"decided_by"?: string | null,"decided_from_version"?: number | null,"decision"?: string,"decision_reason"?: string | null,"evidence": string,"id"?: string,"job_id": string,"submission_key": string,"submitted_by": string,"submitted_from_version": number
                  }
                  Update: {
                    "correction_note"?: string | null,"created_at"?: string,"decided_at"?: string | null,"decided_by"?: string | null,"decided_from_version"?: number | null,"decision"?: string,"decision_reason"?: string | null,"evidence"?: string,"id"?: string,"job_id"?: string,"submission_key"?: string,"submitted_by"?: string,"submitted_from_version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "service_submissions_job_id_fkey"
      columns: ["job_id"]
isOneToOne: false
      referencedRelation: "service_jobs"
      referencedColumns: ["id"]
    }
                  ]
                },"support_requests": {
                  Row: {
                    "body": string,"created_at": string,"id": string,"owner_id": string,"subject": string,"submission_key": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body": string,"created_at"?: string,"id"?: string,"owner_id"?: string,"subject": string,"submission_key": string
                  }
                  Update: {
                    "body"?: string,"created_at"?: string,"id"?: string,"owner_id"?: string,"subject"?: string,"submission_key"?: string
                  }
                  Relationships: [

                  ]
                },"terms_acceptances": {
                  Row: {
                    "accepted_at": string,"document": string,"user_id": string,"version": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_at"?: string,"document": string,"user_id"?: string,"version": string
                  }
                  Update: {
                    "accepted_at"?: string,"document"?: string,"user_id"?: string,"version"?: string
                  }
                  Relationships: [

                  ]
                },"worker_access_grants": {
                  Row: {
                    "granted_at": string,"revoked_at": string | null,"status": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "granted_at"?: string,"revoked_at"?: string | null,"status"?: string,"user_id": string
                  }
                  Update: {
                    "granted_at"?: string,"revoked_at"?: string | null,"status"?: string,"user_id"?: string
                  }
                  Relationships: [

                  ]
                },"worker_certificates": {
                  Row: {
                    "created_at": string,"id": string,"status": string,"title": string,"worker_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"status"?: string,"title": string,"worker_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"status"?: string,"title"?: string,"worker_id"?: string
                  }
                  Relationships: [

                  ]
                },"worker_documents": {
                  Row: {
                    "created_at": string,"id": string,"kind": string,"path": string,"status": string,"title": string,"worker_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"kind": string,"path": string,"status"?: string,"title": string,"worker_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"kind"?: string,"path"?: string,"status"?: string,"title"?: string,"worker_id"?: string
                  }
                  Relationships: [

                  ]
                },"worker_payout_accounts": {
                  Row: {
                    "account_holder": string,"account_number": string,"bank_code": string,"bank_name": string,"created_at": string,"qr_path": string,"status": string,"updated_at": string,"worker_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "account_holder": string,"account_number": string,"bank_code": string,"bank_name": string,"created_at"?: string,"qr_path": string,"status"?: string,"updated_at"?: string,"worker_id": string
                  }
                  Update: {
                    "account_holder"?: string,"account_number"?: string,"bank_code"?: string,"bank_name"?: string,"created_at"?: string,"qr_path"?: string,"status"?: string,"updated_at"?: string,"worker_id"?: string
                  }
                  Relationships: [

                  ]
                },"worker_public_profiles": {
                  Row: {
                    "about": string,"accepting_jobs": boolean,"area": string,"basis": string,"display_name": string,"experience_years": number,"id": string,"listed": boolean,"radius_km": number,"service_areas": (string)[],"service_ids": (string)[],"skills": (string)[],"trade": string,"worker_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "about"?: string,"accepting_jobs"?: boolean,"area": string,"basis"?: string,"display_name": string,"experience_years": number,"id"?: string,"listed"?: boolean,"radius_km"?: number,"service_areas"?: (string)[],"service_ids"?: (string)[],"skills"?: (string)[],"trade": string,"worker_id": string
                  }
                  Update: {
                    "about"?: string,"accepting_jobs"?: boolean,"area"?: string,"basis"?: string,"display_name"?: string,"experience_years"?: number,"id"?: string,"listed"?: boolean,"radius_km"?: number,"service_areas"?: (string)[],"service_ids"?: (string)[],"skills"?: (string)[],"trade"?: string,"worker_id"?: string
                  }
                  Relationships: [

                  ]
                },"worker_reviews": {
                  Row: {
                    "author_label": string,"basis": string,"body": string,"created_at": string,"id": string,"job_id": string | null,"profile_id": string,"rating": number,"service_label": string,"tags": (string)[]
                  }
                  ComputedFields: never
                  Insert: {
                    "author_label": string,"basis"?: string,"body"?: string,"created_at"?: string,"id"?: string,"job_id"?: string | null,"profile_id": string,"rating": number,"service_label": string,"tags"?: (string)[]
                  }
                  Update: {
                    "author_label"?: string,"basis"?: string,"body"?: string,"created_at"?: string,"id"?: string,"job_id"?: string | null,"profile_id"?: string,"rating"?: number,"service_label"?: string,"tags"?: (string)[]
                  }
                  Relationships: [
                    {
      foreignKeyName: "worker_reviews_job_id_fkey"
      columns: ["job_id"]
isOneToOne: true
      referencedRelation: "service_jobs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "worker_reviews_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "worker_public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "accept_service_invitation":
{ Args: { "p_invitation_id": string,"p_quote_id": string,"p_quote_version": number }; Returns: string
                           },
"accept_service_quote":
{ Args: { "p_quote_id": string,"p_version": number }; Returns: string
                           },
"accept_terms":
{ Args: { "p_document": string,"p_version": string }; Returns: string
                           },
"account_phone":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"add_request_photo":
{ Args: { "p_path": string,"p_request_id": string }; Returns: string
                           },
"add_worker_certificate":
{ Args: { "p_title": string }; Returns: string
                           },
"add_worker_document":
{ Args: { "p_kind": string,"p_path": string,"p_title": string }; Returns: string
                           },
"advance_service_job":
{ Args: { "p_job_id": string,"p_next": string,"p_version": number }; Returns: number
                           },
"cancel_account_deletion":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"claim_push_deliveries":
{ Args: { "p_limit": number }; Returns: Json
                           },
"clear_kael_history":
{ Args: { "p_mode": string }; Returns: number
                           },
"consent_service_resume":
{ Args: { "p_job_id": string,"p_version": number }; Returns: number
                           },
"customer_pauses":
{ Args: Record<PropertyKey, never>; Returns: {
              "category": string,"created_at": string,"job_id": string,"paused_from_version": number,"prior_stage": string,"resume_requested": boolean
            }[]
                           },
"decide_job_change":
{ Args: { "p_change_id": string,"p_decision": string }; Returns: string
                           },
"decide_service_scope":
{ Args: { "p_decision": string,"p_job_version": number,"p_proposal_id": string,"p_sequence": number }; Returns: string
                           },
"decide_service_submission":
{ Args: { "p_decision": string,"p_reason": string,"p_submission_id": string,"p_version": number }; Returns: string
                           },
"decline_service_invitation":
{ Args: { "p_invitation_id": string,"p_quote_id": string,"p_quote_version": number }; Returns: string
                           },
"export_my_data":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"finish_push_delivery":
{ Args: { "p_error": string,"p_notification_id": string }; Returns: boolean
                           },
"job_worker_cards":
{ Args: Record<PropertyKey, never>; Returns: {
              "display_name": string,"job_id": string,"profile_id": string,"request_id": string,"review_rating": number,"saved": boolean
            }[]
                           },
"kael_actor_capabilities":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"kael_complete_approval":
{ Args: { "p_actor": string,"p_approval_id": string,"p_outcome": string,"p_result": Json,"p_run_id": string }; Returns: Json
                           },
"kael_consume_approval":
{ Args: { "p_actor": string,"p_allowed_tools": (string)[],"p_approval_id": string,"p_fingerprint": string,"p_intent"?: string,"p_run_id": string }; Returns: Json
                           },
"kael_context_summary":
{ Args: { "p_before_seq": number,"p_conversation_id": string,"p_mode": string }; Returns: Json
                           },
"kael_context_tasks":
{ Args: { "p_conversation_id": string,"p_mode": string }; Returns: Json
                           },
"kael_conversation_state":
{ Args: { "p_mode": string }; Returns: Json
                           },
"kael_finish_run":
{ Args: { "p_actor": string,"p_complete": boolean,"p_error": string,"p_input_tokens": number,"p_model": string,"p_output_tokens": number,"p_provider": string,"p_run_id": string,"p_status": string,"p_steps": number,"p_text": string }; Returns: boolean
                           },
"kael_knowledge_search":
{ Args: { "p_limit"?: number,"p_query": string,"p_source_id"?: string,"p_strategy"?: string }; Returns: Json
                           },
"kael_manage_memory":
{ Args: { "p_action": string,"p_mode": string,"p_preference"?: string,"p_previous"?: string,"p_value"?: string }; Returns: boolean
                           },
"kael_pilot_charge":
{ Args: { "p_action": string,"p_actor": string,"p_cached": number,"p_call": string,"p_input": number,"p_model": string,"p_output": number,"p_pilot": string,"p_run": string,"p_thinking": boolean }; Returns: Json
                           },
"kael_pilot_status":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"kael_read_context":
{ Args: { "p_kind": string,"p_resource_id": string }; Returns: Json
                           },
"kael_record_tool":
{ Args: { "p_actor": string,"p_call_id": string,"p_error": string,"p_fingerprint": string,"p_outcome": string,"p_run_id": string,"p_side_effect": string,"p_task_id": string,"p_tool": string }; Returns: boolean
                           },
"kael_reject_approval":
{ Args: { "p_actor": string,"p_approval_id": string,"p_fingerprint": string,"p_run_id": string }; Returns: Json
                           },
"kael_request_approval":
{ Args: { "p_actor": string,"p_args": Json,"p_details": Json,"p_expected_version": number,"p_fingerprint": string,"p_run_id": string,"p_summary": string,"p_task_id": string,"p_tool": string,"p_ttl_seconds": number }; Returns: Json
                           },
"kael_runtime_ready":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"kael_save_task":
{ Args: { "p_actor": string,"p_artifact": Json,"p_conversation_id": string,"p_event": string,"p_expected_version": number,"p_kind": string,"p_run_id": string,"p_status": string,"p_summary": string,"p_task_id": string,"p_title": string }; Returns: Json
                           },
"kael_start_run":
{ Args: { "p_actor": string,"p_conversation_id": string,"p_mode": string,"p_request_id": string,"p_user_text": string }; Returns: Json
                           },
"mark_notifications_read":
{ Args: { "p_ids": (string)[] }; Returns: number
                           },
"my_worker_payout_account":
{ Args: Record<PropertyKey, never>; Returns: {
              "account_holder": string,"account_number": string,"bank_code": string,"bank_name": string,"qr_path": string,"status": string,"updated_at": string
            }[]
                           },
"my_worker_profile":
{ Args: Record<PropertyKey, never>; Returns: {
              "about": string,"accepting_jobs": boolean,"area": string,"certificates": Json,"completed_jobs": number,"display_name": string,"documents": Json,"experience_years": number,"listed": boolean,"missing_items": (string)[],"profile_id": string,"radius_km": number,"rating_average": number,"review_count": number,"reviews": Json,"service_ids": (string)[],"skills": (string)[],"strengths": Json,"trade": string
            }[]
                           },
"open_service_aftercare":
{ Args: { "p_job_id": string,"p_key": string,"p_reason": string }; Returns: string
                           },
"pause_service_job":
{ Args: { "p_category": string,"p_job_id": string,"p_version": number }; Returns: number
                           },
"process_account_deletions":
{ Args: { "p_grace": string }; Returns: number
                           },
"propose_service_scope":
{ Args: { "p_amount": number,"p_job_id": string,"p_key": string,"p_rationale": string,"p_scope": string,"p_version": number }; Returns: string
                           },
"purge_expired_data":
{ Args: { "p_kael_messages_older_than": string,"p_read_notifications_older_than": string }; Returns: Json
                           },
"register_push_token":
{ Args: { "p_platform": string,"p_token": string }; Returns: string
                           },
"reject_service_quote":
{ Args: { "p_quote_id": string,"p_version": number }; Returns: string
                           },
"remove_worker_certificate":
{ Args: { "p_id": string }; Returns: string
                           },
"remove_worker_document":
{ Args: { "p_id": string }; Returns: string
                           },
"remove_worker_payout_account":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"report_service_job":
{ Args: { "p_details": string,"p_job_id": string,"p_key": string,"p_kind": string,"p_version": number }; Returns: string
                           },
"request_account_deletion":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"request_job_change":
{ Args: { "p_job_id": string,"p_kind": string,"p_proposed_for": string,"p_reason": string }; Returns: string
                           },
"request_service_resume":
{ Args: { "p_job_id": string,"p_version": number }; Returns: number
                           },
"review_job_worker":
{ Args: { "p_body": string,"p_job_id": string,"p_rating": number,"p_tags": (string)[] }; Returns: string
                           },
"review_reactions":
{ Args: { "p_review_ids": (string)[] }; Returns: {
              "reacted": boolean,"reaction": string,"review_id": string,"total": number
            }[]
                           },
"save_customer_profile":
{ Args: { "p_address": string,"p_display_name": string,"p_email": string }; Returns: string
                           },
"save_customer_settings":
{ Args: { "p_messages": boolean,"p_promotions": boolean,"p_push": boolean,"p_quotes": boolean,"p_reduce_motion": boolean }; Returns: string
                           },
"save_worker":
{ Args: { "p_profile_id": string }; Returns: string
                           },
"save_worker_coverage":
{ Args: { "p_radius_km": number,"p_service_ids": (string)[] }; Returns: string
                           },
"save_worker_profile":
{ Args: { "p_about": string,"p_area": string,"p_display_name": string,"p_experience_years": number,"p_skills": (string)[],"p_trade": string }; Returns: string
                           },
"saved_workers":
{ Args: Record<PropertyKey, never>; Returns: {
              "area": string,"basis": string,"completed_jobs": number,"display_name": string,"experience_years": number,"profile_id": string,"rating_average": number,"review_count": number,"reviews": Json,"saved_at": string,"service_areas": (string)[],"skills": (string)[],"strengths": Json,"trade": string
            }[]
                           },
"set_consent":
{ Args: { "p_granted": boolean,"p_purpose": string,"p_version": string }; Returns: string
                           },
"set_customer_avatar":
{ Args: { "p_has_avatar": boolean }; Returns: string
                           },
"set_request_pinned":
{ Args: { "p_pinned": boolean,"p_request_id": string }; Returns: boolean
                           },
"set_worker_accepting":
{ Args: { "p_accepting": boolean }; Returns: boolean
                           },
"set_worker_payout_account":
{ Args: { "p_account_holder": string,"p_account_number": string,"p_bank_code": string,"p_bank_name": string,"p_qr_path": string }; Returns: string
                           },
"submit_service_request":
{ Args: { "p_description": string,"p_location"?: string,"p_submission_key": string }; Returns: string
                           },
"submit_service_work":
{ Args: { "p_evidence": string,"p_job_id": string,"p_key": string,"p_version": number }; Returns: string
                           },
"submit_support_request":
{ Args: { "p_body": string,"p_subject": string,"p_submission_key": string }; Returns: string
                           },
"toggle_review_reaction":
{ Args: { "p_reaction": string,"p_review_id": string }; Returns: boolean
                           },
"unregister_push_token":
{ Args: { "p_token": string }; Returns: boolean
                           },
"unsave_worker":
{ Args: { "p_profile_id": string }; Returns: string
                           },
"worker_corrections":
{ Args: Record<PropertyKey, never>; Returns: {
              "job_id": string,"note": string,"submitted_from_version": number
            }[]
                           },
"worker_earnings":
{ Args: Record<PropertyKey, never>; Returns: {
              "accepted_at": string,"amount_minor": number,"completed_on": string,"currency": string,"job_id": string,"title": string
            }[]
                           },
"worker_job_cards":
{ Args: Record<PropertyKey, never>; Returns: {
              "customer_label": string,"description": string,"kind": string,"location": string,"photo_count": number,"ref_id": string,"title": string,"updated_at": string
            }[]
                           },
"worker_jobs":
{ Args: Record<PropertyKey, never>; Returns: {
              "amount_minor": number,"currency": string,"job_id": string,"scope": string,"stage": string,"version": number
            }[]
                           },
"worker_offers":
{ Args: Record<PropertyKey, never>; Returns: {
              "amount_minor": number,"basis": string,"currency": string,"expires_at": string,"invitation_id": string,"quote_id": string,"quote_version": number,"scope": string
            }[]
                           },
"worker_pauses":
{ Args: Record<PropertyKey, never>; Returns: {
              "category": string,"created_at": string,"job_id": string,"paused_from_version": number,"prior_stage": string,"resume_requested": boolean
            }[]
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {

          }
        }
} as const
