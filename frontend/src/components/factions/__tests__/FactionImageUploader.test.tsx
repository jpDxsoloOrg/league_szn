import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { mockGenerateUploadUrl, mockUploadToS3, mockFactionsUpdate } = vi.hoisted(() => ({
  mockGenerateUploadUrl: vi.fn(),
  mockUploadToS3: vi.fn(),
  mockFactionsUpdate: vi.fn(),
}));

vi.mock('../../../services/api', () => ({
  imagesApi: {
    generateUploadUrl: mockGenerateUploadUrl,
    uploadToS3: mockUploadToS3,
  },
  factionsApi: { update: mockFactionsUpdate },
}));

const interpolatingT = (_key: string, fallback?: string, options?: Record<string, unknown>) => {
  let text = fallback ?? _key;
  if (options) {
    for (const [name, value] of Object.entries(options)) {
      text = text.replace(new RegExp(`{{\\s*${name}\\s*}}`, 'g'), String(value));
    }
  }
  return text;
};
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: interpolatingT }),
}));

vi.mock('../FactionImageUploader.css', () => ({}));

import FactionImageUploader from '../FactionImageUploader';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('FactionImageUploader (FAC-03 follow-up)', () => {
  it('round-trips a PNG: presigned URL → S3 upload → factionsApi.update → onUploaded', async () => {
    mockGenerateUploadUrl.mockResolvedValueOnce({
      uploadUrl: 'https://s3/put',
      imageUrl: 'https://s3/public/image.png',
    });
    mockUploadToS3.mockResolvedValueOnce(undefined);
    mockFactionsUpdate.mockResolvedValueOnce(undefined);

    const onUploaded = vi.fn();
    render(
      <FactionImageUploader
        stableId="fac-1"
        factionName="The Brood"
        onUploaded={onUploaded}
      />,
    );

    const fileInput = screen.getByLabelText('Upload faction image') as HTMLInputElement;
    const file = new File(['png-bytes'], 'banner.png', { type: 'image/png' });
    await userEvent.upload(fileInput, file);

    await waitFor(() => {
      expect(mockGenerateUploadUrl).toHaveBeenCalledWith('banner.png', 'image/png', 'factions');
      expect(mockUploadToS3).toHaveBeenCalledWith('https://s3/put', file);
      expect(mockFactionsUpdate).toHaveBeenCalledWith('fac-1', {
        imageUrl: 'https://s3/public/image.png',
      });
      expect(onUploaded).toHaveBeenCalledWith('https://s3/public/image.png');
    });
  });

  it('rejects unsupported file types and skips the network', async () => {
    const onUploaded = vi.fn();
    render(
      <FactionImageUploader
        stableId="fac-1"
        factionName="The Brood"
        onUploaded={onUploaded}
      />,
    );

    const fileInput = screen.getByLabelText('Upload faction image') as HTMLInputElement;
    const bogus = new File(['data'], 'evil.txt', { type: 'text/plain' });
    // The input's `accept` attr also blocks non-image files at the browser
    // level; bypass it here so we can exercise the runtime guard inside
    // handleFileChange specifically.
    await userEvent.upload(fileInput, bogus, { applyAccept: false });

    expect(await screen.findByRole('alert')).toHaveTextContent(/Upload failed/);
    expect(mockGenerateUploadUrl).not.toHaveBeenCalled();
    expect(mockFactionsUpdate).not.toHaveBeenCalled();
    expect(onUploaded).not.toHaveBeenCalled();
  });

  it('surfaces an error if the network upload fails', async () => {
    mockGenerateUploadUrl.mockResolvedValueOnce({
      uploadUrl: 'https://s3/put',
      imageUrl: 'https://s3/public/image.png',
    });
    mockUploadToS3.mockRejectedValueOnce(new Error('Network is down'));

    const onUploaded = vi.fn();
    render(
      <FactionImageUploader
        stableId="fac-1"
        factionName="The Brood"
        onUploaded={onUploaded}
      />,
    );

    const fileInput = screen.getByLabelText('Upload faction image') as HTMLInputElement;
    const file = new File(['bytes'], 'banner.png', { type: 'image/png' });
    await userEvent.upload(fileInput, file);

    expect(await screen.findByRole('alert')).toHaveTextContent(/Upload failed/);
    expect(mockFactionsUpdate).not.toHaveBeenCalled();
    expect(onUploaded).not.toHaveBeenCalled();
  });
});
