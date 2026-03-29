import { APIGatewayProxyHandler } from 'aws-lambda';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';
import { success, badRequest, serverError } from '../../lib/response';
import { requireRole } from '../../lib/auth';
import { parseBody } from '../../lib/parseBody';

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
});

interface GenerateUploadUrlBody {
  fileName: string;
  fileType: string;
  folder: 'wrestlers' | 'championships' | 'shows' | 'videos';
}

export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Wrestler');
  if (denied) return denied;

  try {
    const { data: body, error: parseError } = parseBody<GenerateUploadUrlBody>(event);
    if (parseError) return parseError;

    if (!body.fileName || !body.fileType || !body.folder) {
      return badRequest('fileName, fileType, and folder are required');
    }

    if (!['wrestlers', 'championships', 'shows', 'videos'].includes(body.folder)) {
      return badRequest('folder must be "wrestlers", "championships", "shows", or "videos"');
    }

    // Validate file type based on folder
    const imageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    const videoTypes = ['video/mp4', 'video/webm', 'video/quicktime'];
    const allowedTypes = body.folder === 'videos' ? [...videoTypes, ...imageTypes] : imageTypes;
    if (!allowedTypes.includes(body.fileType)) {
      if (body.folder === 'videos') {
        return badRequest('Invalid file type. Only MP4, WebM, MOV video files and JPEG, PNG, GIF, WebP images are allowed for videos');
      }
      return badRequest('Invalid file type. Only JPEG, PNG, GIF, and WebP images are allowed');
    }

    // Generate a unique file key
    const fileExtension = body.fileName.split('.').pop() || 'jpg';
    const fileKey = `${body.folder}/${uuidv4()}.${fileExtension}`;

    const bucketName = process.env.IMAGES_BUCKET;
    if (!bucketName) {
      return serverError('S3 bucket not configured');
    }

    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: fileKey,
      ContentType: body.fileType,
    });

    // Generate presigned URL valid for 5 minutes
    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 });

    // The public URL where the image can be accessed after upload
    const imageUrl = `https://${bucketName}.s3.amazonaws.com/${fileKey}`;

    return success({
      uploadUrl,
      imageUrl,
      fileKey,
    });
  } catch (err) {
    console.error('Error generating upload URL:', err);
    return serverError('Failed to generate upload URL');
  }
};
