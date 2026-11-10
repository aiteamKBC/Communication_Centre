import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { EventMedia } from '../../../mocks/events';
import { csrfToken } from '../../../utils/apiSession';

export const MAX_EVENT_IMAGE_SIZE_MB = 10;
export const MAX_EVENT_IMAGE_SIZE_BYTES = MAX_EVENT_IMAGE_SIZE_MB * 1024 * 1024;
export const EVENT_IMAGE_MAX_DIMENSION = 2400;
export const EVENT_IMAGE_QUALITY = 0.86;
export const EVENT_GALLERY_UPLOAD_CONCURRENCY = 2;

export type EventMediaUploadStatus = 'queued' | 'uploading' | 'uploaded' | 'failed' | 'rejected';
export type EventMediaBatchKind = 'cover' | 'gallery' | 'migration';

export type EventMediaUploadItem = {
  id: string;
  name: string;
  kind: 'image';
  previewUrl: string;
  uploadedUrl: string;
  status: EventMediaUploadStatus;
  progress: number;
  error: string;
  file?: File;
  batchId?: string;
  batchKind?: EventMediaBatchKind;
  revokePreview?: boolean;
  sourceKey?: string;
};

type UploadBatch = {
  id: string;
  kind: EventMediaBatchKind;
  total: number;
};

type UseEventMediaUploadsOptions = {
  concurrency?: number;
  onBatchUploaded?: (batch: UploadBatch) => void;
};

type SelectFilesOptions = {
  replace?: boolean;
  batchKind: EventMediaBatchKind;
};

type SelectFilesResult = {
  acceptedCount: number;
  rejectedMessages: string[];
};

function uniqueId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function isImageDataUrl(value: string | undefined): value is string {
  return Boolean(value?.startsWith('data:image/'));
}

export function containsUnsafeDataImage(value: string | undefined): boolean {
  return isImageDataUrl(value);
}

function isObjectUrl(value: string): boolean {
  return value.startsWith('blob:');
}

function revokeItemPreview(item: EventMediaUploadItem) {
  if (item.revokePreview && isObjectUrl(item.previewUrl)) {
    URL.revokeObjectURL(item.previewUrl);
  }
}

function validateImageFile(file: File): string | null {
  if (!file.type.startsWith('image/')) {
    return `${file.name} was not uploaded because only image files are supported.`;
  }
  if (file.size > MAX_EVENT_IMAGE_SIZE_BYTES) {
    return `${file.name} is too large. Maximum allowed size is ${MAX_EVENT_IMAGE_SIZE_MB}MB.`;
  }
  return null;
}

function fileSourceKey(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function dataUrlToFile(value: string, fallbackName: string): File {
  const [header = '', data = ''] = value.split(',');
  const mime = header.match(/data:([^;]+)/)?.[1] || 'image/jpeg';
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  const extension = mime.split('/')[1] || 'jpg';
  return new File([bytes], `${fallbackName}.${extension}`, { type: mime });
}

async function resizeEventImage(file: File): Promise<File> {
  return new Promise(resolve => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const scale = Math.min(1, EVENT_IMAGE_MAX_DIMENSION / Math.max(image.width, image.height));

      if (scale >= 1) {
        resolve(file);
        return;
      }

      const canvas = document.createElement('canvas');
      canvas.width = Math.round(image.width * scale);
      canvas.height = Math.round(image.height * scale);
      canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        blob => resolve(blob ? new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }) : file),
        'image/jpeg',
        EVENT_IMAGE_QUALITY,
      );
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(file);
    };

    image.src = objectUrl;
  });
}

function uploadImageWithProgress(file: File, onProgress: (progress: number) => void) {
  const xhr = new XMLHttpRequest();
  const promise = new Promise<string>((resolve, reject) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('folder', 'events');

    xhr.upload.onprogress = event => {
      if (!event.lengthComputable) return;
      onProgress(Math.max(1, Math.min(99, Math.round((event.loaded / event.total) * 100))));
    };

    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(xhr.responseText || `Upload failed with status ${xhr.status}`));
        return;
      }

      try {
        const payload = JSON.parse(xhr.responseText) as { url?: string };
        if (!payload.url) {
          reject(new Error('Upload response did not include a file URL.'));
          return;
        }
        resolve(payload.url);
      } catch {
        reject(new Error('Upload response was not valid JSON.'));
      }
    };

    xhr.onerror = () => reject(new Error('Network error while uploading image.'));
    xhr.onabort = () => reject(new DOMException('Upload cancelled.', 'AbortError'));
    xhr.open('POST', '/api/upload-image/');
    xhr.setRequestHeader('X-CSRFToken', csrfToken());
    xhr.send(formData);
  });

  return {
    promise,
    abort: () => xhr.abort(),
  };
}

export function useEventMediaUploads(options: UseEventMediaUploadsOptions = {}) {
  const concurrency = options.concurrency ?? EVENT_GALLERY_UPLOAD_CONCURRENCY;
  const [items, setItems] = useState<EventMediaUploadItem[]>([]);
  const itemsRef = useRef<EventMediaUploadItem[]>([]);
  const mountedRef = useRef(true);
  const activeUploadsRef = useRef<Record<string, () => void>>({});
  const startedUploadsRef = useRef(new Set<string>());
  const completedBatchesRef = useRef(new Set<string>());
  const onBatchUploadedRef = useRef(options.onBatchUploaded);

  useEffect(() => {
    onBatchUploadedRef.current = options.onBatchUploaded;
  }, [options.onBatchUploaded]);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      Object.values(activeUploadsRef.current).forEach(abort => abort());
      itemsRef.current.forEach(revokeItemPreview);
    };
  }, []);

  const safeSetItems = useCallback((updater: React.SetStateAction<EventMediaUploadItem[]>) => {
    if (mountedRef.current) setItems(updater);
  }, []);

  const clear = useCallback(() => {
    Object.values(activeUploadsRef.current).forEach(abort => abort());
    activeUploadsRef.current = {};
    startedUploadsRef.current.clear();
    completedBatchesRef.current.clear();
    itemsRef.current.forEach(revokeItemPreview);
    safeSetItems([]);
  }, [safeSetItems]);

  const selectFiles = useCallback((files: File[], selectOptions: SelectFilesOptions): SelectFilesResult => {
    const rejectedMessages: string[] = [];
    const batchId = uniqueId(selectOptions.batchKind);
    const nextItems: EventMediaUploadItem[] = [];
    const existingSourceKeys = new Set(itemsRef.current.map(item => item.sourceKey).filter(Boolean));

    files.forEach(file => {
      const sourceKey = fileSourceKey(file);
      if (existingSourceKeys.has(sourceKey)) {
        const error = `${file.name} is already selected.`;
        rejectedMessages.push(error);
        nextItems.push({
          id: uniqueId('rejected'),
          name: file.name,
          kind: 'image',
          previewUrl: '',
          uploadedUrl: '',
          status: 'rejected',
          progress: 0,
          error,
          batchKind: selectOptions.batchKind,
          sourceKey,
        });
        return;
      }

      const error = validateImageFile(file);
      if (error) {
        rejectedMessages.push(error);
        nextItems.push({
          id: uniqueId('rejected'),
          name: file.name,
          kind: 'image',
          previewUrl: '',
          uploadedUrl: '',
          status: 'rejected',
          progress: 0,
          error,
          batchKind: selectOptions.batchKind,
          sourceKey,
        });
        return;
      }

      nextItems.push({
        id: uniqueId('media'),
        name: file.name,
        kind: 'image',
        previewUrl: URL.createObjectURL(file),
        uploadedUrl: '',
        status: 'queued',
        progress: 0,
        error: '',
        file,
        batchId,
        batchKind: selectOptions.batchKind,
        revokePreview: true,
        sourceKey,
      });
      existingSourceKeys.add(sourceKey);
    });

    safeSetItems(current => {
      if (selectOptions.replace) {
        const hasAcceptedReplacement = nextItems.some(item => item.status === 'queued');
        if (!hasAcceptedReplacement) {
          return [...current, ...nextItems];
        }
        current.forEach(item => {
          if (item.status === 'uploading') activeUploadsRef.current[item.id]?.();
          revokeItemPreview(item);
        });
        return nextItems;
      }
      return [...current, ...nextItems];
    });

    return {
      acceptedCount: nextItems.filter(item => item.status === 'queued').length,
      rejectedMessages,
    };
  }, [safeSetItems]);

  const setUploadedMedia = useCallback((media: EventMedia[]) => {
    clear();
    safeSetItems(media.map(item => ({
      id: item.id || uniqueId('uploaded'),
      name: item.name || 'Uploaded image',
      kind: 'image',
      previewUrl: item.url,
      uploadedUrl: item.url,
      status: 'uploaded',
      progress: 100,
      error: '',
    })));
  }, [clear, safeSetItems]);

  const setExistingMedia = useCallback((media: EventMedia[]) => {
    clear();
    const nextItems = media.map((item, index): EventMediaUploadItem => {
      if (isImageDataUrl(item.url)) {
        const file = dataUrlToFile(item.url, item.name || `event-image-${index + 1}`);
        return {
          id: item.id || uniqueId('migration'),
          name: item.name || file.name,
          kind: 'image',
          previewUrl: item.url,
          uploadedUrl: '',
          status: 'queued',
          progress: 0,
          error: '',
          file,
          batchId: uniqueId('migration'),
          batchKind: 'migration',
        };
      }

      return {
        id: item.id || uniqueId('uploaded'),
        name: item.name || 'Uploaded image',
        kind: 'image',
        previewUrl: item.url,
        uploadedUrl: item.url,
        status: 'uploaded',
        progress: 100,
        error: '',
      };
    });
    safeSetItems(nextItems);
  }, [clear, safeSetItems]);

  const remove = useCallback((id: string) => {
    activeUploadsRef.current[id]?.();
    delete activeUploadsRef.current[id];
    startedUploadsRef.current.delete(id);

    safeSetItems(current => {
      const target = current.find(item => item.id === id);
      if (target) revokeItemPreview(target);
      return current.filter(item => item.id !== id);
    });
  }, [safeSetItems]);

  const retry = useCallback((id: string) => {
    startedUploadsRef.current.delete(id);
    safeSetItems(current => current.map(item => (
      item.id === id && item.file
        ? { ...item, status: 'queued', progress: 0, error: '' }
        : item
    )));
  }, [safeSetItems]);

  const startUpload = useCallback(async (item: EventMediaUploadItem) => {
    if (!item.file || startedUploadsRef.current.has(item.id)) return;
    startedUploadsRef.current.add(item.id);
    safeSetItems(current => current.map(currentItem => (
      currentItem.id === item.id ? { ...currentItem, status: 'uploading', progress: 1, error: '' } : currentItem
    )));

    try {
      const uploadFile = await resizeEventImage(item.file);
      if (!mountedRef.current || !itemsRef.current.some(currentItem => currentItem.id === item.id)) return;
      const upload = uploadImageWithProgress(uploadFile, progress => {
        safeSetItems(current => current.map(currentItem => (
          currentItem.id === item.id ? { ...currentItem, progress } : currentItem
        )));
      });
      activeUploadsRef.current[item.id] = upload.abort;
      const uploadedUrl = await upload.promise;
      delete activeUploadsRef.current[item.id];
      safeSetItems(current => current.map(currentItem => (
        currentItem.id === item.id
          ? { ...currentItem, uploadedUrl, status: 'uploaded', progress: 100, error: '' }
          : currentItem
      )));
    } catch (error) {
      delete activeUploadsRef.current[item.id];
      if (error instanceof DOMException && error.name === 'AbortError') return;
      startedUploadsRef.current.delete(item.id);
      const message = error instanceof Error ? error.message : 'Upload failed.';
      safeSetItems(current => current.map(currentItem => (
        currentItem.id === item.id
          ? { ...currentItem, status: 'failed', progress: 0, error: message || 'Upload failed.' }
          : currentItem
      )));
    }
  }, [safeSetItems]);

  useEffect(() => {
    const uploadingCount = items.filter(item => item.status === 'uploading').length;
    const availableSlots = Math.max(0, concurrency - uploadingCount);
    if (availableSlots === 0) return;

    items
      .filter(item => item.status === 'queued' && item.file && !startedUploadsRef.current.has(item.id))
      .slice(0, availableSlots)
      .forEach(item => void startUpload(item));
  }, [concurrency, items, startUpload]);

  useEffect(() => {
    const byBatch = new Map<string, EventMediaUploadItem[]>();
    items.forEach(item => {
      if (!item.batchId || item.batchKind === 'migration' || item.status === 'rejected') return;
      byBatch.set(item.batchId, [...(byBatch.get(item.batchId) || []), item]);
    });

    byBatch.forEach((batchItems, batchId) => {
      if (completedBatchesRef.current.has(batchId)) return;
      if (batchItems.length === 0) return;
      if (batchItems.every(item => item.status === 'uploaded')) {
        completedBatchesRef.current.add(batchId);
        onBatchUploadedRef.current?.({
          id: batchId,
          kind: batchItems[0].batchKind || 'gallery',
          total: batchItems.length,
        });
      }
    });
  }, [items]);

  const uploadedMedia = useMemo<EventMedia[]>(() => (
    items
      .filter(item => item.status === 'uploaded' && item.uploadedUrl && !containsUnsafeDataImage(item.uploadedUrl))
      .map(item => ({
        id: item.id,
        kind: 'image',
        url: item.uploadedUrl,
        name: item.name,
      }))
  ), [items]);

  const queuedOrUploadingCount = items.filter(item => item.status === 'queued' || item.status === 'uploading').length;
  const failedCount = items.filter(item => item.status === 'failed').length;
  const unsafeCount = items.filter(item => containsUnsafeDataImage(item.uploadedUrl)).length;

  return {
    items,
    uploadedMedia,
    queuedOrUploadingCount,
    failedCount,
    unsafeCount,
    isBusy: queuedOrUploadingCount > 0,
    blocksSave: queuedOrUploadingCount > 0 || failedCount > 0 || unsafeCount > 0,
    selectFiles,
    setExistingMedia,
    setUploadedMedia,
    remove,
    retry,
    clear,
  };
}
