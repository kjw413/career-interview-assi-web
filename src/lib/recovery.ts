import type { Project } from '../types';
export interface RecoveryDraft { key: string; userId: string; project: Project; token: string }
const name = 'folio-cloud-recovery';
async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('drafts', { keyPath: 'key' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function transaction<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore, result: (value: T) => void) => void): Promise<T> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('drafts', mode);
    let value: T;
    tx.oncomplete = () => { db.close(); resolve(value); };
    tx.onerror = tx.onabort = () => { db.close(); reject(tx.error); };
    run(tx.objectStore('drafts'), (result) => { value = result; });
  });
}
export async function journalDraft(userId: string, project: Project): Promise<string> {
  const token = crypto.randomUUID();
  await transaction<void>('readwrite', (store) => { store.put({ key: `${userId}/${project.id}`, userId, project, token }); });
  return token;
}
export async function clearDraft(userId: string, projectId: string, token: string): Promise<void> {
  await transaction<void>('readwrite', (store) => {
    const key = `${userId}/${projectId}`;
    const request = store.get(key);
    request.onsuccess = () => { if (request.result?.token === token) store.delete(key); };
  });
}
export async function recoveryDrafts(userId: string): Promise<RecoveryDraft[]> {
  return transaction<RecoveryDraft[]>('readonly', (store, result) => {
    const request = store.getAll();
    request.onsuccess = () => result((request.result as RecoveryDraft[]).filter((entry) => entry.userId === userId));
  });
}
