import { APIGatewayProxyEvent, APIGatewayProxyHandler } from 'aws-lambda';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';
import { success, badRequest, forbidden, serverError } from '../../lib/response';
import { getAuthContext, hasRole, requireRole } from '../../lib/auth';
import { parseBody } from '../../lib/parseBody';
import { getRepositories } from '../../lib/repositories';

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
});

interface GenerateUploadUrlBody {
  fileName: string;
  fileType: string;
  folder: 'wrestlers' | 'championships' | 'shows' | 'videos' | 'factions';
}

// Accepted MIME types and the file extension each one is stored under.
const IMAGE_EXTENSIONS = new Map<string, string>([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/gif', 'gif'],
  ['image/webp', 'webp'],
]);

const VIDEO_FOLDER_EXTENSIONS = new Map<string, string>([
  ['video/mp4', 'mp4'],
  ['video/webm', 'webm'],
  ['video/quicktime', 'mov'],
  ...IMAGE_EXTENSIONS,
]);

// Same rule as createVideo: staff, or a wrestler whose player record has
// canUploadVideos set.
async function canUploadToVideosFolder(event: APIGatewayProxyEvent): Promise<boolean> {
  if (process.env.IS_OFFLINE === 'true') return true;

  const auth = getAuthContext(event);
  if (hasRole(auth, 'Admin', 'Moderator')) return true;
  if (!auth.sub) return false;

  const { roster: { players } } = getRepositories();
  const player = await players.findByUserId(auth.sub);
  return Boolean(player?.canUploadVideos);
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

    if (!['wrestlers', 'championships', 'shows', 'videos', 'factions'].includes(body.folder)) {
      return badRequest('folder must be "wrestlers", "championships", "shows", "videos", or "factions"');
    }

    // Validate file type based on folder
    const allowedExtensions = body.folder === 'videos' ? VIDEO_FOLDER_EXTENSIONS : IMAGE_EXTENSIONS;
    const fileExtension = allowedExtensions.get(body.fileType);
    if (!fileExtension) {
      if (body.folder === 'videos') {
        return badRequest('Invalid file type. Only MP4, WebM, MOV video files and JPEG, PNG, GIF, WebP images are allowed for videos');
      }
      return badRequest('Invalid file type. Only JPEG, PNG, GIF, and WebP images are allowed');
    }

    if (body.folder === 'videos' && !(await canUploadToVideosFolder(event))) {
      return forbidden('Your account is not permitted to upload videos');
    }

    // The stored extension follows the validated MIME type, not the client's file name.
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

    // Generate presigned URL valid for 5 minutes. The presigner leaves
    // content-type unsigned by default, so it has to be opted in here for the
    // upload to be held to the validated type.
    const uploadUrl = await getSignedUrl(s3Client, command, {
      expiresIn: 300,
      signableHeaders: new Set(['content-type']),
    });

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
