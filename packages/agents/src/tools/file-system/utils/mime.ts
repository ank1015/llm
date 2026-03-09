import { open } from 'node:fs/promises';

import { fileTypeFromBuffer } from 'file-type';

const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const PDF_SIGNATURE = Buffer.from('%PDF-');

const FILE_TYPE_SNIFF_BYTES = 4100;

export async function detectSupportedBinaryMimeTypeFromBuffer(
  buffer: Buffer
): Promise<string | null> {
  if (
    buffer.length >= PDF_SIGNATURE.length &&
    buffer.subarray(0, PDF_SIGNATURE.length).equals(PDF_SIGNATURE)
  ) {
    return 'application/pdf';
  }

  const fileType = await fileTypeFromBuffer(buffer);
  if (!fileType) {
    return null;
  }

  if (!IMAGE_MIME_TYPES.has(fileType.mime)) {
    return null;
  }

  return fileType.mime;
}

export async function detectSupportedImageMimeTypeFromFile(
  filePath: string
): Promise<string | null> {
  const fileHandle = await open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(FILE_TYPE_SNIFF_BYTES);
    const { bytesRead } = await fileHandle.read(buffer, 0, FILE_TYPE_SNIFF_BYTES, 0);
    if (bytesRead === 0) {
      return null;
    }

    const fileType = await fileTypeFromBuffer(buffer.subarray(0, bytesRead));
    if (!fileType) {
      return null;
    }

    if (!IMAGE_MIME_TYPES.has(fileType.mime)) {
      return null;
    }

    return fileType.mime;
  } finally {
    await fileHandle.close();
  }
}
