export interface PendingSms {
  id: number;
  phone_number: string;
  message: string;
  uuid: string;
  gateway_phone_number: string;
}

export interface PhoneStats {
  id: number;
  name: string;
  phone_number: string;
  phone_number_2: string | null;
  state: 'online' | 'offline';
  sent_today: number;
  daily_limit: number;
  sent_month: number;
  monthly_limit: number;
  sent_total: number;
  pending_count: number;
  rate_limit: number;
}

export interface PhoneCounters {
  sent_today: number;
  daily_limit: number;
  sent_month: number;
  monthly_limit: number;
  sent_total: number;
}

export interface HeartbeatResponse {
  success: boolean;
  pending_count: Record<string, number>;
  rate_limit: number;
  phone_stats?: Record<string, PhoneCounters>;
}

export interface PendingSmsResponse {
  success: boolean;
  sms_list: PendingSms[];
}

export interface ConfirmResponse {
  success: boolean;
}

export interface InboundSmsResponse {
  success: boolean;
  blacklisted: boolean;
  partner_found: boolean;
}

export interface StatsResponse {
  success: boolean;
  phones: PhoneStats[];
}

export interface QrCodeData {
  type: 'sms_gateway';
  url: string;
  api_key: string;
}

export interface InboundSmsItem {
  id: number;
  from_number: string;
  to_number: string;
  message: string;
  received_at: string;
  is_stop: boolean;
  blacklisted: boolean;
  partner_name: string;
}

export interface InboundHistoryResponse {
  success: boolean;
  messages: InboundSmsItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface SmsHistoryItem {
  id: number;
  phone_number: string;
  message: string;
  status: 'sent' | 'error' | 'pending';
  timestamp: number;
  error_message?: string;
}

// Campaign / Marketing Templates

export interface CampaignSegment {
  id: number;
  name: string;
  code: string;
}

export interface CampaignTemplate {
  id: number;
  name: string;
  body: string;
  segments: CampaignSegment[];
  default_limit: number;
  max_limit: number;
  exclude_contacted_days: number;
}

export interface CampaignFilter {
  id: number;
  code: string;
  name: string;
  description: string;
  recipient_count: number;
}

export interface CampaignPreview {
  success: boolean;
  recipient_count: number;
  preview_text: string;
  template_name: string;
  segment_name: string;
}

export interface CampaignSummary {
  id: number;
  name: string;
  state: string;
  paused: boolean;
  active: boolean;
  date_created: string;
  total: number;
  sent: number;
  pending: number;
  error: number;
  clicked: number;
  total_clicks: number;
  order_count: number;
  revenue: number;
  optout: number;
  // Detail fields (populated from status endpoint)
  sent_date?: string;
  body_plaintext?: string;
  sms_allow_unsubscribe?: boolean;
  exclude_contacted_days?: number;
}

export interface CampaignListResponse {
  success: boolean;
  campaigns: CampaignSummary[];
}

export interface CampaignCreateResponse {
  success: boolean;
  campaign_id: number;
  recipient_count: number;
  state: string;
}

export interface CampaignAssignSimResponse {
  success: boolean;
  assigned: number;
  message?: string;
}

export interface CampaignStatusResponse {
  success: boolean;
  id: number;
  name: string;
  state: string;
  paused: boolean;
  active: boolean;
  total: number;
  sent: number;
  pending: number;
  error: number;
  clicked: number;
  total_clicks: number;
  order_count: number;
  revenue: number;
  optout: number;
  created_at: string;
  sent_date: string;
  body_plaintext: string;
  sms_allow_unsubscribe: boolean;
  exclude_contacted_days: number;
}
