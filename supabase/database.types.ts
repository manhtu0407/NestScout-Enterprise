
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {

  "public": {
          Tables: {
            "service_cases": {
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
                    "created_at": string,"description": string,"id": string,"owner_id": string,"submission_key": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"description": string,"id"?: string,"owner_id"?: string,"submission_key": string
                  }
                  Update: {
                    "created_at"?: string,"description"?: string,"id"?: string,"owner_id"?: string,"submission_key"?: string
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
"advance_service_job":
{ Args: { "p_job_id": string,"p_next": string,"p_version": number }; Returns: number
                           },
"consent_service_resume":
{ Args: { "p_job_id": string,"p_version": number }; Returns: number
                           },
"customer_pauses":
{ Args: Record<PropertyKey, never>; Returns: {
              "category": string,"created_at": string,"job_id": string,"paused_from_version": number,"prior_stage": string,"resume_requested": boolean
            }[]
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
"kael_read_context":
{ Args: { "p_kind": string,"p_resource_id": string }; Returns: Json
                           },
"open_service_aftercare":
{ Args: { "p_job_id": string,"p_key": string,"p_reason": string }; Returns: string
                           },
"pause_service_job":
{ Args: { "p_category": string,"p_job_id": string,"p_version": number }; Returns: number
                           },
"propose_service_scope":
{ Args: { "p_amount": number,"p_job_id": string,"p_key": string,"p_rationale": string,"p_scope": string,"p_version": number }; Returns: string
                           },
"reject_service_quote":
{ Args: { "p_quote_id": string,"p_version": number }; Returns: string
                           },
"report_service_job":
{ Args: { "p_details": string,"p_job_id": string,"p_key": string,"p_kind": string,"p_version": number }; Returns: string
                           },
"request_service_resume":
{ Args: { "p_job_id": string,"p_version": number }; Returns: number
                           },
"submit_service_request":
{ Args: { "p_description": string,"p_submission_key": string }; Returns: string
                           },
"submit_service_work":
{ Args: { "p_evidence": string,"p_job_id": string,"p_key": string,"p_version": number }; Returns: string
                           },
"worker_corrections":
{ Args: Record<PropertyKey, never>; Returns: {
              "job_id": string,"note": string,"submitted_from_version": number
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
