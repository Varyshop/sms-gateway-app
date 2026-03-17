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

export interface SmsHistoryItem {
  id: number;
  phone_number: string;
  message: string;
  status: 'sent' | 'error' | 'pending';
  timestamp: number;
  error_message?: string;
}
