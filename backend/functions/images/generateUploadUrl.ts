import { APIGatewayProxyHandler } from 'aws-lambda';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';
import { success, badRequest, serverError } from '../../lib/response';
import { requireRole } from '../../lib/auth';

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
});

interface GenerateUploadUrlBody {
  fileName: string;
  fileType: string;
  folder: 'wrestlers' | 'championships';
}

export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Wrestler');
  if (denied) return denied;

  try {
    if (!event.body) {
      return badRequest('Request body is required');
    }

    const body: GenerateUploadUrlBody = JSON.parse(event.body);

    if (!body.fileName || !body.fileType || !body.folder) {
      return badRequest('fileName, fileType, and folder are required');
    }

    if (!['wrestlers', 'championships'].includes(body.folder)) {
      return badRequest('folder must be either "wrestlers" or "championships"');
    }

    // Validate file type (only allow images)
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(body.fileType)) {
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
