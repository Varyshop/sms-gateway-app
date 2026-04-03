import {
  HeartbeatResponse,
  PendingSmsResponse,
  ConfirmResponse,
  InboundSmsResponse,
  InboundHistoryResponse,
  StatsResponse,
  CampaignTemplate,
  CampaignFilter,
  CampaignPreview,
  CampaignListResponse,
  CampaignCreateResponse,
  CampaignStatusResponse,
} from '../types';

const API_KEY_HEADER = 'X-API-Key';
const DEFAULT_TIMEOUT = 30000;

export class GatewayApiClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.apiKey = apiKey;
  }

  private async request<T>(
    endpoint: string,
    body: Record<string, unknown> = {}
  ): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [API_KEY_HEADER]: this.apiKey,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Request timeout');
      }
      throw error;
    }
  }

  async heartbeat(
    phoneNumbers: string[],
    batteryLevel?: number,
    signalStrength?: number
  ): Promise<HeartbeatResponse> {
    return this.request<HeartbeatResponse>('/sms-gateway/heartbeat', {
      phone_numbers: phoneNumbers,
      battery_level: batteryLevel,
      signal_strength: signalStrength,
    });
  }

  async getPendingSms(
    phoneNumbers: string[],
    limit: number = 20
  ): Promise<PendingSmsResponse> {
    return this.request<PendingSmsResponse>('/sms-gateway/pending', {
      phone_numbers: phoneNumbers,
      limit,
    });
  }

  async confirmSms(
    smsId: number,
    status: 'sending' | 'sent' | 'error',
    errorMessage?: string
  ): Promise<ConfirmResponse> {
    const body: Record<string, unknown> = { status };
    if (errorMessage) {
      body.error_message = errorMessage;
    }
    return this.request<ConfirmResponse>(`/sms-gateway/confirm/${smsId}`, body);
  }

  async reportInboundSms(
    fromNumber: string,
    message: string,
    toNumber: string
  ): Promise<InboundSmsResponse> {
    return this.request<InboundSmsResponse>('/sms-gateway/inbound', {
      from_number: fromNumber,
      message,
      to_number: toNumber,
    });
  }

  async getStats(): Promise<StatsResponse> {
    return this.request<StatsResponse>('/sms-gateway/stats');
  }

  async getInboundHistory(
    limit: number = 50,
    offset: number = 0,
    filter: 'all' | 'stop' | 'stop_not_blacklisted' = 'all',
    search?: string
  ): Promise<InboundHistoryResponse> {
    const body: Record<string, unknown> = {
      limit,
      offset,
      stop_only: filter === 'stop',
      stop_not_blacklisted: filter === 'stop_not_blacklisted',
    };
    if (search) body.search = search;
    return this.request<InboundHistoryResponse>('/sms-gateway/inbound-history', body);
  }

  async blacklistInbound(ids: number[]): Promise<{ success: boolean; blacklisted: number }> {
    return this.request<{ success: boolean; blacklisted: number }>('/sms-gateway/inbound-blacklist', {
      ids,
    });
  }

  async registerFcmToken(fcmToken: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>('/sms-gateway/register-fcm', {
      fcm_token: fcmToken,
    });
  }

  // Campaign / Marketing Template methods

  async getCampaignTemplates(): Promise<{ success: boolean; templates: CampaignTemplate[] }> {
    return this.request<{ success: boolean; templates: CampaignTemplate[] }>(
      '/sms-gateway/campaign/templates',
    );
  }

  async getCampaignFilters(templateId: number): Promise<{ success: boolean; filters: CampaignFilter[] }> {
    return this.request<{ success: boolean; filters: CampaignFilter[] }>(
      '/sms-gateway/campaign/filters',
      { template_id: templateId },
    );
  }

  async getCampaignPreview(
    templateId: number,
    segmentId: number,
    limit: number,
  ): Promise<CampaignPreview> {
    return this.request<CampaignPreview>('/sms-gateway/campaign/preview', {
      template_id: templateId,
      segment_id: segmentId,
      limit,
    });
  }

  async createCampaign(
    templateId: number,
    segmentId: number,
    limit: number,
  ): Promise<CampaignCreateResponse> {
    return this.request<CampaignCreateResponse>('/sms-gateway/campaign/create', {
      template_id: templateId,
      segment_id: segmentId,
      limit,
    });
  }

  async getCampaigns(): Promise<CampaignListResponse> {
    return this.request<CampaignListResponse>('/sms-gateway/campaign/list');
  }

  async getCampaignStatus(mailingId: number): Promise<CampaignStatusResponse> {
    return this.request<CampaignStatusResponse>(
      `/sms-gateway/campaign/status/${mailingId}`,
    );
  }
}

let clientInstance: GatewayApiClient | null = null;

export function getApiClient(): GatewayApiClient | null {
  return clientInstance;
}

export function initializeApiClient(baseUrl: string, apiKey: string): GatewayApiClient {
  clientInstance = new GatewayApiClient(baseUrl, apiKey);
  return clientInstance;
}

export function clearApiClient(): void {
  clientInstance = null;
}
