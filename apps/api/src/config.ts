/** Runtime configuration from environment variables (see .env.example). */
export interface AppConfig {
  env: 'development' | 'test' | 'production';
  port: number;
  projectId: string;
  /** VSTEP Quest uses its own Firestore database ("vstep") in the shared K26 project. */
  firestoreDatabase: string;
  vertexLocation: string;
  geminiModel: string | null;
  aiProvider: 'vertex' | 'fake';
  speechProvider: 'google' | 'fake';
  ttsProvider: 'google' | 'fake';
  blobStore: 'gcs' | 'local' | 'memory';
  audioBucket: string;
  localDataDir: string;
  sttModel: string;
  sttLanguage: string;
  aiTimeoutMs: number;
  gradingTimeoutMs: number;
  aiMaxRetries: number;
  logLevel: string;
  rateLimitPerMinute: number;
  /** Service accounts allowed to call /internal/jobs (Cloud Scheduler) – comma separated e-mails. */
  jobsInvokers: string[];
  /** Audience expected in Cloud Scheduler OIDC tokens (the Cloud Run URL). */
  jobsAudience: string;
  /** Read-only links to the other K26 games' LMS APIs (Cloud Run URLs); empty = disabled. */
  peerCityUrl: string;
  peerDetectiveUrl: string;
}

const str = (name: string, def: string) => {
  const v = process.env[name];
  return v === undefined || v === '' ? def : v;
};

export function loadConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  const env = str('NODE_ENV', 'development') as AppConfig['env'];
  const prod = env === 'production';
  const projectId = str('GCP_PROJECT_ID', str('GOOGLE_CLOUD_PROJECT', str('GCLOUD_PROJECT', 'demo-vq')));
  const cfg: AppConfig = {
    env,
    port: Number(str('PORT', '8080')),
    projectId,
    firestoreDatabase: str('FIRESTORE_DATABASE', 'vstep'),
    vertexLocation: str('VERTEX_LOCATION', 'global'),
    geminiModel: process.env.GEMINI_MODEL || null,
    aiProvider: str('AI_PROVIDER', prod ? 'vertex' : 'fake') as AppConfig['aiProvider'],
    speechProvider: str('SPEECH_PROVIDER', prod ? 'google' : 'fake') as AppConfig['speechProvider'],
    ttsProvider: str('TTS_PROVIDER', prod ? 'google' : 'fake') as AppConfig['ttsProvider'],
    blobStore: str('BLOB_STORE', prod ? 'gcs' : 'local') as AppConfig['blobStore'],
    audioBucket: str('AUDIO_BUCKET', `${projectId}-vstep-audio`),
    localDataDir: str('LOCAL_DATA_DIR', '.data'),
    sttModel: str('STT_MODEL', 'latest_long'),
    sttLanguage: str('STT_LANGUAGE', 'en-US'),
    aiTimeoutMs: Number(str('AI_TIMEOUT_MS', '20000')),
    gradingTimeoutMs: Number(str('GRADING_TIMEOUT_MS', '60000')),
    aiMaxRetries: Number(str('AI_MAX_RETRIES', '2')),
    logLevel: str('LOG_LEVEL', prod ? 'info' : 'debug'),
    rateLimitPerMinute: Number(str('RATE_LIMIT_PER_MINUTE', '300')),
    jobsInvokers: str('JOBS_INVOKERS', '').split(',').map((s) => s.trim()).filter(Boolean),
    jobsAudience: str('JOBS_AUDIENCE', ''),
    peerCityUrl: str('PEER_CITY_URL', ''),
    peerDetectiveUrl: str('PEER_DETECTIVE_URL', ''),
    ...overrides,
  };
  assertSafeConfig(cfg);
  return cfg;
}

/** Offline providers exist for development and tests only. */
export function assertSafeConfig(cfg: AppConfig): void {
  if (cfg.env !== 'production') return;
  const bad: string[] = [];
  if (cfg.aiProvider !== 'vertex') bad.push('AI_PROVIDER');
  if (cfg.speechProvider !== 'google') bad.push('SPEECH_PROVIDER');
  if (cfg.ttsProvider !== 'google') bad.push('TTS_PROVIDER');
  if (cfg.blobStore !== 'gcs') bad.push('BLOB_STORE');
  if (bad.length) throw new Error(`Refusing to start in production with offline providers: ${bad.join(', ')}`);
}
