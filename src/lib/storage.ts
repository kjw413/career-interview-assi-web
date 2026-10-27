import type { Project } from '../types';
import { createDemoProject } from './demo';

export const DATABASE_NAME = 'folio-interview';
const DATABASE_VERSION = 1;
let connection: Promise<IDBDatabase> | undefined;

function openDatabase(): Promise<IDBDatabase> {
  if (connection) return connection;
  connection = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('이 브라우저에서는 저장소를 사용할 수 없습니다. 최신 브라우저에서 열어 주세요.'));
      return;
    }
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      database.createObjectStore('projects', { keyPath: 'id' });
      database.createObjectStore('files', { keyPath: 'projectId' });
      database.createObjectStore('meta');
    };
    request.onerror = () => reject(request.error ?? new Error('저장소를 열지 못했습니다.'));
    request.onblocked = () => reject(new Error('다른 탭을 닫고 다시 시도해 주세요.'));
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => {
        database.close();
        connection = undefined;
      };
      resolve(database);
    };
  });
  connection.catch(() => { connection = undefined; });
  return connection;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('저장소 요청에 실패했습니다.'));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error('저장 작업이 취소되었습니다.'));
    transaction.onerror = () => reject(transaction.error ?? new Error('저장 공간을 확인해 주세요.'));
  });
}

async function initialize(database: IDBDatabase): Promise<void> {
  const transaction = database.transaction(['projects', 'meta'], 'readwrite');
  const done = transactionDone(transaction);
  const meta = transaction.objectStore('meta');
  const marker = meta.get('initialized');
  marker.onsuccess = () => {
    if (marker.result) return;
    const projects = transaction.objectStore('projects');
    const count = projects.count();
    count.onsuccess = () => {
      // Never overwrite data if a newer app already wrote projects before initialization.
      if (count.result === 0) projects.put(createDemoProject());
      meta.put(true, 'initialized');
    };
  };
  await done;
}

export async function listProjects(): Promise<Project[]> {
  const database = await openDatabase();
  await initialize(database);
  const transaction = database.transaction('projects', 'readonly');
  const done = transactionDone(transaction);
  const projects = await requestResult<Project[]>(transaction.objectStore('projects').getAll());
  await done;
  return projects.sort((left, right) => right.updatedAt - left.updatedAt);
}

export async function saveProject(project: Project): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction('projects', 'readwrite');
  const done = transactionDone(transaction);
  transaction.objectStore('projects').put(project);
  await done;
}

/** Delete the document and preparation atomically, including a potentially large PDF blob. */
export async function deleteProject(id: string): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(['projects', 'files'], 'readwrite');
  const done = transactionDone(transaction);
  transaction.objectStore('projects').delete(id);
  transaction.objectStore('files').delete(id);
  await done;
}

export async function putResumeFile(projectId: string, file: File | Blob): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction('files', 'readwrite');
  const done = transactionDone(transaction);
  transaction.objectStore('files').put({ projectId, file });
  await done;
}

export async function getResumeFile(projectId: string): Promise<Blob | undefined> {
  const database = await openDatabase();
  const transaction = database.transaction('files', 'readonly');
  const done = transactionDone(transaction);
  const record = await requestResult<{ projectId: string; file: Blob } | undefined>(
    transaction.objectStore('files').get(projectId),
  );
  await done;
  return record?.file;
}

/** Used for clean shutdown in tests; app data remains untouched. */
export async function closeStorage(): Promise<void> {
  if (connection) (await connection).close();
  connection = undefined;
}
