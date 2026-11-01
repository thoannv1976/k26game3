import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { Storage } from '@google-cloud/storage';

export interface BlobStore {
  put(path: string, data: Buffer, contentType: string): Promise<void>;
  get(path: string): Promise<Buffer | null>;
  exists(path: string): Promise<boolean>;
  deletePrefix(prefix: string): Promise<void>;
}

export class GcsBlobStore implements BlobStore {
  private readonly bucket;
  constructor(bucketName: string) {
    this.bucket = new Storage().bucket(bucketName);
  }
  async put(path: string, data: Buffer, contentType: string) {
    await this.bucket.file(path).save(data, { contentType, resumable: false });
  }
  async get(path: string) {
    try {
      const [buf] = await this.bucket.file(path).download();
      return buf;
    } catch (e) {
      if ((e as { code?: number }).code === 404) return null;
      throw e;
    }
  }
  async exists(path: string) {
    const [ok] = await this.bucket.file(path).exists();
    return ok;
  }
  async deletePrefix(prefix: string) {
    await this.bucket.deleteFiles({ prefix, force: true });
  }
}

export class MemoryBlobStore implements BlobStore {
  readonly files = new Map<string, Buffer>();
  async put(path: string, data: Buffer) {
    this.files.set(path, data);
  }
  async get(path: string) {
    return this.files.get(path) ?? null;
  }
  async exists(path: string) {
    return this.files.has(path);
  }
  async deletePrefix(prefix: string) {
    for (const k of [...this.files.keys()]) if (k.startsWith(prefix)) this.files.delete(k);
  }
}

/** Local disk store for development. */
export class LocalBlobStore implements BlobStore {
  private readonly root: string;
  constructor(dir: string) {
    this.root = resolve(dir);
  }
  private file(path: string) {
    const p = resolve(join(this.root, path));
    if (!p.startsWith(this.root)) throw new Error('Invalid path');
    return p;
  }
  async put(path: string, data: Buffer) {
    const f = this.file(path);
    await mkdir(dirname(f), { recursive: true });
    await writeFile(f, data);
  }
  async get(path: string) {
    try {
      return await readFile(this.file(path));
    } catch {
      return null;
    }
  }
  async exists(path: string) {
    try {
      await stat(this.file(path));
      return true;
    } catch {
      return false;
    }
  }
  async deletePrefix(prefix: string) {
    await rm(this.file(prefix), { recursive: true, force: true });
  }
}
