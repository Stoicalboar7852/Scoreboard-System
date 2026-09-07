import { RuleViolationError, UpstreamError } from '../errors.js';

export const GRAPH_API_VERSION = 'v21.0';

export interface FacebookConfig {
  enabled: boolean;
  pageId?: string | undefined;
  accessToken?: string | undefined;
}

export interface FacebookStatus {
  /** Flag on and page id + token present. */
  enabled: boolean;
  /** Flag on but a page id or token is missing (surfaced so the admin can fix the environment). */
  misconfigured: boolean;
  pageId: string | null;
}

export interface FacebookPostResult {
  postId: string;
  url: string;
}

interface GraphPhotoResponse {
  id?: string;
  post_id?: string;
  error?: { message?: string; type?: string; code?: number };
}

/**
 * Optional "post ladder snapshot to a Facebook Page" integration (§7.7), behind FACEBOOK_ENABLED.
 * Uses the Graph API `POST /{page-id}/photos` with the page access token in the multipart body
 * (never in the URL, so it cannot leak through logs). All failures become typed errors.
 */
export class FacebookService {
  constructor(
    private readonly cfg: FacebookConfig,
    private readonly fetchImpl: typeof fetch = globalThis.fetch,
    private readonly baseUrl = `https://graph.facebook.com/${GRAPH_API_VERSION}`,
  ) {}

  get enabled(): boolean {
    return this.cfg.enabled && Boolean(this.cfg.pageId) && Boolean(this.cfg.accessToken);
  }

  status(): FacebookStatus {
    return {
      enabled: this.enabled,
      misconfigured: this.cfg.enabled && !this.enabled,
      pageId: this.enabled ? (this.cfg.pageId ?? null) : null,
    };
  }

  async postPhoto(png: Uint8Array, caption: string): Promise<FacebookPostResult> {
    if (!this.enabled)
      throw new RuleViolationError(
        'Facebook posting is not enabled (set FACEBOOK_ENABLED, FACEBOOK_PAGE_ID and FACEBOOK_PAGE_ACCESS_TOKEN)',
      );
    const form = new FormData();
    form.set('source', new Blob([new Uint8Array(png)], { type: 'image/png' }), 'ladder.png');
    form.set('caption', caption);
    form.set('published', 'true');
    form.set('access_token', this.cfg.accessToken ?? '');
    const url = `${this.baseUrl}/${encodeURIComponent(this.cfg.pageId ?? '')}/photos`;

    let response: Response;
    try {
      response = await this.fetchImpl(url, { method: 'POST', body: form });
    } catch (err) {
      throw new UpstreamError('Facebook is unreachable', {
        cause: err instanceof Error ? err.message : String(err),
      });
    }
    const body = (await response.json().catch(() => null)) as GraphPhotoResponse | null;
    if (!response.ok || !body?.id) {
      throw new UpstreamError(
        `Facebook rejected the post: ${body?.error?.message ?? `HTTP ${response.status}`}`,
        { status: response.status, code: body?.error?.code ?? null },
      );
    }
    const postId = body.post_id ?? body.id;
    return { postId, url: `https://www.facebook.com/${postId}` };
  }
}
