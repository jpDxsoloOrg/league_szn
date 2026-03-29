import { API_BASE_URL, fetchWithAuth } from './apiClient';

export const imagesApi = {
  generateUploadUrl: async (
    fileName: string,
    fileType: string,
    folder: 'wrestlers' | 'championships' | 'shows' | 'videos'
  ): Promise<{ uploadUrl: string; imageUrl: string; fileKey: string }> => {
    return fetchWithAuth(`${API_BASE_URL}/images/upload-url`, {
      method: 'POST',
      body: JSON.stringify({ fileName, fileType, folder }),
    });
  },

  uploadToS3: async (uploadUrl: string, file: File): Promise<void> => {
    const response = await fetch(uploadUrl, {
      method: 'PUT',
      body: file,
      headers: {
        'Content-Type': file.type,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to upload image');
    }
  },

  uploadVideoToS3: async (uploadUrl: string, file: File): Promise<void> => {
    const response = await fetch(uploadUrl, {
      method: 'PUT',
      body: file,
      headers: {
        'Content-Type': file.type,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to upload video');
    }
  },
};
