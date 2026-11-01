import type { Auth } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';
import { FakeAiProvider, VertexAiProvider, type AiProvider } from '@vq/ai';
import { GcsBlobStore, LocalBlobStore, MemoryBlobStore, type BlobStore } from './blob.js';
import type { AppConfig } from './config.js';
import { adminAuth, firestore } from './firebase.js';
import { FakeSpeechToText, GoogleSpeechToText, type SpeechToText } from './speech/stt.js';
import { FakeTextToSpeech, GoogleTextToSpeech, type TextToSpeech } from './speech/tts.js';
import { HttpPeerClient, NoPeerClient, type PeerClient } from './services/peers.js';

export interface Deps {
  config: AppConfig;
  db: Firestore;
  auth: Auth;
  ai: AiProvider;
  stt: SpeechToText;
  tts: TextToSpeech;
  blobs: BlobStore;
  peers: PeerClient;
  now: () => Date;
}

export function createDeps(config: AppConfig, o: Partial<Deps> = {}): Deps {
  return {
    config,
    db: o.db ?? firestore(config.projectId, config.firestoreDatabase),
    auth: o.auth ?? adminAuth(config.projectId),
    ai: o.ai ?? (config.aiProvider === 'vertex' ? new VertexAiProvider(config.projectId, config.vertexLocation) : new FakeAiProvider()),
    stt: o.stt ?? (config.speechProvider === 'google' ? new GoogleSpeechToText(config.sttModel, config.sttLanguage) : new FakeSpeechToText()),
    tts: o.tts ?? (config.ttsProvider === 'google' ? new GoogleTextToSpeech() : new FakeTextToSpeech()),
    blobs: o.blobs ?? (config.blobStore === 'gcs' ? new GcsBlobStore(config.audioBucket) : config.blobStore === 'local' ? new LocalBlobStore(config.localDataDir) : new MemoryBlobStore()),
    peers: o.peers ?? (config.peerCityUrl || config.peerDetectiveUrl ? new HttpPeerClient(config.peerCityUrl, config.peerDetectiveUrl) : new NoPeerClient()),
    now: o.now ?? (() => new Date()),
  };
}
